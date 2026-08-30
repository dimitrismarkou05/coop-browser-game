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
    };

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
    }
  | { type: "playerLeft"; playerId: string };

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
        };
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
      return raw as ServerMessage;
    default:
      return null;
  }
}
