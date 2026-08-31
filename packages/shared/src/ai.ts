import { moveWithAabbCollision, type Aabb } from "./math.js";

/** Yaw so lookDirection(yaw,0) / model forward (−Z) points toward target. */
export function yawToward(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
): number {
  return Math.atan2(-(toX - fromX), -(toZ - fromZ));
}

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
  const yaw = yawToward(x, z, targetX, targetZ);

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
