/** Shared client ↔ server message types. */

import type { ItemStack, Slot, SlotBag } from "./balance/loot.js";
import type { WallId } from "./balance/baseUpgrades.js";
import type { InvasionPhase } from "./balance/invasions.js";
import type { ZombieTypeId } from "./balance/zombies.js";

export type PlayerSnapshot = {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  color: number;
  hp: number;
  maxHp: number;
  /** Total ammo across hotbar + inventory. */
  ammo: number;
  hotbar: Slot[];
  inventory: Slot[];
  selectedSlot: number;
  hunger: number;
  maxHunger: number;
  downed: boolean;
  bleedout: number;
  /** 0–1 progress while this player is performing a revive. */
  reviveProgress: number;
  /** True if someone is currently reviving this (downed) player. */
  beingRevived: boolean;
  ready: boolean;
};

export type ZombieSnapshot = {
  id: string;
  kind: ZombieTypeId;
  x: number;
  y: number;
  z: number;
  yaw: number;
  hp: number;
};

export type LootNodeSnapshot = {
  id: string;
  label: string;
  x: number;
  z: number;
  /** True after loot has been rolled into slots. */
  opened: boolean;
  /** Slot count = item stacks (empty slots stay until cleared). */
  slots: Slot[];
};

export type WallSnapshot = {
  id: WallId;
  hp: number;
  maxHp: number;
  tier: number;
  broken: boolean;
};

export type BaseSnapshot = {
  coreHp: number;
  coreMaxHp: number;
  walls: WallSnapshot[];
  storageTier: number;
  workbenchTier: number;
  generatorTier: number;
  unlocks: string[];
};

export type InvasionSnapshot = {
  phase: InvasionPhase;
  invasionIndex: number;
  /** Seconds remaining in current phase (prep / warning / resolve / cleanup). */
  phaseEndsIn: number;
  waveIndex: number;
  wavesTotal: number;
  readyCount: number;
  playerCount: number;
};

export type WorldPingSnapshot = {
  id: string;
  x: number;
  y: number;
  z: number;
  by: string;
  color: number;
  /** Seconds left before despawn. */
  ttl: number;
};

export type GameEvent =
  | { kind: "shot"; playerId: string; hit: boolean }
  | { kind: "melee"; playerId: string; hit: boolean }
  | { kind: "kill"; zombieId: string; by: string }
  | { kind: "down"; playerId: string }
  | { kind: "revive"; playerId: string; by: string }
  | { kind: "lootOpen"; playerId: string; spotId: string }
  | { kind: "eat"; playerId: string; restored: number }
  | { kind: "repair"; playerId: string; wallId: WallId; hp: number }
  | { kind: "upgrade"; playerId: string; component: string; tier: number }
  | { kind: "unlock"; unlock: string }
  | { kind: "craft"; playerId: string; item: string }
  | { kind: "wallBreak"; wallId: WallId }
  | { kind: "phaseChange"; phase: InvasionPhase; invasionIndex: number }
  | { kind: "waveStart"; waveIndex: number; invasionIndex: number }
  | { kind: "invasionWon"; invasionIndex: number; scrap: number; ammo: number }
  | { kind: "invasionLost"; invasionIndex: number }
  | { kind: "ping"; pingId: string; x: number; y: number; z: number; by: string }
  | { kind: "dev"; message: string };

export type SlotRef = {
  bag: SlotBag;
  index: number;
  /** Required when bag === "loot". */
  lootId?: string;
};

export type ClientMessage =
  | { type: "ping"; clientTime: number }
  | { type: "createRoom"; name: string }
  | { type: "joinRoom"; code: string; name: string }
  | {
      type: "input";
      seq: number;
      forward: number;
      strafe: number;
      yaw: number;
      pitch: number;
      shoot?: boolean;
      melee?: boolean;
      /** Hold E for revive only. */
      interact?: boolean;
      jump?: boolean;
      selectedSlot?: number;
      sprint?: boolean;
    }
  | { type: "openLoot"; lootId: string }
  | { type: "invMove"; from: SlotRef; to: SlotRef }
  | {
      type: "invQuickMove";
      from: SlotRef;
      /** Where to pour the stack (Minecraft shift-click target). */
      prefer: "player" | "container";
      /** When prefer is container and target is a loot node. */
      containerLootId?: string;
    }
  | { type: "setReady"; ready: boolean }
  | { type: "repairWall"; wallId: WallId }
  | { type: "upgradeBase"; component: "wall" | "storage" | "workbench" | "generator"; wallId?: WallId }
  | { type: "craft"; recipe: "shotgun" }
  | { type: "worldPing"; x: number; y: number; z: number }
  | { type: "devCommand"; line: string };

export type ServerMessage =
  | { type: "welcome"; milestone: string; serverTime: number }
  | { type: "pong"; clientTime: number; serverTime: number }
  | { type: "error"; message: string }
  | {
      type: "roomJoined";
      code: string;
      playerId: string;
      players: PlayerSnapshot[];
      zombies: ZombieSnapshot[];
      lootNodes: LootNodeSnapshot[];
      storage: Slot[];
      base: BaseSnapshot;
      invasion: InvasionSnapshot;
      pings: WorldPingSnapshot[];
    }
  | {
      type: "snapshot";
      tick: number;
      you: string;
      players: PlayerSnapshot[];
      zombies: ZombieSnapshot[];
      lootNodes: LootNodeSnapshot[];
      storage: Slot[];
      base: BaseSnapshot;
      invasion: InvasionSnapshot;
      pings: WorldPingSnapshot[];
      events?: GameEvent[];
    }
  | { type: "playerLeft"; playerId: string }
  | { type: "devResult"; ok: boolean; message: string };

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === "object" && raw !== null;
}

function parseSlotRef(raw: unknown): SlotRef | null {
  if (!isRecord(raw) || typeof raw.bag !== "string" || typeof raw.index !== "number") {
    return null;
  }
  if (raw.bag !== "hotbar" && raw.bag !== "inv" && raw.bag !== "storage" && raw.bag !== "loot") {
    return null;
  }
  const ref: SlotRef = { bag: raw.bag, index: raw.index };
  if (typeof raw.lootId === "string") ref.lootId = raw.lootId;
  return ref;
}

const WALL_IDS = new Set(["north", "south", "east", "west"]);

export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (!isRecord(raw) || typeof raw.type !== "string") return null;

  switch (raw.type) {
    case "ping":
      if (typeof raw.clientTime === "number") {
        return { type: "ping", clientTime: raw.clientTime };
      }
      return null;
    case "createRoom":
      if (typeof raw.name === "string") {
        return { type: "createRoom", name: raw.name };
      }
      return null;
    case "joinRoom":
      if (typeof raw.code === "string" && typeof raw.name === "string") {
        return { type: "joinRoom", code: raw.code, name: raw.name };
      }
      return null;
    case "input":
      if (
        typeof raw.seq === "number" &&
        typeof raw.forward === "number" &&
        typeof raw.strafe === "number" &&
        typeof raw.yaw === "number" &&
        typeof raw.pitch === "number"
      ) {
        return {
          type: "input",
          seq: raw.seq,
          forward: raw.forward,
          strafe: raw.strafe,
          yaw: raw.yaw,
          pitch: raw.pitch,
          shoot: Boolean(raw.shoot),
          melee: Boolean(raw.melee),
          interact: Boolean(raw.interact),
          jump: Boolean(raw.jump),
          sprint: Boolean(raw.sprint),
          selectedSlot:
            typeof raw.selectedSlot === "number" ? Math.floor(raw.selectedSlot) : undefined,
        };
      }
      return null;
    case "openLoot":
      if (typeof raw.lootId === "string") {
        return { type: "openLoot", lootId: raw.lootId };
      }
      return null;
    case "invMove": {
      const from = parseSlotRef(raw.from);
      const to = parseSlotRef(raw.to);
      if (from && to) return { type: "invMove", from, to };
      return null;
    }
    case "invQuickMove": {
      const from = parseSlotRef(raw.from);
      if (!from) return null;
      if (raw.prefer !== "player" && raw.prefer !== "container") return null;
      return {
        type: "invQuickMove",
        from,
        prefer: raw.prefer,
        containerLootId: typeof raw.containerLootId === "string" ? raw.containerLootId : undefined,
      };
    }
    case "setReady":
      return { type: "setReady", ready: Boolean(raw.ready) };
    case "repairWall":
      if (typeof raw.wallId === "string" && WALL_IDS.has(raw.wallId)) {
        return { type: "repairWall", wallId: raw.wallId as WallId };
      }
      return null;
    case "upgradeBase": {
      const component = raw.component;
      if (
        component !== "wall" &&
        component !== "storage" &&
        component !== "workbench" &&
        component !== "generator"
      ) {
        return null;
      }
      const wallId =
        typeof raw.wallId === "string" && WALL_IDS.has(raw.wallId)
          ? (raw.wallId as WallId)
          : undefined;
      return { type: "upgradeBase", component, wallId };
    }
    case "craft":
      if (raw.recipe === "shotgun") return { type: "craft", recipe: "shotgun" };
      return null;
    case "worldPing":
      if (
        typeof raw.x === "number" &&
        typeof raw.y === "number" &&
        typeof raw.z === "number"
      ) {
        return { type: "worldPing", x: raw.x, y: raw.y, z: raw.z };
      }
      return null;
    case "devCommand":
      if (typeof raw.line === "string") {
        return { type: "devCommand", line: raw.line };
      }
      return null;
    default:
      return null;
  }
}

export function parseServerMessage(raw: unknown): ServerMessage | null {
  if (!isRecord(raw) || typeof raw.type !== "string") return null;

  switch (raw.type) {
    case "welcome":
    case "pong":
    case "error":
    case "roomJoined":
    case "snapshot":
    case "playerLeft":
    case "devResult":
      return raw as ServerMessage;
    default:
      return null;
  }
}

export type { ItemStack };
