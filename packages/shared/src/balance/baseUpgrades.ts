/** Base component upgrade tiers (barricades, storage, workbench, generator). */

export type BaseComponentId = "storage" | "workbench" | "generator";
export type WallId = "north" | "south" | "east" | "west";

export const WALL_IDS: readonly WallId[] = ["north", "south", "east", "west"] as const;

export type WallTierDef = {
  tier: number;
  maxHp: number;
  /** Wood to repair from 0 → max (partial repairs scale). */
  repairWoodFull: number;
  /** Scrap + wood to upgrade TO this tier from previous. */
  upgradeScrap: number;
  upgradeWood: number;
};

export type StorageTierDef = {
  tier: number;
  slots: number;
  upgradeScrap: number;
  upgradeWood: number;
};

export type WorkbenchTierDef = {
  tier: number;
  upgradeScrap: number;
  /** Unlocks listed when reaching this tier. */
  unlocks: readonly string[];
};

export type GeneratorTierDef = {
  tier: number;
  /** Extra warning seconds added to base warning. */
  warningBonusSec: number;
  upgradeScrap: number;
};

export const WALL_TIERS: readonly WallTierDef[] = [
  { tier: 1, maxHp: 100, repairWoodFull: 8, upgradeScrap: 0, upgradeWood: 0 },
  { tier: 2, maxHp: 160, repairWoodFull: 12, upgradeScrap: 10, upgradeWood: 14 },
  { tier: 3, maxHp: 240, repairWoodFull: 18, upgradeScrap: 18, upgradeWood: 22 },
];

export const STORAGE_TIERS: readonly StorageTierDef[] = [
  { tier: 1, slots: 36, upgradeScrap: 0, upgradeWood: 0 },
  { tier: 2, slots: 45, upgradeScrap: 12, upgradeWood: 6 },
  { tier: 3, slots: 54, upgradeScrap: 20, upgradeWood: 10 },
];

export const WORKBENCH_TIERS: readonly WorkbenchTierDef[] = [
  { tier: 1, upgradeScrap: 0, unlocks: [] },
  { tier: 2, upgradeScrap: 16, unlocks: ["shotgun"] },
  { tier: 3, upgradeScrap: 28, unlocks: [] },
];

export const GENERATOR_TIERS: readonly GeneratorTierDef[] = [
  { tier: 1, warningBonusSec: 0, upgradeScrap: 0 },
  { tier: 2, warningBonusSec: 15, upgradeScrap: 14 },
  { tier: 3, warningBonusSec: 30, upgradeScrap: 24 },
];

export const BASE = {
  coreMaxHp: 200,
  interactRange: 2.8,
  /** Wood per craft at workbench when shotgun unlocked. */
  shotgunCraftScrap: 8,
  shotgunCraftWood: 2,
} as const;

/** Safehouse layout — walls around the pad, props nearby. */
export const BASE_LAYOUT = {
  core: { x: 0, y: 0, z: 0, radius: 1.2 },
  storage: { x: 3.2, y: 0, z: 0.5 },
  workbench: { x: -3.0, y: 0, z: 0.8 },
  generator: { x: 0.2, y: 0, z: -3.4 },
  walls: {
    north: { x: 0, z: 4.6, sx: 9, sy: 2.2, sz: 0.55 },
    south: { x: 0, z: -4.6, sx: 9, sy: 2.2, sz: 0.55 },
    east: { x: 4.6, z: 0, sx: 0.55, sy: 2.2, sz: 9 },
    west: { x: -4.6, z: 0, sx: 0.55, sy: 2.2, sz: 9 },
  },
} as const;

export function wallTierDef(tier: number): WallTierDef {
  return WALL_TIERS[Math.max(0, Math.min(WALL_TIERS.length - 1, tier - 1))]!;
}

export function storageTierDef(tier: number): StorageTierDef {
  return STORAGE_TIERS[Math.max(0, Math.min(STORAGE_TIERS.length - 1, tier - 1))]!;
}

export function workbenchTierDef(tier: number): WorkbenchTierDef {
  return WORKBENCH_TIERS[Math.max(0, Math.min(WORKBENCH_TIERS.length - 1, tier - 1))]!;
}

export function generatorTierDef(tier: number): GeneratorTierDef {
  return GENERATOR_TIERS[Math.max(0, Math.min(GENERATOR_TIERS.length - 1, tier - 1))]!;
}

export function wallAabb(id: WallId): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
} {
  const w = BASE_LAYOUT.walls[id];
  const hx = w.sx / 2;
  const hz = w.sz / 2;
  return {
    minX: w.x - hx,
    maxX: w.x + hx,
    minY: 0,
    maxY: w.sy,
    minZ: w.z - hz,
    maxZ: w.z + hz,
  };
}
