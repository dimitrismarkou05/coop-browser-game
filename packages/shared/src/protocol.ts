/** Shared client ↔ server message types. */

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
  ammo: number;
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

export type GameEvent =
  | { kind: "shot"; playerId: string; hit: boolean }
  | { kind: "melee"; playerId: string; hit: boolean }
  | { kind: "kill"; zombieId: string; by: string }
  | { kind: "down"; playerId: string }
  | { kind: "revive"; playerId: string; by: string }
  | { kind: "dev"; message: string };

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
      interact?: boolean;
      jump?: boolean;
    }
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
    }
  | {
      type: "snapshot";
      tick: number;
      you: string;
      players: PlayerSnapshot[];
      zombies: ZombieSnapshot[];
      events?: GameEvent[];
    }
  | { type: "playerLeft"; playerId: string }
  | { type: "devResult"; ok: boolean; message: string };

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === "object" && raw !== null;
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
        };
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
