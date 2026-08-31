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

/**
 * Ray vs vertical capsule (infinite XZ circle clipped to [minY, maxY]).
 * Accepts any t on the cylinder segment whose Y lies in the height band
 * (not only the discrete entry/exit samples — fixes near-miss headshots).
 */
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
  let tEnter = (-b - s) / (2 * a);
  let tExit = (-b + s) / (2 * a);
  if (tEnter > tExit) {
    const tmp = tEnter;
    tEnter = tExit;
    tExit = tmp;
  }

  const tLo = Math.max(0, tEnter);
  const tHi = Math.min(maxDist, tExit);
  if (tLo > tHi) return null;

  const y0 = origin.y + dir.y * tLo;
  const y1 = origin.y + dir.y * tHi;
  const dy = dir.y;

  // Entire segment already in band — take earliest.
  if (y0 >= minY && y0 <= maxY) return tLo;
  if (Math.abs(dy) < 1e-8) {
    // Horizontal ray: either whole segment is in band or none.
    return y0 >= minY && y0 <= maxY ? tLo : null;
  }

  // Clip segment to Y planes and take earliest valid t.
  let best: number | null = null;
  const candidates = [tLo, tHi];
  if (dy !== 0) {
    candidates.push((minY - origin.y) / dy);
    candidates.push((maxY - origin.y) / dy);
  }
  for (const t of candidates) {
    if (t < tLo - 1e-6 || t > tHi + 1e-6) continue;
    const y = origin.y + dy * t;
    if (y < minY - 1e-4 || y > maxY + 1e-4) continue;
    if (best === null || t < best) best = Math.max(tLo, Math.min(tHi, t));
  }
  return best;
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
