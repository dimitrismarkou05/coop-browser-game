import { PLAYER } from "./constants.js";
import { moveWithAabbCollision, type Aabb } from "./math.js";

export type MoveAxes = {
  forward: number;
  strafe: number;
};

export type VerticalState = {
  y: number;
  vy: number;
  grounded: boolean;
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

/** Integrate jump / gravity. Ground is y=0 for V1 (flat map). */
export function applyVerticalMovement(
  y: number,
  vy: number,
  jumpQueued: boolean,
  dt: number,
  groundedIn = y <= 0.001 && vy <= 0,
): VerticalState {
  let nextVy = vy;
  let grounded = groundedIn;

  if (jumpQueued && grounded) {
    nextVy = PLAYER.jumpSpeed;
    grounded = false;
  }

  nextVy -= PLAYER.gravity * dt;
  let nextY = y + nextVy * dt;

  if (nextY <= 0) {
    nextY = 0;
    nextVy = 0;
    grounded = true;
  } else {
    grounded = false;
  }

  return { y: nextY, vy: nextVy, grounded };
}

export function clampPitch(pitch: number): number {
  return Math.max(PLAYER.pitchMin, Math.min(PLAYER.pitchMax, pitch));
}
