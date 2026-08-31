import { randomBytes } from "node:crypto";
import type { WebSocket } from "ws";
import {
  COMBAT,
  INV,
  ITEMS,
  LOOT_SPOTS,
  M4_AMBIENT,
  MAX_PLAYERS_PER_ROOM,
  PLAYER,
  PLAYER_COLORS,
  SPAWN_OFFSETS,
  SPAWN_POSITION,
  STORAGE_POS,
  TICK_MS,
  WEAPONS,
  ZOMBIE_DEFS,
  applyPlayerMovement,
  applyVerticalMovement,
  clampPitch,
  clampToZombiePen,
  cloneSlots,
  consumeItem,
  countItem,
  distXZ,
  emptySlots,
  eyePosition,
  firstWallHit,
  getSolidAabbs,
  inMeleeCone,
  lookDirection,
  moveSlots,
  moveToward,
  quickMoveInto,
  randomPointInZombiePen,
  raycastCapsuleXZ,
  rollLootStacks,
  startingHotbar,
  startingInventory,
  type GameEvent,
  type LootNodeSnapshot,
  type PlayerSnapshot,
  type ServerMessage,
  type Slot,
  type SlotRef,
  type WeaponId,
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
  vy: number;
  grounded: boolean;
  yaw: number;
  pitch: number;
  forward: number;
  strafe: number;
  hp: number;
  maxHp: number;
  hotbar: Slot[];
  inventory: Slot[];
  selectedSlot: number;
  downed: boolean;
  bleedout: number;
  iFrames: number;
  weaponCd: number;
  shootQueued: boolean;
  meleeQueued: boolean;
  jumpQueued: boolean;
  interactHeld: boolean;
  sprinting: boolean;
  reviveTargetId: string | null;
  reviveProgress: number;
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
  penned: boolean;
};

type RoomLootNode = {
  id: string;
  label: string;
  x: number;
  z: number;
  opened: boolean;
  slots: Slot[];
  table: (typeof LOOT_SPOTS)[number]["table"];
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

function isWeaponId(id: string): id is WeaponId {
  return id in WEAPONS;
}

let nextPlayerSeq = 1;
let nextZombieSeq = 1;

export class Room {
  readonly code: string;
  readonly players = new Map<string, RoomPlayer>();
  readonly zombies = new Map<string, RoomZombie>();
  readonly lootNodes = new Map<string, RoomLootNode>();
  storage: Slot[] = emptySlots(INV.storageSize);
  private tick = 0;
  private respawnAcc = 0;
  private readonly solids = getSolidAabbs();
  private readonly timer: ReturnType<typeof setInterval>;
  private onEmpty: ((code: string) => void) | null = null;
  private tickEvents: GameEvent[] = [];

  constructor(code?: string) {
    this.code = code ?? makeCode();
    this.seedLootNodes();
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
      vy: 0,
      grounded: true,
      yaw: 0,
      pitch: 0,
      forward: 0,
      strafe: 0,
      hp: PLAYER.maxHp,
      maxHp: PLAYER.maxHp,
      hotbar: startingHotbar(),
      inventory: startingInventory(),
      selectedSlot: 0,
      downed: false,
      bleedout: 0,
      iFrames: PLAYER.respawnIFrames,
      weaponCd: 0,
      shootQueued: false,
      meleeQueued: false,
      jumpQueued: false,
      interactHeld: false,
      sprinting: false,
      reviveTargetId: null,
      reviveProgress: 0,
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
    input: {
      forward: number;
      strafe: number;
      yaw: number;
      pitch: number;
      shoot?: boolean;
      melee?: boolean;
      interact?: boolean;
      jump?: boolean;
      selectedSlot?: number;
      sprint?: boolean;
    },
  ): void {
    const player = this.players.get(playerId);
    if (!player) return;
    player.forward = Math.max(-1, Math.min(1, input.forward));
    player.strafe = Math.max(-1, Math.min(1, input.strafe));
    player.yaw = input.yaw;
    player.pitch = clampPitch(input.pitch);
    if (input.shoot) player.shootQueued = true;
    if (input.melee) player.meleeQueued = true;
    if (input.jump) player.jumpQueued = true;
    player.interactHeld = Boolean(input.interact);
    player.sprinting = Boolean(input.sprint) && !player.downed;
    if (typeof input.selectedSlot === "number") {
      player.selectedSlot = Math.max(0, Math.min(INV.hotbarSize - 1, input.selectedSlot));
    }
  }

  openLoot(playerId: string, lootId: string): void {
    const player = this.players.get(playerId);
    const node = this.lootNodes.get(lootId);
    if (!player || !node || player.downed) return;
    if (distXZ(player.x, player.z, node.x, node.z) > INV.interactRange) return;
    if (!node.opened) {
      const stacks = rollLootStacks(node.table);
      node.slots = stacks.map((s) => ({ id: s.id, count: s.count }));
      node.opened = true;
      this.tickEvents.push({ kind: "lootOpen", playerId, spotId: lootId });
    }
  }

  invMove(playerId: string, from: SlotRef, to: SlotRef): void {
    const player = this.players.get(playerId);
    if (!player || player.downed) return;

    const fromBag = this.resolveBag(player, from);
    const toBag = this.resolveBag(player, to);
    if (!fromBag || !toBag) return;

    // Near-check when touching storage / loot
    if (from.bag === "storage" || to.bag === "storage") {
      if (distXZ(player.x, player.z, STORAGE_POS.x, STORAGE_POS.z) > INV.storageRange) return;
    }
    if (from.bag === "loot" || to.bag === "loot") {
      const lootId = from.lootId ?? to.lootId;
      const node = lootId ? this.lootNodes.get(lootId) : null;
      if (!node || distXZ(player.x, player.z, node.x, node.z) > INV.interactRange) return;
    }

    moveSlots(fromBag, from.index, toBag, to.index);
  }

  invQuickMove(
    playerId: string,
    from: SlotRef,
    prefer: "player" | "container",
    containerLootId?: string,
  ): void {
    const player = this.players.get(playerId);
    if (!player || player.downed) return;

    const fromBag = this.resolveBag(player, from);
    if (!fromBag) return;

    if (from.bag === "storage") {
      if (distXZ(player.x, player.z, STORAGE_POS.x, STORAGE_POS.z) > INV.storageRange) return;
    }
    if (from.bag === "loot") {
      const node = from.lootId ? this.lootNodes.get(from.lootId) : null;
      if (!node || distXZ(player.x, player.z, node.x, node.z) > INV.interactRange) return;
    }

    let destinations: Slot[][];

    if (prefer === "player") {
      if (from.bag === "hotbar") {
        destinations = [player.inventory];
      } else if (from.bag === "inv") {
        destinations = [player.hotbar];
      } else {
        // From chest/loot → inventory rows first, then hotbar
        destinations = [player.inventory, player.hotbar];
      }
    } else if (containerLootId) {
      const node = this.lootNodes.get(containerLootId);
      if (!node || distXZ(player.x, player.z, node.x, node.z) > INV.interactRange) return;
      destinations = [node.slots];
    } else {
      if (distXZ(player.x, player.z, STORAGE_POS.x, STORAGE_POS.z) > INV.storageRange) return;
      destinations = [this.storage];
    }

    quickMoveInto(fromBag, from.index, destinations);
  }

  handleDevCommand(playerId: string, line: string): { ok: boolean; message: string } {
    const player = this.players.get(playerId);
    if (!player) return { ok: false, message: "Not in room" };

    const raw = line.trim().replace(/^\//, "");
    if (!raw) return { ok: false, message: "Empty command" };
    const parts = raw.split(/\s+/);
    const cmd = parts[0]?.toLowerCase() ?? "";

    if (cmd === "spawn" && parts[1]?.toLowerCase() === "zombie") {
      const kindRaw = (parts[2] ?? "walker").toLowerCase();
      const kind: ZombieTypeId =
        kindRaw === "runner" || kindRaw === "bruiser" || kindRaw === "walker"
          ? kindRaw
          : "walker";
      const origin = eyePosition(player.x, player.y, player.z);
      const dir = lookDirection(player.yaw, player.pitch);
      const wallT = firstWallHit(origin, dir, 40, this.solids);
      const dist = wallT !== null ? Math.max(1.5, wallT - 0.6) : 6;
      const x = origin.x + dir.x * dist;
      const z = origin.z + dir.z * dist;
      this.spawnZombieAt(kind, x, z, false);
      return { ok: true, message: `Spawned ${kind} at look point (~${dist.toFixed(1)}m)` };
    }

    if (cmd === "kill" && parts[1]?.toLowerCase() === "player" && parts[2]) {
      const name = parts.slice(2).join(" ");
      const target = [...this.players.values()].find(
        (p) => p.name.toLowerCase() === name.toLowerCase(),
      );
      if (!target) return { ok: false, message: `No player named "${name}"` };
      if (target.downed) return { ok: false, message: `${target.name} already downed` };
      this.downPlayer(target);
      return { ok: true, message: `Downed ${target.name}` };
    }

    if (
      (cmd === "kill" && parts[1]?.toLowerCase() === "players") ||
      (cmd === "kill" && parts[1]?.toLowerCase() === "all" && parts[2]?.toLowerCase() === "players")
    ) {
      let n = 0;
      for (const p of this.players.values()) {
        if (p.id === playerId || p.downed) continue;
        this.downPlayer(p);
        n += 1;
      }
      return { ok: true, message: `Downed ${n} other player(s)` };
    }

    if (cmd === "kill" && parts[1]?.toLowerCase() === "zombies") {
      if (!parts[2]) {
        return {
          ok: false,
          message: "Usage: kill zombies <n> | kill zombies all | kill all zombies",
        };
      }
      if (parts[2].toLowerCase() === "all") {
        const n = this.zombies.size;
        this.zombies.clear();
        return { ok: true, message: `Killed all zombies (${n})` };
      }
      const n = Math.max(0, Math.floor(Number(parts[2])));
      if (!Number.isFinite(n)) {
        return { ok: false, message: "Usage: kill zombies <n>" };
      }
      const killed = this.killRandomZombies(n);
      return { ok: true, message: `Killed ${killed} zombie(s)` };
    }

    if (cmd === "kill" && parts[1]?.toLowerCase() === "all" && parts[2]?.toLowerCase() === "zombies") {
      const n = this.zombies.size;
      this.zombies.clear();
      return { ok: true, message: `Killed all zombies (${n})` };
    }

    if (cmd === "help") {
      return {
        ok: true,
        message:
          "spawn zombie [walker|runner|bruiser] | kill player <name> | kill players | kill zombies <n> | kill all zombies",
      };
    }

    return { ok: false, message: `Unknown command. Type help` };
  }

  snapshotPlayers(): PlayerSnapshot[] {
    const beingRevived = new Set<string>();
    for (const p of this.players.values()) {
      if (p.reviveTargetId && p.reviveProgress > 0) {
        beingRevived.add(p.reviveTargetId);
      }
    }

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
      ammo: countItem(p.hotbar, "ammo") + countItem(p.inventory, "ammo"),
      hotbar: cloneSlots(p.hotbar),
      inventory: cloneSlots(p.inventory),
      selectedSlot: p.selectedSlot,
      downed: p.downed,
      bleedout: p.bleedout,
      reviveProgress: Math.min(1, p.reviveProgress / COMBAT.reviveDuration),
      beingRevived: beingRevived.has(p.id),
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

  snapshotLootNodes(): LootNodeSnapshot[] {
    return [...this.lootNodes.values()].map((n) => ({
      id: n.id,
      label: n.label,
      x: n.x,
      z: n.z,
      opened: n.opened,
      slots: cloneSlots(n.slots),
    }));
  }

  snapshotStorage(): Slot[] {
    return cloneSlots(this.storage);
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

  private resolveBag(player: RoomPlayer, ref: SlotRef): Slot[] | null {
    switch (ref.bag) {
      case "hotbar":
        return player.hotbar;
      case "inv":
        return player.inventory;
      case "storage":
        return this.storage;
      case "loot": {
        if (!ref.lootId) return null;
        const node = this.lootNodes.get(ref.lootId);
        return node?.opened ? node.slots : null;
      }
      default:
        return null;
    }
  }

  private seedLootNodes(): void {
    for (const spot of LOOT_SPOTS) {
      this.lootNodes.set(spot.id, {
        id: spot.id,
        label: spot.label,
        x: spot.x,
        z: spot.z,
        opened: false,
        slots: [],
        table: spot.table,
      });
    }
  }

  private seedAmbientWalkers(count: number): void {
    for (let i = 0; i < count; i++) {
      const pos = randomPointInZombiePen();
      this.spawnZombieAt("walker", pos.x, pos.z, true);
    }
  }

  private spawnZombieAt(kind: ZombieTypeId, x: number, z: number, penned: boolean): void {
    const def = ZOMBIE_DEFS[kind];
    const id = `z${nextZombieSeq++}`;
    const pos = penned ? clampToZombiePen(x, z) : { x, z };
    this.zombies.set(id, {
      id,
      kind,
      x: pos.x,
      y: 0,
      z: pos.z,
      yaw: 0,
      hp: def.maxHp,
      attackCd: 0,
      penned,
    });
  }

  private killRandomZombies(n: number): number {
    const ids = [...this.zombies.keys()];
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = ids[i]!;
      ids[i] = ids[j]!;
      ids[j] = tmp;
    }
    const take = Math.min(n, ids.length);
    for (let i = 0; i < take; i++) {
      this.zombies.delete(ids[i]!);
    }
    return take;
  }

  private nearestPlayer(x: number, z: number, range: number): RoomPlayer | null {
    let best: RoomPlayer | null = null;
    let bestDist = range;
    for (const player of this.players.values()) {
      const d = distXZ(x, z, player.x, player.z);
      const score = player.downed ? d + 8 : d;
      if (score < bestDist) {
        bestDist = score;
        best = player;
      }
    }
    return best;
  }

  private hurtPlayer(player: RoomPlayer, damage: number): void {
    if (player.downed || player.iFrames > 0) return;
    player.hp = Math.max(0, player.hp - damage);
    player.iFrames = PLAYER.hurtIFrames;
    if (player.hp <= 0) this.downPlayer(player);
  }

  private downPlayer(player: RoomPlayer): void {
    player.downed = true;
    player.hp = 0;
    player.bleedout = COMBAT.bleedoutSeconds;
    player.forward = 0;
    player.strafe = 0;
    player.vy = 0;
    player.y = 0;
    player.grounded = true;
    player.shootQueued = false;
    player.meleeQueued = false;
    player.jumpQueued = false;
    player.reviveProgress = 0;
    player.reviveTargetId = null;
    this.tickEvents.push({ kind: "down", playerId: player.id });
  }

  private respawnPlayer(player: RoomPlayer): void {
    const slot = Math.min(Math.max(this.players.size - 1, 0), SPAWN_OFFSETS.length - 1);
    const offset = SPAWN_OFFSETS[slot] ?? SPAWN_OFFSETS[0]!;
    player.x = SPAWN_POSITION.x + offset.x;
    player.z = SPAWN_POSITION.z + offset.z;
    player.y = 0;
    player.vy = 0;
    player.grounded = true;
    player.hp = player.maxHp;
    player.downed = false;
    player.bleedout = 0;
    player.iFrames = PLAYER.respawnIFrames;
    player.forward = 0;
    player.strafe = 0;
    player.reviveProgress = 0;
    player.reviveTargetId = null;
  }

  private selectedItem(player: RoomPlayer): Slot {
    return player.hotbar[player.selectedSlot] ?? null;
  }

  private damageZombie(zombie: RoomZombie, amount: number, by: string): boolean {
    zombie.hp -= amount;
    if (zombie.hp <= 0) {
      this.zombies.delete(zombie.id);
      this.tickEvents.push({ kind: "kill", zombieId: zombie.id, by });
      return true;
    }
    return false;
  }

  private tryShoot(player: RoomPlayer): void {
    const stack = this.selectedItem(player);
    if (!stack || ITEMS[stack.id].kind !== "gun" || !isWeaponId(stack.id)) {
      this.tickEvents.push({ kind: "shot", playerId: player.id, hit: false });
      return;
    }
    const gun = WEAPONS[stack.id];
    if (gun.kind !== "gun") {
      this.tickEvents.push({ kind: "shot", playerId: player.id, hit: false });
      return;
    }
    if (player.weaponCd > 0) {
      this.tickEvents.push({ kind: "shot", playerId: player.id, hit: false });
      return;
    }

    const ammoLeft =
      countItem(player.hotbar, "ammo") + countItem(player.inventory, "ammo");
    if (ammoLeft < gun.ammoCost) {
      this.tickEvents.push({ kind: "shot", playerId: player.id, hit: false });
      return;
    }

    let need = gun.ammoCost;
    need = consumeItem(player.hotbar, "ammo", need);
    if (need > 0) consumeItem(player.inventory, "ammo", need);

    player.weaponCd = gun.cooldown;

    const origin = eyePosition(player.x, player.y, player.z);
    const dir = lookDirection(player.yaw, player.pitch);
    const wallT = firstWallHit(origin, dir, gun.range, this.solids);
    const maxT = wallT ?? gun.range;

    let bestId: string | null = null;
    let bestT = maxT;
    for (const zombie of this.zombies.values()) {
      const def = ZOMBIE_DEFS[zombie.kind];
      const t = raycastCapsuleXZ(
        origin,
        dir,
        zombie.x,
        zombie.z,
        def.radius * 1.25,
        0.1,
        def.height + 0.2,
        maxT,
      );
      if (t !== null && t < bestT) {
        bestT = t;
        bestId = zombie.id;
      }
    }

    if (bestId) {
      const zombie = this.zombies.get(bestId);
      if (zombie) this.damageZombie(zombie, gun.damage, player.id);
      this.tickEvents.push({ kind: "shot", playerId: player.id, hit: true });
    } else {
      this.tickEvents.push({ kind: "shot", playerId: player.id, hit: false });
    }
  }

  private tryMelee(player: RoomPlayer): void {
    const stack = this.selectedItem(player);
    let weapon = WEAPONS.fists;
    if (stack && ITEMS[stack.id].kind === "melee" && isWeaponId(stack.id)) {
      weapon = WEAPONS[stack.id];
    }

    if (player.weaponCd > 0) {
      this.tickEvents.push({ kind: "melee", playerId: player.id, hit: false });
      return;
    }
    player.weaponCd = weapon.cooldown;

    let best: RoomZombie | null = null;
    let bestDist = weapon.range;
    for (const zombie of this.zombies.values()) {
      if (
        !inMeleeCone(
          player.x,
          player.z,
          player.yaw,
          zombie.x,
          zombie.z,
          weapon.range,
          weapon.coneDeg ?? 45,
        )
      ) {
        continue;
      }
      const d = distXZ(player.x, player.z, zombie.x, zombie.z);
      if (d < bestDist) {
        bestDist = d;
        best = zombie;
      }
    }

    if (best) {
      this.damageZombie(best, weapon.damage, player.id);
      this.tickEvents.push({ kind: "melee", playerId: player.id, hit: true });
    } else {
      this.tickEvents.push({ kind: "melee", playerId: player.id, hit: false });
    }
  }

  private updateRevive(player: RoomPlayer, dt: number): void {
    if (player.downed || !player.interactHeld) {
      player.reviveProgress = 0;
      player.reviveTargetId = null;
      return;
    }

    let target: RoomPlayer | null = null;
    let best: number = COMBAT.reviveRange;
    for (const other of this.players.values()) {
      if (other.id === player.id || !other.downed) continue;
      const d = distXZ(player.x, player.z, other.x, other.z);
      if (d < best) {
        best = d;
        target = other;
      }
    }

    if (!target) {
      player.reviveProgress = 0;
      player.reviveTargetId = null;
      return;
    }

    if (player.reviveTargetId !== target.id) {
      player.reviveTargetId = target.id;
      player.reviveProgress = 0;
    }

    player.reviveProgress += dt;
    if (player.reviveProgress >= COMBAT.reviveDuration) {
      target.downed = false;
      target.bleedout = 0;
      target.hp = Math.round(target.maxHp * COMBAT.reviveHpFraction);
      target.iFrames = PLAYER.hurtIFrames;
      this.tickEvents.push({ kind: "revive", playerId: target.id, by: player.id });
      player.reviveProgress = 0;
      player.reviveTargetId = null;
    }
  }

  private isActivelyBeingRevived(targetId: string): boolean {
    for (const p of this.players.values()) {
      if (p.id === targetId || p.downed) continue;
      if (p.reviveTargetId === targetId && p.interactHeld && p.reviveProgress > 0) {
        return true;
      }
    }
    return false;
  }

  private step(): void {
    const dt = TICK_MS / 1000;
    this.tick += 1;
    this.tickEvents = [];

    for (const player of this.players.values()) {
      if (player.iFrames > 0) player.iFrames = Math.max(0, player.iFrames - dt);
      if (player.weaponCd > 0) player.weaponCd = Math.max(0, player.weaponCd - dt);

      if (player.downed) {
        player.forward = 0;
        player.strafe = 0;
        player.shootQueued = false;
        player.meleeQueued = false;
        player.jumpQueued = false;
        player.y = 0;
        player.vy = 0;
        player.grounded = true;
        continue;
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
        PLAYER.moveSpeed * (player.sprinting ? PLAYER.sprintMul : 1),
      );
      player.x = moved.x;
      player.z = moved.z;

      const jump = player.jumpQueued;
      player.jumpQueued = false;
      const vert = applyVerticalMovement(player.y, player.vy, jump, dt, player.grounded);
      player.y = vert.y;
      player.vy = vert.vy;
      player.grounded = vert.grounded;

      if (player.shootQueued) {
        player.shootQueued = false;
        this.tryShoot(player);
      }
      if (player.meleeQueued) {
        player.meleeQueued = false;
        this.tryMelee(player);
      }

      this.updateRevive(player, dt);
    }

    for (const player of this.players.values()) {
      if (!player.downed) continue;
      if (!this.isActivelyBeingRevived(player.id)) {
        player.bleedout -= dt;
      }
      if (player.bleedout <= 0) this.respawnPlayer(player);
    }

    for (const zombie of this.zombies.values()) {
      const def = ZOMBIE_DEFS[zombie.kind];
      if (zombie.attackCd > 0) zombie.attackCd = Math.max(0, zombie.attackCd - dt);

      const target = this.nearestPlayer(zombie.x, zombie.z, def.aggroRange);
      if (target) {
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
          if (zombie.attackCd <= 0 && !target.downed) {
            this.hurtPlayer(target, def.damage);
            zombie.attackCd = def.attackCooldown;
          }
        }
      }

      if (zombie.penned) {
        const c = clampToZombiePen(zombie.x, zombie.z);
        zombie.x = c.x;
        zombie.z = c.z;
      }
    }

    const pennedCount = [...this.zombies.values()].filter((z) => z.penned).length;
    if (pennedCount < M4_AMBIENT.minAlive) {
      this.respawnAcc += dt;
      if (this.respawnAcc >= M4_AMBIENT.respawnDelaySec) {
        this.respawnAcc = 0;
        const pos = randomPointInZombiePen();
        this.spawnZombieAt("walker", pos.x, pos.z, true);
      }
    } else {
      this.respawnAcc = 0;
    }

    const players = this.snapshotPlayers();
    const zombies = this.snapshotZombies();
    const lootNodes = this.snapshotLootNodes();
    const storage = this.snapshotStorage();
    const events = this.tickEvents.length ? this.tickEvents : undefined;
    for (const player of this.players.values()) {
      send(player.ws, {
        type: "snapshot",
        tick: this.tick,
        you: player.id,
        players,
        zombies,
        lootNodes,
        storage,
        events,
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
    input: {
      forward: number;
      strafe: number;
      yaw: number;
      pitch: number;
      shoot?: boolean;
      melee?: boolean;
      interact?: boolean;
      jump?: boolean;
      selectedSlot?: number;
      sprint?: boolean;
    },
  ): void {
    const binding = this.bySocket.get(ws);
    if (!binding) return;
    binding.room.setInput(binding.playerId, input);
  }

  handleOpenLoot(ws: WebSocket, lootId: string): void {
    const binding = this.bySocket.get(ws);
    if (!binding) return;
    binding.room.openLoot(binding.playerId, lootId);
  }

  handleInvMove(ws: WebSocket, from: SlotRef, to: SlotRef): void {
    const binding = this.bySocket.get(ws);
    if (!binding) return;
    binding.room.invMove(binding.playerId, from, to);
  }

  handleInvQuickMove(
    ws: WebSocket,
    from: SlotRef,
    prefer: "player" | "container",
    containerLootId?: string,
  ): void {
    const binding = this.bySocket.get(ws);
    if (!binding) return;
    binding.room.invQuickMove(binding.playerId, from, prefer, containerLootId);
  }

  handleDevCommand(ws: WebSocket, line: string): void {
    const binding = this.bySocket.get(ws);
    if (!binding) {
      send(ws, { type: "devResult", ok: false, message: "Join a room first" });
      return;
    }
    const result = binding.room.handleDevCommand(binding.playerId, line);
    send(ws, { type: "devResult", ok: result.ok, message: result.message });
  }

  disconnect(ws: WebSocket): void {
    const binding = this.bySocket.get(ws);
    if (!binding) return;
    this.bySocket.delete(ws);
    binding.room.removePlayer(binding.playerId);
  }
}
