import { PLAYER } from "./constants.js";
import { moveWithAabbCollision, type Aabb } from "./math.js";

export type MoveAxes = {
  forward: number;
  strafe: number;
};

/** Normalize WASD-style axes to unit length. */
export function normalizeAxes(forward: number, strafe: number): MoveAxes {
  const len = Math.hypot(forward, strafe);
  if (len <= 0) return { forward: 0, strafe: 0 };
  return { forward: forward / len, strafe: strafe / len };
}

/**
 * Apply one movement step in XZ. yaw 0 → -Z (Three.js camera.rotation.y).
 */
export function applyPlayerMovement(
  x: number,
  z: number,
  yaw: number,
  forward: number,
  strafe: number,
  dt: number,
  solids: readonly Aabb[],
  radius = PLAYER.radius,
  speed = PLAYER.moveSpeed,
): { x: number; z: number } {
  const axes = normalizeAxes(forward, strafe);
  if (axes.forward === 0 && axes.strafe === 0) {
    return { x, z };
  }

  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const dist = speed * dt;
  const dx = (-sin * axes.forward + cos * axes.strafe) * dist;
  const dz = (-cos * axes.forward - sin * axes.strafe) * dist;

  return moveWithAabbCollision(x, z, dx, dz, radius, solids);
}

export function clampPitch(pitch: number): number {
  return Math.max(PLAYER.pitchMin, Math.min(PLAYER.pitchMax, pitch));
}
