export type Vec3 = { x: number; y: number; z: number };

export type Aabb = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

/** Expand AABB horizontally by radius for capsule-vs-box in XZ. */
export function inflateAabbXZ(box: Aabb, radius: number): Aabb {
  return {
    minX: box.minX - radius,
    maxX: box.maxX + radius,
    minY: box.minY,
    maxY: box.maxY,
    minZ: box.minZ - radius,
    maxZ: box.maxZ + radius,
  };
}

/**
 * Move a point in XZ against solid AABBs (capsule approximated as circle in XZ).
 * Separates axes to slide along walls.
 */
export function moveWithAabbCollision(
  x: number,
  z: number,
  dx: number,
  dz: number,
  radius: number,
  solids: readonly Aabb[],
): { x: number; z: number } {
  let nx = x;
  let nz = z;

  if (dx !== 0) {
    nx = x + dx;
    for (const box of solids) {
      const b = inflateAabbXZ(box, radius);
      if (nz > b.minZ && nz < b.maxZ && nx > b.minX && nx < b.maxX) {
        nx = dx > 0 ? b.minX : b.maxX;
      }
    }
  }

  if (dz !== 0) {
    nz = z + dz;
    for (const box of solids) {
      const b = inflateAabbXZ(box, radius);
      if (nx > b.minX && nx < b.maxX && nz > b.minZ && nz < b.maxZ) {
        nz = dz > 0 ? b.minZ : b.maxZ;
      }
    }
  }

  return { x: nx, z: nz };
}
