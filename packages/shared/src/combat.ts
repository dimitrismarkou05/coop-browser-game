import type { Aabb, Vec3 } from "./math.js";
import { PLAYER } from "./constants.js";

export function lookDirection(yaw: number, pitch: number): Vec3 {
  const cp = Math.cos(pitch);
  return {
    x: -Math.sin(yaw) * cp,
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * cp,
  };
}

export function eyePosition(x: number, y: number, z: number): Vec3 {
  return { x, y: y + PLAYER.eyeHeight, z };
}

/** Ray vs AABB. Returns distance along ray or null. */
export function raycastAabb(
  origin: Vec3,
  dir: Vec3,
  box: Aabb,
  maxDist: number,
): number | null {
  let tMin = 0;
  let tMax = maxDist;

  const axes: Array<{ o: number; d: number; min: number; max: number }> = [
    { o: origin.x, d: dir.x, min: box.minX, max: box.maxX },
    { o: origin.y, d: dir.y, min: box.minY, max: box.maxY },
    { o: origin.z, d: dir.z, min: box.minZ, max: box.maxZ },
  ];

  for (const a of axes) {
    if (Math.abs(a.d) < 1e-8) {
      if (a.o < a.min || a.o > a.max) return null;
      continue;
    }
    const inv = 1 / a.d;
    let t1 = (a.min - a.o) * inv;
    let t2 = (a.max - a.o) * inv;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }

  return tMin >= 0 ? tMin : tMax >= 0 ? tMax : null;
}

export function firstWallHit(
  origin: Vec3,
  dir: Vec3,
  maxDist: number,
  solids: readonly Aabb[],
): number | null {
  let best: number | null = null;
  for (const box of solids) {
    const t = raycastAabb(origin, dir, box, maxDist);
    if (t !== null && t > 0.05 && (best === null || t < best)) {
      best = t;
    }
  }
  return best;
}

/** Distance to sphere hit along ray, or null. */
export function raycastSphere(
  origin: Vec3,
  dir: Vec3,
  center: Vec3,
  radius: number,
  maxDist: number,
): number | null {
  const ox = origin.x - center.x;
  const oy = origin.y - center.y;
  const oz = origin.z - center.z;
  const b = ox * dir.x + oy * dir.y + oz * dir.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const t0 = -b - s;
  const t1 = -b + s;
  const t = t0 >= 0 ? t0 : t1;
  if (t < 0 || t > maxDist) return null;
  return t;
}

/** Horizontal ray vs vertical capsule (circle in XZ + height band). */
export function raycastCapsuleXZ(
  origin: Vec3,
  dir: Vec3,
  cx: number,
  cz: number,
  radius: number,
  minY: number,
  maxY: number,
  maxDist: number,
): number | null {
  const dx = dir.x;
  const dz = dir.z;
  const flat = Math.hypot(dx, dz);
  if (flat < 1e-6) {
    // Nearly vertical aim — fall back to sphere at mid height.
    return raycastSphere(
      origin,
      dir,
      { x: cx, y: (minY + maxY) / 2, z: cz },
      radius,
      maxDist,
    );
  }

  const ox = origin.x - cx;
  const oz = origin.z - cz;
  const a = dx * dx + dz * dz;
  const b = 2 * (ox * dx + oz * dz);
  const c = ox * ox + oz * oz - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const t0 = (-b - s) / (2 * a);
  const t1 = (-b + s) / (2 * a);
  for (const t of [t0, t1]) {
    if (t < 0 || t > maxDist) continue;
    const y = origin.y + dir.y * t;
    if (y >= minY && y <= maxY) return t;
  }
  return null;
}

export function forwardFlat(yaw: number): { x: number; z: number } {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

export function inMeleeCone(
  attackerX: number,
  attackerZ: number,
  yaw: number,
  targetX: number,
  targetZ: number,
  range: number,
  coneDeg: number,
): boolean {
  const dx = targetX - attackerX;
  const dz = targetZ - attackerZ;
  const dist = Math.hypot(dx, dz);
  if (dist > range || dist < 0.01) return false;
  const f = forwardFlat(yaw);
  const dot = (dx / dist) * f.x + (dz / dist) * f.z;
  const cos = Math.cos((coneDeg * Math.PI) / 180);
  return dot >= cos;
}
