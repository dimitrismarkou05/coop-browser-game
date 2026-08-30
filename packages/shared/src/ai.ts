import { moveWithAabbCollision, type Aabb } from "./math.js";

/** Move an entity toward a world XZ target with AABB collision. */
export function moveToward(
  x: number,
  z: number,
  targetX: number,
  targetZ: number,
  speed: number,
  dt: number,
  radius: number,
  solids: readonly Aabb[],
): { x: number; z: number; yaw: number } {
  const dx = targetX - x;
  const dz = targetZ - z;
  const dist = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, -dz);

  if (dist < 0.001) {
    return { x, z, yaw };
  }

  const step = Math.min(speed * dt, dist);
  const mx = (dx / dist) * step;
  const mz = (dz / dist) * step;
  const moved = moveWithAabbCollision(x, z, mx, mz, radius, solids);
  return { x: moved.x, z: moved.z, yaw };
}

export function distXZ(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}
