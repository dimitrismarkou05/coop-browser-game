import { randomBytes } from "node:crypto";
import type { WebSocket } from "ws";
import {
  BASE,
  BASE_LAYOUT,
  COMBAT,
  DEV,
  INV,
  INVASION,
  ITEMS,
  LOOT_SPOTS,
  lootSpotAabbs,
  MAX_PLAYERS_PER_ROOM,
  PLAYER,
  PLAYER_COLORS,
  SPAWN_OFFSETS,
  SPAWN_POSITION,
  STORAGE_POS,
  SURVIVAL,
  STALE_INPUT_MS,
  TICK_HZ,
  TICK_MS,
  WALL_IDS,
  WEAPONS,
  ZOMBIE_DEFS,
  applyPlayerMovement,
  applyVerticalMovement,
  baseFacilityAabbs,
  clampPitch,
  cloneSlots,
  consumeItem,
  countItem,
  distXZ,
  emptySlots,
  eyePosition,
  firstWallHit,
  generatorTierDef,
  getSolidAabbs,
  inMeleeCone,
  invasionSpawnPoint,
  lookDirection,
  moveSlots,
  moveToward,
  prepDurationSec,
  quickMoveInto,
  raycastCapsuleXZ,
  rollLootStacks,
  startingHotbar,
  startingInventory,
  storageTierDef,
  wallAabb,
  wallDoorCenter,
  wallHasDoor,
  wallSolidAabbs,
  wallTierDef,
  warningDurationSec,
  waveSpawns,
  workbenchTierDef,
  yawToward,
  zombieHitCapsule,
  type Aabb,
  type BaseSnapshot,
  type GameEvent,
  type InvasionPhase,
  type InvasionSnapshot,
  type ItemId,
  type LootNodeSnapshot,
  type PlayerSnapshot,
  type ServerMessage,
  type Slot,
  type SlotRef,
  type WallId,
  type WeaponId,
  type WorldPingSnapshot,
  type ZombieSnapshot,
  type ZombieTypeId,
} from "@coop/shared";
import { loadWorld, saveWorld, type WorldCheckpoint } from "../db/worldStore.js";

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
  hunger: number;
  downed: boolean;
  bleedout: number;
  iFrames: number;
  weaponCd: number;
  /** LMB primary: shoot / melee / eat. */
  useQueued: boolean;
  jumpQueued: boolean;
  interactHeld: boolean;
  sprinting: boolean;
  /** ms epoch of last input packet — stale move axes are cleared. */
  lastInputAt: number;
  reviveTargetId: string | null;
  reviveProgress: number;
  ready: boolean;
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

type RoomLootNode = {
  id: string;
  label: string;
  x: number;
  z: number;
  opened: boolean;
  slots: Slot[];
  table: (typeof LOOT_SPOTS)[number]["table"];
};

type RoomWall = {
  id: WallId;
  hp: number;
  tier: number;
  doorOpen: boolean;
};

type RoomPing = {
  id: string;
  x: number;
  y: number;
  z: number;
  by: string;
  color: number;
  ttl: number;
};

const SAVE_INTERVAL_SEC = 15;
const PING_TTL_SEC = 8;
const MAX_WORLD_PINGS = 8;
/** Prefer players over walls unless a wall is this much closer. */
const WALL_PREFER_SLACK = 3;
const WALL_HIT_BRUISER = 12;
const WALL_HIT_OTHER = 4;
const CORE_CHIP_DAMAGE = 5;

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
let nextPingSeq = 1;

export class Room {
  readonly code: string;
  readonly players = new Map<string, RoomPlayer>();
  readonly zombies = new Map<string, RoomZombie>();
  readonly lootNodes = new Map<string, RoomLootNode>();
  storage: Slot[] = emptySlots(storageTierDef(1).slots);

  coreHp: number = BASE.coreMaxHp;
  readonly walls = new Map<WallId, RoomWall>();
  storageTier = 1;
  workbenchTier = 1;
  generatorTier = 1;
  unlocks: string[] = [];

  invasionIndex = 0;
  phase: InvasionPhase = "prep";
  /** Seconds remaining in current phase (prep / warning / resolve) or cleanup during waves. */
  phaseTimer = prepDurationSec(0);
  waveIndex = 0;
  wavesTotal = INVASION.wavesPerInvasion;
  /** Cleanup grace after the last wave is spawned; null until then. */
  private cleanupTimer: number | null = null;

  worldPings: RoomPing[] = [];
  solids: Aabb[] = [];
  private saveAcc = 0;

  private tick = 0;
  private readonly startedAt = Date.now();
  private readonly timer: ReturnType<typeof setInterval>;
  private onEmpty: ((code: string) => void) | null = null;
  private tickEvents: GameEvent[] = [];

  constructor(code?: string, checkpoint?: WorldCheckpoint | null) {
    this.code = (code ?? makeCode()).trim().toUpperCase();

    if (checkpoint) {
      this.restoreFromCheckpoint(checkpoint);
    } else {
      this.initDefaultBase();
    }

    this.seedLootNodes();
    if (checkpoint?.loot) {
      for (const [id, data] of Object.entries(checkpoint.loot)) {
        const node = this.lootNodes.get(id);
        if (!node) continue;
        node.opened = Boolean(data.opened);
        node.slots = cloneSlots(data.slots ?? []);
      }
    }

    // No ambient zombies — they only appear from invasion waves.
    this.rebuildSolids();
    this.timer = setInterval(() => this.step(), TICK_MS);
  }

  setEmptyHandler(handler: (code: string) => void): void {
    this.onEmpty = handler;
  }

  get size(): number {
    return this.players.size;
  }

  private initDefaultBase(): void {
    this.coreHp = BASE.coreMaxHp;
    this.walls.clear();
    for (const id of WALL_IDS) {
      const def = wallTierDef(1);
      this.walls.set(id, { id, hp: def.maxHp, tier: 1, doorOpen: false });
    }
    this.storageTier = 1;
    this.workbenchTier = 1;
    this.generatorTier = 1;
    this.unlocks = [];
    this.storage = emptySlots(storageTierDef(1).slots);
    this.invasionIndex = 0;
    this.phase = "prep";
    this.phaseTimer = prepDurationSec(0);
    this.waveIndex = 0;
    this.wavesTotal = INVASION.wavesPerInvasion;
    this.cleanupTimer = null;
  }

  private restoreFromCheckpoint(cp: WorldCheckpoint): void {
    this.coreHp = cp.coreHp;
    this.walls.clear();
    for (const id of WALL_IDS) {
      const saved = cp.walls.find((w) => w.id === id);
      const tier = saved?.tier ?? 1;
      const def = wallTierDef(tier);
      const hp = saved?.hp ?? def.maxHp;
      this.walls.set(id, {
        id,
        hp,
        tier,
        doorOpen: Boolean(saved?.doorOpen),
      });
    }
    this.storageTier = cp.storageTier;
    this.workbenchTier = cp.workbenchTier;
    this.generatorTier = cp.generatorTier;
    this.unlocks = [...cp.unlocks];
    this.syncWorkbenchUnlocks(false);
    this.storage = cloneSlots(cp.storage);
    this.resizeStorage(storageTierDef(this.storageTier).slots);
    this.invasionIndex = cp.invasionIndex;
    // Never resume mid-wave — always land in full prep.
    this.phase = "prep";
    this.phaseTimer = prepDurationSec(this.invasionIndex);
    this.waveIndex = 0;
    this.wavesTotal = INVASION.wavesPerInvasion;
    this.cleanupTimer = null;
  }

  rebuildSolids(): void {
    const wallBoxes: Aabb[] = [];
    for (const w of this.walls.values()) {
      wallBoxes.push(...wallSolidAabbs(w.id, w.doorOpen, w.hp <= 0));
    }
    this.solids = [
      ...getSolidAabbs(),
      ...wallBoxes,
      ...baseFacilityAabbs(),
      ...lootSpotAabbs(),
    ];
  }

  snapshotBase(): BaseSnapshot {
    return {
      coreHp: this.coreHp,
      coreMaxHp: BASE.coreMaxHp,
      walls: WALL_IDS.map((id) => {
        const w = this.walls.get(id)!;
        const maxHp = wallTierDef(w.tier).maxHp;
        return {
          id,
          hp: w.hp,
          maxHp,
          tier: w.tier,
          broken: w.hp <= 0,
          doorOpen: w.doorOpen,
        };
      }),
      storageTier: this.storageTier,
      workbenchTier: this.workbenchTier,
      generatorTier: this.generatorTier,
      unlocks: [...this.unlocks],
    };
  }

  snapshotInvasion(): InvasionSnapshot {
    let phaseEndsIn = this.phaseTimer;
    if (this.phase === "prep") {
      phaseEndsIn = -1;
    } else if (this.phase === "waves" && this.cleanupTimer !== null) {
      phaseEndsIn = this.cleanupTimer;
    }
    let readyCount = 0;
    for (const p of this.players.values()) {
      if (p.ready) readyCount += 1;
    }
    return {
      phase: this.phase,
      invasionIndex: this.invasionIndex,
      phaseEndsIn,
      waveIndex: this.waveIndex,
      wavesTotal: this.wavesTotal,
      readyCount,
      playerCount: this.players.size,
    };
  }

  snapshotPings(): WorldPingSnapshot[] {
    return this.worldPings.map((p) => ({
      id: p.id,
      x: p.x,
      y: p.y,
      z: p.z,
      by: p.by,
      color: p.color,
      ttl: p.ttl,
    }));
  }

  setReady(playerId: string, ready: boolean): void {
    const player = this.players.get(playerId);
    if (!player || player.downed) return;
    player.ready = ready;
    // Start as soon as everyone is ready (no prep countdown).
    if (
      this.phase === "prep" &&
      this.players.size >= 1 &&
      [...this.players.values()].every((p) => p.ready)
    ) {
      this.enterWarning();
    }
  }

  repairWall(playerId: string, wallId: WallId): void {
    const player = this.players.get(playerId);
    const wall = this.walls.get(wallId);
    if (!player || !wall || player.downed) return;
    if (!this.nearWall(player, wallId)) return;

    const def = wallTierDef(wall.tier);
    const missing = def.maxHp - wall.hp;
    if (missing <= 0) return;

    const woodNeeded = Math.max(1, Math.ceil((missing / def.maxHp) * def.repairWoodFull));
    if (!this.consumeFromPlayer(player, "wood", woodNeeded)) return;

    wall.hp = def.maxHp;
    if (wall.hp > 0) this.rebuildSolids();
    this.tickEvents.push({ kind: "repair", playerId, wallId, hp: wall.hp });
  }

  toggleDoor(playerId: string, wallId: WallId): void {
    const player = this.players.get(playerId);
    const wall = this.walls.get(wallId);
    if (!player || !wall || player.downed) return;
    if (wall.hp <= 0) return;
    if (!wallHasDoor(wallId)) return;
    const door = wallDoorCenter(wallId);
    if (distXZ(player.x, player.z, door.x, door.z) > BASE.doorInteractRange) return;

    wall.doorOpen = !wall.doorOpen;
    this.rebuildSolids();
    this.tickEvents.push({
      kind: "doorToggle",
      wallId,
      open: wall.doorOpen,
      by: playerId,
    });
  }

  upgradeBase(
    playerId: string,
    component: "wall" | "storage" | "workbench" | "generator",
    wallId?: WallId,
  ): void {
    const player = this.players.get(playerId);
    if (!player || player.downed) return;

    if (component === "wall") {
      if (!wallId || !this.walls.has(wallId)) return;
      if (!this.nearWall(player, wallId)) return;
      const wall = this.walls.get(wallId)!;
      const nextTier = wall.tier + 1;
      if (nextTier > 3) return;
      const next = wallTierDef(nextTier);
      const scrapHave =
        countItem(player.hotbar, "scrap") + countItem(player.inventory, "scrap");
      const woodHave =
        countItem(player.hotbar, "wood") + countItem(player.inventory, "wood");
      if (scrapHave < next.upgradeScrap || woodHave < next.upgradeWood) return;
      this.consumeFromPlayer(player, "scrap", next.upgradeScrap);
      this.consumeFromPlayer(player, "wood", next.upgradeWood);
      wall.tier = nextTier;
      wall.hp = next.maxHp;
      this.rebuildSolids();
      this.tickEvents.push({ kind: "upgrade", playerId, component: "wall", tier: nextTier });
      return;
    }

    if (component === "storage") {
      if (distXZ(player.x, player.z, STORAGE_POS.x, STORAGE_POS.z) > BASE.interactRange) return;
      const nextTier = this.storageTier + 1;
      if (nextTier > 3) return;
      const next = storageTierDef(nextTier);
      const scrapHave =
        countItem(player.hotbar, "scrap") + countItem(player.inventory, "scrap");
      const woodHave =
        countItem(player.hotbar, "wood") + countItem(player.inventory, "wood");
      if (scrapHave < next.upgradeScrap || woodHave < next.upgradeWood) return;
      this.consumeFromPlayer(player, "scrap", next.upgradeScrap);
      this.consumeFromPlayer(player, "wood", next.upgradeWood);
      this.storageTier = nextTier;
      this.resizeStorage(next.slots);
      this.tickEvents.push({ kind: "upgrade", playerId, component: "storage", tier: nextTier });
      return;
    }

    if (component === "workbench") {
      const wb = BASE_LAYOUT.workbench;
      if (distXZ(player.x, player.z, wb.x, wb.z) > BASE.interactRange) return;
      const nextTier = this.workbenchTier + 1;
      if (nextTier > 3) return;
      const next = workbenchTierDef(nextTier);
      if (!this.consumeFromPlayer(player, "scrap", next.upgradeScrap)) return;
      this.workbenchTier = nextTier;
      for (const unlock of next.unlocks) {
        if (!this.unlocks.includes(unlock)) {
          this.unlocks.push(unlock);
          this.tickEvents.push({ kind: "unlock", unlock });
        }
      }
      this.tickEvents.push({ kind: "upgrade", playerId, component: "workbench", tier: nextTier });
      return;
    }

    if (component === "generator") {
      const gen = BASE_LAYOUT.generator;
      if (distXZ(player.x, player.z, gen.x, gen.z) > BASE.interactRange) return;
      const nextTier = this.generatorTier + 1;
      if (nextTier > 3) return;
      const next = generatorTierDef(nextTier);
      if (!this.consumeFromPlayer(player, "scrap", next.upgradeScrap)) return;
      this.generatorTier = nextTier;
      this.tickEvents.push({ kind: "upgrade", playerId, component: "generator", tier: nextTier });
    }
  }

  craft(playerId: string, recipe: "shotgun"): void {
    const player = this.players.get(playerId);
    if (!player || player.downed) return;
    if (recipe !== "shotgun") return;
    if (!this.unlocks.includes("shotgun")) return;

    const wb = BASE_LAYOUT.workbench;
    if (distXZ(player.x, player.z, wb.x, wb.z) > BASE.interactRange) return;

    const scrapHave =
      countItem(player.hotbar, "scrap") + countItem(player.inventory, "scrap");
    const woodHave =
      countItem(player.hotbar, "wood") + countItem(player.inventory, "wood");
    if (scrapHave < BASE.shotgunCraftScrap || woodHave < BASE.shotgunCraftWood) return;

    // Ensure space for the shotgun before consuming.
    const probeLeft = this.depositIntoBags(
      [cloneSlots(player.hotbar), cloneSlots(player.inventory)],
      "shotgun",
      1,
    );
    if (probeLeft > 0) return;

    this.consumeFromPlayer(player, "scrap", BASE.shotgunCraftScrap);
    this.consumeFromPlayer(player, "wood", BASE.shotgunCraftWood);
    this.giveToPlayer(player, "shotgun", 1);
    this.tickEvents.push({ kind: "craft", playerId, item: "shotgun" });
  }

  addWorldPing(playerId: string, x: number, y: number, z: number): void {
    const player = this.players.get(playerId);
    if (!player || player.downed) return;

    while (this.worldPings.length >= MAX_WORLD_PINGS) {
      this.worldPings.shift();
    }
    const id = `ping${nextPingSeq++}`;
    this.worldPings.push({
      id,
      x,
      y,
      z,
      by: playerId,
      color: player.color,
      ttl: PING_TTL_SEC,
    });
    this.tickEvents.push({ kind: "ping", pingId: id, x, y, z, by: playerId });
  }

  toCheckpoint(): WorldCheckpoint {
    const loot: WorldCheckpoint["loot"] = {};
    for (const node of this.lootNodes.values()) {
      loot[node.id] = { opened: node.opened, slots: cloneSlots(node.slots) };
    }
    return {
      code: this.code,
      invasionIndex: this.invasionIndex,
      phase: this.phase,
      phaseEndsIn: this.phaseTimer,
      waveIndex: this.waveIndex,
      coreHp: this.coreHp,
      walls: WALL_IDS.map((id) => {
        const w = this.walls.get(id)!;
        return { id, hp: w.hp, tier: w.tier, doorOpen: w.doorOpen };
      }),
      storageTier: this.storageTier,
      workbenchTier: this.workbenchTier,
      generatorTier: this.generatorTier,
      unlocks: [...this.unlocks],
      storage: cloneSlots(this.storage),
      loot,
      updatedAt: Date.now(),
    };
  }

  requestSave(): void {
    saveWorld(this.toCheckpoint());
    this.saveAcc = 0;
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
      hunger: SURVIVAL.startingHunger,
      downed: false,
      bleedout: 0,
      iFrames: PLAYER.respawnIFrames,
      weaponCd: 0,
      useQueued: false,
      jumpQueued: false,
      interactHeld: false,
      sprinting: false,
      lastInputAt: Date.now(),
      reviveTargetId: null,
      reviveProgress: 0,
      ready: false,
      ws,
    };
    this.players.set(id, player);
    return player;
  }

  removePlayer(playerId: string): void {
    this.players.delete(playerId);
    this.broadcast({ type: "playerLeft", playerId });
    if (this.players.size === 0) {
      this.requestSave();
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
    if (input.shoot) player.useQueued = true;
    if (input.jump) player.jumpQueued = true;
    player.interactHeld = Boolean(input.interact);
    // Can't sprint on empty hunger.
    player.sprinting = Boolean(input.sprint) && !player.downed && player.hunger > 0;
    player.lastInputAt = Date.now();
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
      this.spawnZombieAt(kind, x, z);
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

    if (cmd === "invasion" && parts[1]?.toLowerCase() === "start") {
      this.enterWarning();
      return { ok: true, message: "Forced invasion warning" };
    }

    if (cmd === "invasion" && parts[1]?.toLowerCase() === "skip") {
      this.resolveInvasionWin();
      return { ok: true, message: "Forced invasion win / resolve" };
    }

    if (cmd === "give" && parts[1] && parts[2]) {
      const itemRaw = parts[1].toLowerCase();
      if (itemRaw !== "wood" && itemRaw !== "scrap") {
        return { ok: false, message: "Usage: give wood|scrap <n>" };
      }
      const n = Math.max(0, Math.floor(Number(parts[2])));
      if (!Number.isFinite(n) || n <= 0) {
        return { ok: false, message: "Usage: give wood|scrap <n>" };
      }
      const left = this.giveToPlayer(player, itemRaw, n);
      const given = n - left;
      return {
        ok: given > 0,
        message: given > 0 ? `Gave ${given} ${itemRaw}` : "Inventory full",
      };
    }

    if (cmd === "time") {
      const now = Date.now();
      const inputAge = now - player.lastInputAt;
      const uptimeSec = ((now - this.startedAt) / 1000).toFixed(1);
      const phaseLeft =
        this.phase === "prep" ? "∞" : `${Math.max(0, this.phaseTimer).toFixed(2)}s`;
      return {
        ok: true,
        message: [
          `epoch=${now}`,
          `iso=${new Date(now).toISOString()}`,
          `uptime=${uptimeSec}s`,
          `simTick=${this.tick}`,
          `tickHz=${TICK_HZ}`,
          `tickMs=${TICK_MS.toFixed(2)}`,
          `phase=${this.phase}`,
          `wave=${this.invasionIndex + 1}`,
          `phaseLeft=${phaseLeft}`,
          `lastInput=${inputAge}ms`,
          `players=${this.players.size}`,
          `zombies=${this.zombies.size}`,
        ].join(" · "),
      };
    }

    if (cmd === "help") {
      return {
        ok: true,
        message:
          "time | time watch [sec] | spawn zombie [walker|runner|bruiser] | kill player <name> | kill players | kill zombies <n> | kill all zombies | invasion start | invasion skip | give wood|scrap <n>",
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
      hunger: p.hunger,
      maxHunger: SURVIVAL.maxHunger,
      downed: p.downed,
      bleedout: p.bleedout,
      reviveProgress: Math.min(1, p.reviveProgress / COMBAT.reviveDuration),
      beingRevived: beingRevived.has(p.id),
      ready: p.ready,
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

  /** Refill all world loot crates for the next prep round. */
  private resetLootNodes(): void {
    for (const node of this.lootNodes.values()) {
      node.opened = false;
      node.slots = [];
    }
  }

  private spawnZombieAt(kind: ZombieTypeId, x: number, z: number): void {
    const def = ZOMBIE_DEFS[kind];
    const id = `z${nextZombieSeq++}`;
    this.zombies.set(id, {
      id,
      kind,
      x,
      y: 0,
      z,
      yaw: 0,
      hp: def.maxHp,
      attackCd: 0,
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

  private nearestIntactWall(
    x: number,
    z: number,
  ): { wall: RoomWall; dist: number } | null {
    let best: RoomWall | null = null;
    let bestDist = Infinity;
    for (const wall of this.walls.values()) {
      if (wall.hp <= 0) continue;
      const layout = BASE_LAYOUT.walls[wall.id];
      const d = distXZ(x, z, layout.x, layout.z);
      if (d < bestDist) {
        bestDist = d;
        best = wall;
      }
    }
    return best ? { wall: best, dist: bestDist } : null;
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
    player.useQueued = false;
    player.jumpQueued = false;
    player.sprinting = false;
    player.ready = false;
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
    player.hunger = Math.max(player.hunger, SURVIVAL.hpRegenMinHunger);
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

  /** LMB: eat food, fire gun, or melee (empty / melee weapon). */
  private tryUse(player: RoomPlayer): void {
    const stack = this.selectedItem(player);

    if (stack?.id === "food") {
      this.tryEat(player);
      return;
    }
    if (stack && ITEMS[stack.id].kind === "gun") {
      this.tryShoot(player);
      return;
    }
    // Empty slot, melee weapon, or non-usable resource → melee (resources do nothing)
    if (!stack || ITEMS[stack.id].kind === "melee") {
      this.tryMelee(player);
    }
  }

  private tryEat(player: RoomPlayer): void {
    const stack = this.selectedItem(player);
    if (!stack || stack.id !== "food") return;
    if (player.weaponCd > 0) return;
    if (player.hunger >= SURVIVAL.maxHunger - 1e-6) return;

    stack.count -= 1;
    if (stack.count <= 0) player.hotbar[player.selectedSlot] = null;

    const before = player.hunger;
    player.hunger = Math.min(SURVIVAL.maxHunger, player.hunger + SURVIVAL.foodRestore);
    player.weaponCd = SURVIVAL.eatCooldown;
    this.tickEvents.push({
      kind: "eat",
      playerId: player.id,
      restored: player.hunger - before,
    });
  }

  private tryShoot(player: RoomPlayer): void {
    const stack = this.selectedItem(player);
    if (!stack || ITEMS[stack.id].kind !== "gun" || !isWeaponId(stack.id)) return;
    const gun = WEAPONS[stack.id];
    if (gun.kind !== "gun") return;
    // No dry-fire events — client was animating shots with 0 ammo.
    if (player.weaponCd > 0) return;

    const ammoLeft =
      countItem(player.hotbar, "ammo") + countItem(player.inventory, "ammo");
    if (!DEV.infiniteAmmo && ammoLeft < gun.ammoCost) return;

    if (!DEV.infiniteAmmo) {
      let need = gun.ammoCost;
      need = consumeItem(player.hotbar, "ammo", need);
      if (need > 0) consumeItem(player.inventory, "ammo", need);
    }

    player.weaponCd = gun.cooldown;

    const origin = eyePosition(player.x, player.y, player.z);
    const dir = lookDirection(player.yaw, player.pitch);
    const wallT = firstWallHit(origin, dir, gun.range, this.solids);
    const maxT = wallT ?? gun.range;

    let bestId: string | null = null;
    let bestT = maxT;
    for (const zombie of this.zombies.values()) {
      const def = ZOMBIE_DEFS[zombie.kind];
      const hit = zombieHitCapsule(def);
      const t = raycastCapsuleXZ(
        origin,
        dir,
        zombie.x,
        zombie.z,
        hit.radius,
        hit.minY,
        hit.maxY,
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

  private updateSurvival(player: RoomPlayer, dt: number): void {
    if (player.downed) return;

    let drain = SURVIVAL.hungerDrainPerSec;
    if (player.sprinting && (player.forward !== 0 || player.strafe !== 0)) {
      drain += SURVIVAL.hungerSprintDrainPerSec;
    }
    player.hunger = Math.max(0, player.hunger - drain * dt);
    if (player.hunger <= 0) player.sprinting = false;

    if (player.hunger >= SURVIVAL.hpRegenMinHunger && player.hp < player.maxHp) {
      player.hp = Math.min(player.maxHp, player.hp + SURVIVAL.hpRegenPerSec * dt);
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

  private nearWall(player: RoomPlayer, wallId: WallId): boolean {
    const layout = BASE_LAYOUT.walls[wallId];
    return distXZ(player.x, player.z, layout.x, layout.z) <= BASE.interactRange + 2;
  }

  private consumeFromPlayer(player: RoomPlayer, id: ItemId, amount: number): boolean {
    if (amount <= 0) return true;
    const have = countItem(player.hotbar, id) + countItem(player.inventory, id);
    if (have < amount) return false;
    let need = amount;
    need = consumeItem(player.hotbar, id, need);
    if (need > 0) consumeItem(player.inventory, id, need);
    return true;
  }

  /** Deposit into hotbar then inventory. Returns leftover count. */
  private giveToPlayer(player: RoomPlayer, id: ItemId, count: number): number {
    return this.depositIntoBags([player.hotbar, player.inventory], id, count);
  }

  private depositIntoBags(bags: Slot[][], id: ItemId, count: number): number {
    let left = count;
    const max = ITEMS[id].maxStack;
    for (const slots of bags) {
      if (left <= 0) break;
      for (let i = 0; i < slots.length && left > 0; i++) {
        const s = slots[i];
        if (!s || s.id !== id) continue;
        const space = max - s.count;
        if (space <= 0) continue;
        const take = Math.min(space, left);
        s.count += take;
        left -= take;
      }
      for (let i = 0; i < slots.length && left > 0; i++) {
        if (slots[i]) continue;
        const take = Math.min(max, left);
        slots[i] = { id, count: take };
        left -= take;
      }
    }
    return left;
  }

  private depositIntoStorage(id: ItemId, count: number): number {
    return this.depositIntoBags([this.storage], id, count);
  }

  private resizeStorage(slots: number): void {
    if (slots > this.storage.length) {
      this.storage.push(...emptySlots(slots - this.storage.length));
      return;
    }
    if (slots < this.storage.length) {
      while (this.storage.length > slots && this.storage[this.storage.length - 1] === null) {
        this.storage.pop();
      }
    }
  }

  private syncWorkbenchUnlocks(emitEvents: boolean): void {
    for (let t = 1; t <= this.workbenchTier; t++) {
      for (const unlock of workbenchTierDef(t).unlocks) {
        if (!this.unlocks.includes(unlock)) {
          this.unlocks.push(unlock);
          if (emitEvents) this.tickEvents.push({ kind: "unlock", unlock });
        }
      }
    }
  }

  private clearReadyFlags(): void {
    for (const p of this.players.values()) p.ready = false;
  }

  private clearInvasionZombies(): void {
    this.zombies.clear();
  }

  private enterWarning(): void {
    this.phase = "warning";
    const bonus = generatorTierDef(this.generatorTier).warningBonusSec;
    this.phaseTimer = warningDurationSec(this.generatorTier, bonus);
    this.cleanupTimer = null;
    this.clearReadyFlags();
    this.tickEvents.push({
      kind: "phaseChange",
      phase: "warning",
      invasionIndex: this.invasionIndex,
    });
  }

  private enterWaves(): void {
    this.phase = "waves";
    this.wavesTotal = INVASION.wavesPerInvasion;
    this.waveIndex = 0;
    this.cleanupTimer = null;
    this.phaseTimer = 0;
    this.spawnWave(0);
    this.tickEvents.push({
      kind: "waveStart",
      waveIndex: 0,
      invasionIndex: this.invasionIndex,
    });
    this.tickEvents.push({
      kind: "phaseChange",
      phase: "waves",
      invasionIndex: this.invasionIndex,
    });
  }

  private spawnWave(w: number): void {
    this.waveIndex = w;
    const spawns = waveSpawns(this.invasionIndex, w);
    let slot = 0;
    for (const spawn of spawns) {
      for (let i = 0; i < spawn.count; i++) {
        const pos = invasionSpawnPoint(slot++);
        this.spawnZombieAt(spawn.kind, pos.x, pos.z);
      }
    }
    if (w >= this.wavesTotal - 1) {
      this.cleanupTimer = INVASION.cleanupSec;
    }
  }

  private countInvasionZombies(): number {
    return this.zombies.size;
  }

  /** Wave cleared — reward, teleport to base, back to prep for next ready-up. */
  private resolveInvasionWin(): void {
    this.clearInvasionZombies();
    const scrap =
      INVASION.rewardScrap + this.invasionIndex * INVASION.rewardScrapPerIndex;
    const ammo = INVASION.rewardAmmo;
    this.depositIntoStorage("scrap", scrap);
    this.depositIntoStorage("ammo", ammo);

    const clearedIndex = this.invasionIndex;
    this.invasionIndex += 1;
    this.syncWorkbenchUnlocks(true);

    for (const player of this.players.values()) {
      this.respawnPlayer(player);
      player.ready = false;
    }

    this.resetLootNodes();

    this.phase = "prep";
    this.phaseTimer = prepDurationSec(this.invasionIndex);
    this.cleanupTimer = null;
    this.waveIndex = 0;

    this.tickEvents.push({
      kind: "invasionWon",
      invasionIndex: clearedIndex,
      scrap,
      ammo,
    });
    this.tickEvents.push({
      kind: "phaseChange",
      phase: "prep",
      invasionIndex: this.invasionIndex,
    });
    this.requestSave();
  }

  private invasionLost(): void {
    this.clearInvasionZombies();

    for (const wall of this.walls.values()) {
      const maxHp = wallTierDef(wall.tier).maxHp;
      wall.hp = Math.max(0, wall.hp - maxHp * INVASION.wipeWallDamageFrac);
    }
    this.coreHp = BASE.coreMaxHp * INVASION.wipeCoreRestoreFrac;
    this.rebuildSolids();

    for (const player of this.players.values()) {
      this.wipePlayerCarryKeepPistol(player);
      this.respawnPlayer(player);
      player.ready = false;
    }

    this.resetLootNodes();

    this.phase = "prep";
    this.phaseTimer = prepDurationSec(this.invasionIndex);
    this.waveIndex = 0;
    this.cleanupTimer = null;

    this.tickEvents.push({ kind: "invasionLost", invasionIndex: this.invasionIndex });
    this.tickEvents.push({
      kind: "phaseChange",
      phase: "prep",
      invasionIndex: this.invasionIndex,
    });
  }

  private wipePlayerCarryKeepPistol(player: RoomPlayer): void {
    let keepPistol = false;
    for (const bag of [player.hotbar, player.inventory]) {
      for (let i = 0; i < bag.length; i++) {
        const s = bag[i];
        if (s?.id === "pistol" && !keepPistol) {
          keepPistol = true;
          bag[i] = { id: "pistol", count: 1 };
        } else {
          bag[i] = null;
        }
      }
    }
    if (keepPistol && !player.hotbar.some((s) => s?.id === "pistol")) {
      // Ensure pistol sits on hotbar slot 0 if it was only in inv.
      player.hotbar[0] = { id: "pistol", count: 1 };
      for (let i = 0; i < player.inventory.length; i++) {
        if (player.inventory[i]?.id === "pistol") player.inventory[i] = null;
      }
    }
  }

  private damageWall(wall: RoomWall, amount: number): void {
    if (wall.hp <= 0) return;
    wall.hp = Math.max(0, wall.hp - amount);
    if (wall.hp <= 0) {
      wall.doorOpen = false;
      this.rebuildSolids();
      this.tickEvents.push({ kind: "wallBreak", wallId: wall.id });
    }
  }

  private updateInvasion(dt: number): void {
    if (this.phase === "prep") {
      // Indefinite prep — only all-ready (handled in setReady) starts the next wave.
      return;
    }

    if (this.phase === "warning") {
      this.phaseTimer -= dt;
      if (this.coreHp <= 0) {
        this.invasionLost();
        return;
      }
      if (this.phaseTimer <= 0) {
        this.enterWaves();
      }
      return;
    }

    if (this.phase === "waves") {
      if (this.coreHp <= 0) {
        this.invasionLost();
        return;
      }

      // One pack per ready-up; when cleared → prep for next wave.
      if (this.countInvasionZombies() === 0) {
        this.resolveInvasionWin();
      }
      return;
    }

    // Legacy resolve phase: snap back to prep immediately.
    if (this.phase === "resolve") {
      this.phase = "prep";
      this.phaseTimer = prepDurationSec(this.invasionIndex);
      this.cleanupTimer = null;
      this.clearReadyFlags();
      this.tickEvents.push({
        kind: "phaseChange",
        phase: "prep",
        invasionIndex: this.invasionIndex,
      });
    }
  }

  private updateZombieAi(zombie: RoomZombie, dt: number): void {
    const def = ZOMBIE_DEFS[zombie.kind];
    if (zombie.attackCd > 0) zombie.attackCd = Math.max(0, zombie.attackCd - dt);

    const siege = this.phase === "waves" || this.phase === "warning";

    if (siege) {
      const target = this.nearestPlayer(zombie.x, zombie.z, def.aggroRange);
      const wallHit = this.nearestIntactWall(zombie.x, zombie.z);
      const playerDist = target
        ? distXZ(zombie.x, zombie.z, target.x, target.z)
        : Infinity;
      const wallDist = wallHit?.dist ?? Infinity;

      const preferWall =
        wallHit !== null &&
        (target === null || wallDist + WALL_PREFER_SLACK < playerDist);

      if (!preferWall && target) {
        if (playerDist > def.attackRange * 0.85) {
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
          zombie.yaw = yawToward(zombie.x, zombie.z, target.x, target.z);
          if (zombie.attackCd <= 0 && !target.downed) {
            this.hurtPlayer(target, def.damage);
            zombie.attackCd = def.attackCooldown;
          }
        }
      } else if (wallHit) {
        const layout = BASE_LAYOUT.walls[wallHit.wall.id];
        const attackRange = def.attackRange + Math.max(layout.sx, layout.sz) * 0.35;
        if (wallDist > attackRange * 0.9) {
          const moved = moveToward(
            zombie.x,
            zombie.z,
            layout.x,
            layout.z,
            def.speed,
            dt,
            def.radius,
            this.solids,
          );
          zombie.x = moved.x;
          zombie.z = moved.z;
          zombie.yaw = moved.yaw;
        } else {
          zombie.yaw = yawToward(zombie.x, zombie.z, layout.x, layout.z);
          if (zombie.attackCd <= 0) {
            const dmg = zombie.kind === "bruiser" ? WALL_HIT_BRUISER : WALL_HIT_OTHER;
            this.damageWall(wallHit.wall, dmg);
            zombie.attackCd = def.attackCooldown;
          }
        }
      }

      const core = BASE_LAYOUT.core;
      const coreDist = distXZ(zombie.x, zombie.z, core.x, core.z);
      if (coreDist < core.radius + 1.5 && zombie.attackCd <= 0) {
        this.coreHp = Math.max(0, this.coreHp - CORE_CHIP_DAMAGE);
        zombie.attackCd = def.attackCooldown;
      }
    } else {
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
          zombie.yaw = yawToward(zombie.x, zombie.z, target.x, target.z);
          if (zombie.attackCd <= 0 && !target.downed) {
            this.hurtPlayer(target, def.damage);
            zombie.attackCd = def.attackCooldown;
          }
        }
      }
    }

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
        player.useQueued = false;
        player.jumpQueued = false;
        player.sprinting = false;
        player.y = 0;
        player.vy = 0;
        player.grounded = true;
        continue;
      }

      this.updateSurvival(player, dt);

      // Drop stale movement if the client stopped sending (or stop packet is late).
      if (Date.now() - player.lastInputAt > STALE_INPUT_MS) {
        player.forward = 0;
        player.strafe = 0;
        player.sprinting = false;
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

      if (player.useQueued) {
        player.useQueued = false;
        this.tryUse(player);
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
      this.updateZombieAi(zombie, dt);
    }

    this.updateInvasion(dt);

    // Ping TTL
    for (const ping of this.worldPings) {
      ping.ttl -= dt;
    }
    this.worldPings = this.worldPings.filter((p) => p.ttl > 0);

    if (this.players.size > 0) {
      this.saveAcc += dt;
      if (this.saveAcc >= SAVE_INTERVAL_SEC) {
        this.requestSave();
      }
    }

    const players = this.snapshotPlayers();
    const zombies = this.snapshotZombies();
    const lootNodes = this.snapshotLootNodes();
    const storage = this.snapshotStorage();
    const base = this.snapshotBase();
    const invasion = this.snapshotInvasion();
    const pings = this.snapshotPings();
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
        base,
        invasion,
        pings,
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
    } while (
      (this.rooms.has(room.code) || loadWorld(room.code) !== null) &&
      attempts < 20
    );

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

    const key = code.trim().toUpperCase();
    let room = this.rooms.get(key);
    if (!room) {
      const checkpoint = loadWorld(key);
      if (!checkpoint) return { error: "Room not found" };
      room = new Room(key, checkpoint);
      room.setEmptyHandler((c) => this.rooms.delete(c));
      this.rooms.set(room.code, room);
    }

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

  handleSetReady(ws: WebSocket, ready: boolean): void {
    const binding = this.bySocket.get(ws);
    if (!binding) return;
    binding.room.setReady(binding.playerId, ready);
  }

  handleRepairWall(ws: WebSocket, wallId: WallId): void {
    const binding = this.bySocket.get(ws);
    if (!binding) return;
    binding.room.repairWall(binding.playerId, wallId);
  }

  handleToggleDoor(ws: WebSocket, wallId: WallId): void {
    const binding = this.bySocket.get(ws);
    if (!binding) return;
    binding.room.toggleDoor(binding.playerId, wallId);
  }

  handleUpgradeBase(
    ws: WebSocket,
    component: "wall" | "storage" | "workbench" | "generator",
    wallId?: WallId,
  ): void {
    const binding = this.bySocket.get(ws);
    if (!binding) return;
    binding.room.upgradeBase(binding.playerId, component, wallId);
  }

  handleCraft(ws: WebSocket, recipe: "shotgun"): void {
    const binding = this.bySocket.get(ws);
    if (!binding) return;
    binding.room.craft(binding.playerId, recipe);
  }

  handleWorldPing(ws: WebSocket, x: number, y: number, z: number): void {
    const binding = this.bySocket.get(ws);
    if (!binding) return;
    binding.room.addWorldPing(binding.playerId, x, y, z);
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
