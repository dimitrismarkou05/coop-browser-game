/** Invasion phase timing, wave tables, rewards, escalation. */

import type { ZombieTypeId } from "./zombies.js";

export type InvasionPhase = "prep" | "warning" | "waves" | "resolve";

export type WaveSpawn = {
  kind: ZombieTypeId;
  count: number;
};

export const INVASION = {
  /** Prep has no auto-timer — next wave starts only when all players ready. */
  prepMaxSec: 0,
  prepMinSec: 0,
  prepShrinkPerInvasion: 0,
  /** Short warning before each wave (generator still adds bonus). */
  warningBaseSec: 5,
  cleanupSec: 0,
  resolveSec: 0,
  /** One spawn pack per ready-up cycle (then back to prep). */
  wavesPerInvasion: 1,
  zombiesPerWave: 5,
  /** Edge spawn distance from origin. */
  spawnRadius: 28,
  wipeWallDamageFrac: 0.45,
  wipeCoreRestoreFrac: 0.55,
  rewardScrap: 6,
  rewardAmmo: 10,
  rewardScrapPerIndex: 1,
} as const;

export function prepDurationSec(_invasionIndex: number): number {
  return 0;
}

export function warningDurationSec(_generatorTier: number, warningBonusSec: number): number {
  return INVASION.warningBaseSec + warningBonusSec;
}

/** Fixed pack for now — 5 walkers each wave. */
export function waveSpawns(_invasionIndex: number, _waveIndex: number): WaveSpawn[] {
  return [{ kind: "walker", count: INVASION.zombiesPerWave }];
}

/** Map-edge spawn points around the safehouse. */
export function invasionSpawnPoint(slot: number): { x: number; z: number } {
  const r = INVASION.spawnRadius;
  const angles = [
    Math.PI * 0.1,
    Math.PI * 0.35,
    Math.PI * 0.65,
    Math.PI * 0.9,
    Math.PI * 1.15,
    Math.PI * 1.4,
    Math.PI * 1.65,
    Math.PI * 1.9,
  ];
  const a = angles[slot % angles.length]!;
  return { x: Math.sin(a) * r, z: -Math.cos(a) * r };
}
