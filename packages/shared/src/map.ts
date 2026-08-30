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
    box: boxFromCenter(0, 0, 10, 0.15, 10),
    solid: false,
  },
  {
    id: "safehouse-beacon",
    label: "Beacon",
    color: 0x7dffb3,
    box: boxFromCenter(0, 0, 0.5, 4.5, 0.5),
    solid: true,
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
  return [...buildings, ...createBoundaryWalls()];
}

/** Spawn on the safehouse pad. */
export const SPAWN_POSITION = { x: 0, y: 0, z: 4 } as const;

/** Per-slot offsets so players don't stack on join. */
export const SPAWN_OFFSETS: readonly { x: number; z: number }[] = [
  { x: 2.5, z: 3 },
  { x: -2.5, z: 3 },
  { x: 2.5, z: 5 },
  { x: -2.5, z: 5 },
];

