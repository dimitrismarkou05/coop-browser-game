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

/** Push a point out of any overlapping inflated AABB (min translation on XZ). */
export function resolveCircleAabbOverlap(
  x: number,
  z: number,
  radius: number,
  solids: readonly Aabb[],
): { x: number; z: number } {
  let nx = x;
  let nz = z;
  for (const box of solids) {
    const b = inflateAabbXZ(box, radius);
    if (nx <= b.minX || nx >= b.maxX || nz <= b.minZ || nz >= b.maxZ) continue;

    const penLeft = nx - b.minX;
    const penRight = b.maxX - nx;
    const penDown = nz - b.minZ;
    const penUp = b.maxZ - nz;
    const minPen = Math.min(penLeft, penRight, penDown, penUp);
    if (minPen === penLeft) nx = b.minX;
    else if (minPen === penRight) nx = b.maxX;
    else if (minPen === penDown) nz = b.minZ;
    else nz = b.maxZ;
  }
  return { x: nx, z: nz };
}

/**
 * Move a point in XZ against solid AABBs (capsule approximated as circle in XZ).
 * Separates axes to slide along walls. Resolves penetration before/after move
 * so you never get teleported to the opposite face of a volume you're inside.
 */
export function moveWithAabbCollision(
  x: number,
  z: number,
  dx: number,
  dz: number,
  radius: number,
  solids: readonly Aabb[],
): { x: number; z: number } {
  // Clear any existing overlap first (spawn / desync).
  let start = resolveCircleAabbOverlap(x, z, radius, solids);
  let nx = start.x;
  let nz = start.z;

  if (dx !== 0) {
    const tryX = nx + dx;
    let blocked = false;
    for (const box of solids) {
      const b = inflateAabbXZ(box, radius);
      if (nz > b.minZ && nz < b.maxZ && tryX > b.minX && tryX < b.maxX) {
        blocked = true;
        nx = dx > 0 ? b.minX : b.maxX;
        break;
      }
    }
    if (!blocked) nx = tryX;
  }

  if (dz !== 0) {
    const tryZ = nz + dz;
    let blocked = false;
    for (const box of solids) {
      const b = inflateAabbXZ(box, radius);
      if (nx > b.minX && nx < b.maxX && tryZ > b.minZ && tryZ < b.maxZ) {
        blocked = true;
        nz = dz > 0 ? b.minZ : b.maxZ;
        break;
      }
    }
    if (!blocked) nz = tryZ;
  }

  return resolveCircleAabbOverlap(nx, nz, radius, solids);
}
