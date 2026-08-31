import type { Aabb } from "./math.js";
import { MAP } from "./constants.js";

export type MapBuilding = {
  id: string;
  label: string;
  color: number;
  box: Aabb;
  /** If false, rendered but not solid (e.g. safehouse floor pad). */
  solid?: boolean;
};

function boxFromCenter(
  cx: number,
  cz: number,
  sx: number,
  sy: number,
  sz: number,
  y = 0,
): Aabb {
  const hx = sx / 2;
  const hz = sz / 2;
  return {
    minX: cx - hx,
    maxX: cx + hx,
    minY: y,
    maxY: y + sy,
    minZ: cz - hz,
    maxZ: cz + hz,
  };
}

/** Compact placeholder neighborhood for M2+. */
export const PLACEHOLDER_BUILDINGS: readonly MapBuilding[] = [
  {
    id: "safehouse-pad",
    label: "Safehouse",
    color: 0x3d9a5f,
    box: boxFromCenter(0, 0, 17, 0.15, 17),
    solid: false,
  },
  {
    id: "safehouse-beacon",
    label: "Beacon",
    color: 0x7dffb3,
    box: boxFromCenter(0, 0, 0.5, 4.5, 0.5),
    solid: false,
  },
  {
    id: "shop",
    label: "Corner shop",
    color: 0x8b5a2b,
    box: boxFromCenter(14, -10, 6, 3, 5),
  },
  {
    id: "garage",
    label: "Garage",
    color: 0x6b7280,
    box: boxFromCenter(-16, -8, 7, 2.8, 6),
  },
  {
    id: "apartments",
    label: "Apartments",
    color: 0x5b4b8a,
    box: boxFromCenter(12, 14, 10, 5, 7),
  },
  {
    id: "clinic",
    label: "Clinic",
    color: 0x3d7ea6,
    box: boxFromCenter(-12, 12, 6, 3.4, 6),
  },
  {
    id: "debris",
    label: "Debris",
    color: 0x5c4033,
    box: boxFromCenter(4, -18, 3, 1.2, 3),
  },
];

/**
 * Quarantine pen south of town. Ambient zombies spawn and stay here.
 * North wall has a player walkway gap; zombies are soft-clamped inside.
 */
export const ZOMBIE_PEN = {
  minX: -14,
  maxX: 14,
  minZ: -38,
  maxZ: -22,
  /** Inset used when clamping zombies so they don't sit in the fence. */
  pad: 1.2,
} as const;

export function createZombiePenFences(): Aabb[] {
  const { minX, maxX, minZ, maxZ } = ZOMBIE_PEN;
  const t = 0.6;
  const h = 3.2;
  /** Wide enough for players (radius + inflate) to walk in from the north. */
  const gateGap = 5.5;
  const mid = (minX + maxX) / 2;
  return [
    // South
    { minX: minX - t, maxX: maxX + t, minY: 0, maxY: h, minZ: minZ - t, maxZ: minZ },
    // East / West
    { minX: maxX, maxX: maxX + t, minY: 0, maxY: h, minZ: minZ, maxZ: maxZ },
    { minX: minX - t, maxX: minX, minY: 0, maxY: h, minZ: minZ, maxZ: maxZ },
    // North split around gate gap
    { minX: minX - t, maxX: mid - gateGap / 2, minY: 0, maxY: h, minZ: maxZ, maxZ: maxZ + t },
    { minX: mid + gateGap / 2, maxX: maxX + t, minY: 0, maxY: h, minZ: maxZ, maxZ: maxZ + t },
  ];
}

export function createZombiePenVisuals(): MapBuilding[] {
  return createZombiePenFences().map((box, i) => ({
    id: `pen-fence-${i}`,
    label: "Quarantine fence",
    color: 0x6b2a2a,
    box,
    solid: true,
  }));
}

/** Outer walls so you can't walk off the map. */
export function createBoundaryWalls(half = MAP.halfExtent): Aabb[] {
  const t = 1;
  const h = 4;
  return [
    { minX: -half - t, maxX: half + t, minY: 0, maxY: h, minZ: -half - t, maxZ: -half },
    { minX: -half - t, maxX: half + t, minY: 0, maxY: h, minZ: half, maxZ: half + t },
    { minX: -half - t, maxX: -half, minY: 0, maxY: h, minZ: -half, maxZ: half },
    { minX: half, maxX: half + t, minY: 0, maxY: h, minZ: -half, maxZ: half },
  ];
}

export function getSolidAabbs(): Aabb[] {
  const buildings = PLACEHOLDER_BUILDINGS.filter((b) => b.solid !== false).map((b) => b.box);
  return [...buildings, ...createZombiePenFences(), ...createBoundaryWalls()];
}

export function clampToZombiePen(x: number, z: number): { x: number; z: number } {
  const p = ZOMBIE_PEN.pad;
  return {
    x: Math.min(ZOMBIE_PEN.maxX - p, Math.max(ZOMBIE_PEN.minX + p, x)),
    z: Math.min(ZOMBIE_PEN.maxZ - p, Math.max(ZOMBIE_PEN.minZ + p, z)),
  };
}

export function randomPointInZombiePen(): { x: number; z: number } {
  const p = ZOMBIE_PEN.pad + 0.5;
  return {
    x: ZOMBIE_PEN.minX + p + Math.random() * (ZOMBIE_PEN.maxX - ZOMBIE_PEN.minX - 2 * p),
    z: ZOMBIE_PEN.minZ + p + Math.random() * (ZOMBIE_PEN.maxZ - ZOMBIE_PEN.minZ - 2 * p),
  };
}

export function isInsideZombiePen(x: number, z: number): boolean {
  return (
    x >= ZOMBIE_PEN.minX &&
    x <= ZOMBIE_PEN.maxX &&
    z >= ZOMBIE_PEN.minZ &&
    z <= ZOMBIE_PEN.maxZ
  );
}

/** Spawn inside the safehouse, clear of the core pillar. */
export const SPAWN_POSITION = { x: 3.5, y: 0, z: 3.5 } as const;

/** Per-slot offsets so players don't stack on join (inside expanded walls ±8). */
export const SPAWN_OFFSETS: readonly { x: number; z: number }[] = [
  { x: 0, z: 0 },
  { x: -2.5, z: 0 },
  { x: 0, z: -2.5 },
  { x: -2.5, z: -2.5 },
];
