/** SQLite world checkpoints keyed by invite code. */

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { InvasionPhase, Slot, WallId } from "@coop/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../../data");
const DB_PATH = join(DATA_DIR, "worlds.sqlite");

export type CheckpointWall = {
  id: WallId;
  hp: number;
  tier: number;
  doorOpen?: boolean;
};

export type WorldCheckpoint = {
  code: string;
  invasionIndex: number;
  phase: InvasionPhase;
  phaseEndsIn: number;
  waveIndex: number;
  coreHp: number;
  walls: CheckpointWall[];
  storageTier: number;
  workbenchTier: number;
  generatorTier: number;
  unlocks: string[];
  storage: Slot[];
  loot: Record<string, { opened: boolean; slots: Slot[] }>;
  updatedAt: number;
};

mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS worlds (
    code TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

const stmtGet = db.prepare("SELECT data FROM worlds WHERE code = ?");
const stmtUpsert = db.prepare(
  `INSERT INTO worlds (code, data, updated_at) VALUES (@code, @data, @updated_at)
   ON CONFLICT(code) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
);

export function loadWorld(code: string): WorldCheckpoint | null {
  const key = code.trim().toUpperCase();
  const row = stmtGet.get(key) as { data: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.data) as WorldCheckpoint;
  } catch {
    return null;
  }
}

export function saveWorld(checkpoint: WorldCheckpoint): void {
  const key = checkpoint.code.trim().toUpperCase();
  const updatedAt = Date.now();
  const payload: WorldCheckpoint = { ...checkpoint, code: key, updatedAt };
  stmtUpsert.run({
    code: key,
    data: JSON.stringify(payload),
    updated_at: updatedAt,
  });
}
