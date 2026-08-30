import { randomBytes } from "node:crypto";
import type { WebSocket } from "ws";
import {
  M4_AMBIENT,
  MAP,
  MAX_PLAYERS_PER_ROOM,
  PLAYER,
  PLAYER_COLORS,
  SPAWN_OFFSETS,
  SPAWN_POSITION,
  TICK_MS,
  ZOMBIE_DEFS,
  applyPlayerMovement,
  clampPitch,
  distXZ,
  getSolidAabbs,
  moveToward,
  type PlayerSnapshot,
  type ServerMessage,
  type ZombieSnapshot,
  type ZombieTypeId,
} from "@coop/shared";

export type RoomPlayer = {
  id: string;
  name: string;
  color: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  forward: number;
  strafe: number;
  hp: number;
  maxHp: number;
  iFrames: number;
  ws: WebSocket;
};

export type RoomZombie = {
  id: string;
  kind: ZombieTypeId;
  x: number;
  y: number;
  z: number;
  yaw: number;
  hp: number;
  attackCd: number;
};

function send(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function makeCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += alphabet[bytes[i]! % alphabet.length];
  }
  return code;
}

let nextPlayerSeq = 1;
let nextZombieSeq = 1;

function edgeSpawn(): { x: number; z: number } {
  const half = MAP.halfExtent - 4;
  const side = Math.floor(Math.random() * 4);
  if (side === 0) return { x: -half + Math.random() * half * 2, z: -half };
  if (side === 1) return { x: -half + Math.random() * half * 2, z: half };
  if (side === 2) return { x: -half, z: -half + Math.random() * half * 2 };
  return { x: half, z: -half + Math.random() * half * 2 };
}

/** Near buildings so M4 players meet walkers without a long trek. */
function nearTownSpawn(): { x: number; z: number } {
  const angle = Math.random() * Math.PI * 2;
  const dist = 12 + Math.random() * 10;
  return { x: Math.cos(angle) * dist, z: Math.sin(angle) * dist };
}

export class Room {
  readonly code: string;
  readonly players = new Map<string, RoomPlayer>();
  readonly zombies = new Map<string, RoomZombie>();
  private tick = 0;
  private respawnAcc = 0;
  private readonly solids = getSolidAabbs();
  private readonly timer: ReturnType<typeof setInterval>;
  private onEmpty: ((code: string) => void) | null = null;

  constructor(code?: string) {
    this.code = code ?? makeCode();
    this.seedAmbientWalkers(M4_AMBIENT.count);
    this.timer = setInterval(() => this.step(), TICK_MS);
  }

  setEmptyHandler(handler: (code: string) => void): void {
    this.onEmpty = handler;
  }

  get size(): number {
    return this.players.size;
  }

  addPlayer(ws: WebSocket, name: string): RoomPlayer | null {
    if (this.players.size >= MAX_PLAYERS_PER_ROOM) return null;

    const slot = this.players.size;
    const offset = SPAWN_OFFSETS[slot] ?? SPAWN_OFFSETS[0]!;
    const id = `p${nextPlayerSeq++}`;
    const player: RoomPlayer = {
      id,
      name: name.trim().slice(0, 16) || `Player ${slot + 1}`,
      color: PLAYER_COLORS[slot % PLAYER_COLORS.length]!,
      x: SPAWN_POSITION.x + offset.x,
      y: 0,
      z: SPAWN_POSITION.z + offset.z,
      yaw: 0,
      pitch: 0,
      forward: 0,
      strafe: 0,
      hp: PLAYER.maxHp,
      maxHp: PLAYER.maxHp,
      iFrames: PLAYER.respawnIFrames,
      ws,
    };
    this.players.set(id, player);
    return player;
  }

  removePlayer(playerId: string): void {
    this.players.delete(playerId);
    this.broadcast({ type: "playerLeft", playerId });
    if (this.players.size === 0) {
      this.dispose();
      this.onEmpty?.(this.code);
    }
  }

  setInput(
    playerId: string,
    input: { forward: number; strafe: number; yaw: number; pitch: number },
  ): void {
    const player = this.players.get(playerId);
    if (!player) return;
    player.forward = Math.max(-1, Math.min(1, input.forward));
    player.strafe = Math.max(-1, Math.min(1, input.strafe));
    player.yaw = input.yaw;
    player.pitch = clampPitch(input.pitch);
  }

  snapshotPlayers(): PlayerSnapshot[] {
    return [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      x: p.x,
      y: p.y,
      z: p.z,
      yaw: p.yaw,
      pitch: p.pitch,
      color: p.color,
      hp: p.hp,
      maxHp: p.maxHp,
    }));
  }

  snapshotZombies(): ZombieSnapshot[] {
    return [...this.zombies.values()].map((z) => ({
      id: z.id,
      kind: z.kind,
      x: z.x,
      y: z.y,
      z: z.z,
      yaw: z.yaw,
      hp: z.hp,
    }));
  }

  broadcast(message: ServerMessage, exceptId?: string): void {
    for (const player of this.players.values()) {
      if (player.id === exceptId) continue;
      send(player.ws, message);
    }
  }

  dispose(): void {
    clearInterval(this.timer);
  }

  private seedAmbientWalkers(count: number): void {
    const near = Math.min(4, count);
    for (let i = 0; i < near; i++) {
      this.spawnZombie("walker", "near");
    }
    for (let i = near; i < count; i++) {
      this.spawnZombie("walker", "edge");
    }
  }

  private spawnZombie(kind: ZombieTypeId, where: "edge" | "near" = "edge"): void {
    const def = ZOMBIE_DEFS[kind];
    const pos = where === "near" ? nearTownSpawn() : edgeSpawn();
    const id = `z${nextZombieSeq++}`;
    this.zombies.set(id, {
      id,
      kind,
      x: pos.x,
      y: 0,
      z: pos.z,
      yaw: 0,
      hp: def.maxHp,
      attackCd: 0,
    });
  }

  private nearestPlayer(x: number, z: number, range: number): RoomPlayer | null {
    let best: RoomPlayer | null = null;
    let bestDist = range;
    for (const player of this.players.values()) {
      if (player.hp <= 0) continue;
      const d = distXZ(x, z, player.x, player.z);
      if (d < bestDist) {
        bestDist = d;
        best = player;
      }
    }
    return best;
  }

  private hurtPlayer(player: RoomPlayer, damage: number): void {
    if (player.iFrames > 0 || player.hp <= 0) return;
    player.hp = Math.max(0, player.hp - damage);
    player.iFrames = PLAYER.hurtIFrames;
    if (player.hp <= 0) {
      this.respawnPlayer(player);
    }
  }

  private respawnPlayer(player: RoomPlayer): void {
    const slot = Math.min(this.players.size - 1, SPAWN_OFFSETS.length - 1);
    const offset = SPAWN_OFFSETS[Math.max(0, slot)] ?? SPAWN_OFFSETS[0]!;
    player.x = SPAWN_POSITION.x + offset.x;
    player.z = SPAWN_POSITION.z + offset.z;
    player.y = 0;
    player.hp = player.maxHp;
    player.iFrames = PLAYER.respawnIFrames;
    player.forward = 0;
    player.strafe = 0;
  }

  private step(): void {
    const dt = TICK_MS / 1000;
    this.tick += 1;

    for (const player of this.players.values()) {
      if (player.iFrames > 0) {
        player.iFrames = Math.max(0, player.iFrames - dt);
      }

      const moved = applyPlayerMovement(
        player.x,
        player.z,
        player.yaw,
        player.forward,
        player.strafe,
        dt,
        this.solids,
        PLAYER.radius,
        PLAYER.moveSpeed,
      );
      player.x = moved.x;
      player.z = moved.z;
    }

    for (const zombie of this.zombies.values()) {
      const def = ZOMBIE_DEFS[zombie.kind];
      if (zombie.attackCd > 0) {
        zombie.attackCd = Math.max(0, zombie.attackCd - dt);
      }

      const target = this.nearestPlayer(zombie.x, zombie.z, def.aggroRange);
      if (!target) continue;

      const dist = distXZ(zombie.x, zombie.z, target.x, target.z);
      if (dist > def.attackRange * 0.85) {
        const moved = moveToward(
          zombie.x,
          zombie.z,
          target.x,
          target.z,
          def.speed,
          dt,
          def.radius,
          this.solids,
        );
        zombie.x = moved.x;
        zombie.z = moved.z;
        zombie.yaw = moved.yaw;
      } else {
        zombie.yaw = Math.atan2(target.x - zombie.x, -(target.z - zombie.z));
        if (zombie.attackCd <= 0) {
          this.hurtPlayer(target, def.damage);
          zombie.attackCd = def.attackCooldown;
        }
      }
    }

    // Keep a sidewalk presence without combat kills yet.
    if (this.zombies.size < M4_AMBIENT.minAlive) {
      this.respawnAcc += dt;
      if (this.respawnAcc >= M4_AMBIENT.respawnDelaySec) {
        this.respawnAcc = 0;
        this.spawnZombie("walker");
      }
    } else {
      this.respawnAcc = 0;
    }

    const players = this.snapshotPlayers();
    const zombies = this.snapshotZombies();
    for (const player of this.players.values()) {
      send(player.ws, {
        type: "snapshot",
        tick: this.tick,
        you: player.id,
        players,
        zombies,
      });
    }
  }
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly bySocket = new Map<WebSocket, { room: Room; playerId: string }>();

  create(ws: WebSocket, name: string): { room: Room; player: RoomPlayer } | { error: string } {
    if (this.bySocket.has(ws)) return { error: "Already in a room" };

    let room: Room;
    let attempts = 0;
    do {
      room = new Room();
      attempts += 1;
    } while (this.rooms.has(room.code) && attempts < 10);

    room.setEmptyHandler((code) => this.rooms.delete(code));
    const player = room.addPlayer(ws, name);
    if (!player) return { error: "Failed to create room" };

    this.rooms.set(room.code, room);
    this.bySocket.set(ws, { room, playerId: player.id });
    return { room, player };
  }

  join(
    ws: WebSocket,
    code: string,
    name: string,
  ): { room: Room; player: RoomPlayer } | { error: string } {
    if (this.bySocket.has(ws)) return { error: "Already in a room" };

    const room = this.rooms.get(code.trim().toUpperCase());
    if (!room) return { error: "Room not found" };

    const player = room.addPlayer(ws, name);
    if (!player) return { error: "Room is full (max 4)" };

    this.bySocket.set(ws, { room, playerId: player.id });
    return { room, player };
  }

  handleInput(
    ws: WebSocket,
    input: { forward: number; strafe: number; yaw: number; pitch: number },
  ): void {
    const binding = this.bySocket.get(ws);
    if (!binding) return;
    binding.room.setInput(binding.playerId, input);
  }

  disconnect(ws: WebSocket): void {
    const binding = this.bySocket.get(ws);
    if (!binding) return;
    this.bySocket.delete(ws);
    binding.room.removePlayer(binding.playerId);
  }
}
