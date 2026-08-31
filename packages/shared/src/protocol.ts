/** Shared client ↔ server message types. */

import type { ItemStack, Slot, SlotBag } from "./balance/loot.js";
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
  downed: boolean;
  bleedout: number;
  /** 0–1 progress while this player is performing a revive. */
  reviveProgress: number;
  /** True if someone is currently reviving this (downed) player. */
  beingRevived: boolean;
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

export type GameEvent =
  | { kind: "shot"; playerId: string; hit: boolean }
  | { kind: "melee"; playerId: string; hit: boolean }
  | { kind: "kill"; zombieId: string; by: string }
  | { kind: "down"; playerId: string }
  | { kind: "revive"; playerId: string; by: string }
  | { kind: "lootOpen"; playerId: string; spotId: string }
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
    }
  | { type: "openLoot"; lootId: string }
  | { type: "invMove"; from: SlotRef; to: SlotRef }
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
    }
  | {
      type: "snapshot";
      tick: number;
      you: string;
      players: PlayerSnapshot[];
      zombies: ZombieSnapshot[];
      lootNodes: LootNodeSnapshot[];
      storage: Slot[];
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

// silence unused — ItemStack re-export convenience for callers
export type { ItemStack };
