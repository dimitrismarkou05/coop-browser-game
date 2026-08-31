/** Base component upgrade tiers (barricades, storage, workbench, generator). */

import type { Aabb } from "../math.js";

export type BaseComponentId = "storage" | "workbench" | "generator";
export type WallId = "north" | "south" | "east" | "west";

export const WALL_IDS: readonly WallId[] = ["north", "south", "east", "west"] as const;

/** Barricades that have a player door. West is solid (facility wall). */
export const WALLS_WITH_DOORS: readonly WallId[] = ["north", "south", "east"] as const;

export function wallHasDoor(id: WallId): boolean {
  return (WALLS_WITH_DOORS as readonly string[]).includes(id);
}

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
  /** Reach to toggle a barricade door. */
  doorInteractRange: 2.6,
  /** Clear opening width in each door barricade (world units). */
  doorWidth: 2.6,
  /** Wood per craft at workbench when shotgun unlocked. */
  shotgunCraftScrap: 8,
  shotgunCraftWood: 2,
} as const;

/**
 * Expanded safehouse (~16×16).
 * West wall is solid (no door) — storage / workbench / generator lined along it.
 */
export const BASE_LAYOUT = {
  core: { x: 0, y: 0, z: 0, radius: 0.85 },
  /** Along inner west wall (no door). */
  storage: { x: -6.4, y: 0, z: -4.2 },
  workbench: { x: -6.4, y: 0, z: 0 },
  generator: { x: -6.4, y: 0, z: 4.2 },
  walls: {
    north: { x: 0, z: 8, sx: 16.6, sy: 2.4, sz: 0.55 },
    south: { x: 0, z: -8, sx: 16.6, sy: 2.4, sz: 0.55 },
    east: { x: 8, z: 0, sx: 0.55, sy: 2.4, sz: 16.6 },
    west: { x: -8, z: 0, sx: 0.55, sy: 2.4, sz: 16.6 },
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

/** Full wall AABB (legacy / distance checks). Prefer wallSolidAabbs for collision. */
export function wallAabb(id: WallId): Aabb {
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

/** Center of the door opening on a barricade (only meaningful if wallHasDoor). */
export function wallDoorCenter(id: WallId): { x: number; z: number } {
  const w = BASE_LAYOUT.walls[id];
  return { x: w.x, z: w.z };
}

/**
 * Collision pieces for one barricade.
 * Door walls: two side panels + door slab when closed.
 * Solid walls (no door): one full slab.
 */
export function wallSolidAabbs(id: WallId, doorOpen: boolean, broken: boolean): Aabb[] {
  if (broken) return [];
  const w = BASE_LAYOUT.walls[id];
  const h = w.sy;

  if (!wallHasDoor(id)) {
    return [wallAabb(id)];
  }

  const door = BASE.doorWidth;
  const out: Aabb[] = [];
  const horizontal = w.sx >= w.sz;

  if (horizontal) {
    const side = (w.sx - door) / 2;
    const z0 = w.z - w.sz / 2;
    const z1 = w.z + w.sz / 2;
    out.push({
      minX: w.x - w.sx / 2,
      maxX: w.x - w.sx / 2 + side,
      minY: 0,
      maxY: h,
      minZ: z0,
      maxZ: z1,
    });
    out.push({
      minX: w.x + w.sx / 2 - side,
      maxX: w.x + w.sx / 2,
      minY: 0,
      maxY: h,
      minZ: z0,
      maxZ: z1,
    });
    if (!doorOpen) {
      out.push({
        minX: w.x - door / 2,
        maxX: w.x + door / 2,
        minY: 0,
        maxY: h,
        minZ: z0,
        maxZ: z1,
      });
    }
  } else {
    const side = (w.sz - door) / 2;
    const x0 = w.x - w.sx / 2;
    const x1 = w.x + w.sx / 2;
    out.push({
      minX: x0,
      maxX: x1,
      minY: 0,
      maxY: h,
      minZ: w.z - w.sz / 2,
      maxZ: w.z - w.sz / 2 + side,
    });
    out.push({
      minX: x0,
      maxX: x1,
      minY: 0,
      maxY: h,
      minZ: w.z + w.sz / 2 - side,
      maxZ: w.z + w.sz / 2,
    });
    if (!doorOpen) {
      out.push({
        minX: x0,
        maxX: x1,
        minY: 0,
        maxY: h,
        minZ: w.z - door / 2,
        maxZ: w.z + door / 2,
      });
    }
  }
  return out;
}

/** All barricade collision AABBs for prediction / server solids. */
export function baseWallSolids(
  walls: readonly { id: WallId; doorOpen: boolean; broken: boolean; hp?: number }[],
): Aabb[] {
  const boxes: Aabb[] = [];
  for (const wall of walls) {
    const broken = wall.broken || (wall.hp !== undefined && wall.hp <= 0);
    boxes.push(...wallSolidAabbs(wall.id, wall.doorOpen, broken));
  }
  return boxes;
}

function propBox(x: number, z: number, sx: number, sy: number, sz: number): Aabb {
  return {
    minX: x - sx / 2,
    maxX: x + sx / 2,
    minY: 0,
    maxY: sy,
    minZ: z - sz / 2,
    maxZ: z + sz / 2,
  };
}

/** Core pillar + storage + workbench + generator. */
export function baseFacilityAabbs(): Aabb[] {
  const core = BASE_LAYOUT.core;
  const s = BASE_LAYOUT.storage;
  const wb = BASE_LAYOUT.workbench;
  const gen = BASE_LAYOUT.generator;
  const coreW = core.radius * 1.7;
  return [
    propBox(core.x, core.z, coreW, 2.5, coreW),
    propBox(s.x, s.z, 0.88, 0.95, 0.72),
    propBox(wb.x, wb.z, 1.05, 0.9, 0.72),
    propBox(gen.x, gen.z, 0.92, 1.0, 0.78),
  ];
}
