/** Invasion phase timing, wave tables, rewards, escalation. */

import type { ZombieTypeId } from "./zombies.js";

export type InvasionPhase = "prep" | "warning" | "waves" | "resolve";

export type WaveSpawn = {
  kind: ZombieTypeId;
  count: number;
};

export const INVASION = {
  /** Soft prep max before auto-warning (seconds). ~2 min for snappy V1 loops. */
  prepMaxSec: 120,
  /** Floor after escalation shrink. */
  prepMinSec: 60,
  prepShrinkPerInvasion: 15,
  /** Base warning before waves (generator adds bonus). */
  warningBaseSec: 40,
  /** Cleanup grace after last wave before auto-win if stragglers remain. */
  cleanupSec: 45,
  /** Brief resolve screen before next prep. */
  resolveSec: 12,
  wavesPerInvasion: 3,
  /** Edge spawn distance from origin. */
  spawnRadius: 32,
  /** Soft-fail wall damage fraction on wipe. */
  wipeWallDamageFrac: 0.45,
  wipeCoreRestoreFrac: 0.55,
  rewardScrap: 10,
  rewardAmmo: 16,
  rewardScrapPerIndex: 2,
} as const;

export function prepDurationSec(invasionIndex: number): number {
  const shrink = invasionIndex * INVASION.prepShrinkPerInvasion;
  return Math.max(INVASION.prepMinSec, INVASION.prepMaxSec - shrink);
}

export function warningDurationSec(generatorTier: number, warningBonusSec: number): number {
  return INVASION.warningBaseSec + warningBonusSec;
}

/** Wave composition scales with invasion index (0-based). */
export function waveSpawns(invasionIndex: number, waveIndex: number): WaveSpawn[] {
  const i = Math.max(0, invasionIndex);
  const w = waveIndex;
  const walkers = 4 + i * 2 + w * 2;
  const runners = w >= 1 || i >= 1 ? 1 + Math.floor(i / 2) + (w >= 2 ? 1 : 0) : 0;
  const bruisers = w >= 2 || i >= 2 ? 1 + Math.floor(i / 3) : i >= 1 && w >= 1 ? 1 : 0;
  const out: WaveSpawn[] = [{ kind: "walker", count: walkers }];
  if (runners > 0) out.push({ kind: "runner", count: runners });
  if (bruisers > 0) out.push({ kind: "bruiser", count: bruisers });
  return out;
}

/** Map-edge spawn points around the safehouse. */
export function invasionSpawnPoint(slot: number): { x: number; z: number } {
  const r = INVASION.spawnRadius;
  const angles = [
    Math.PI * 0.15,
    Math.PI * 0.5,
    Math.PI * 0.85,
    Math.PI * 1.15,
    Math.PI * 1.5,
    Math.PI * 1.85,
  ];
  const a = angles[slot % angles.length]!;
  return { x: Math.sin(a) * r, z: -Math.cos(a) * r };
}
