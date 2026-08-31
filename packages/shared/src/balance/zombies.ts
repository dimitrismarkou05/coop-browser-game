export type ZombieTypeId = "walker" | "runner" | "bruiser";

export type ZombieDef = {
  id: ZombieTypeId;
  label: string;
  color: number;
  radius: number;
  height: number;
  speed: number;
  maxHp: number;
  damage: number;
  attackRange: number;
  attackCooldown: number;
  aggroRange: number;
};

/** Hitscan capsule (must match server tryShoot + client debug wireframe). */
export function zombieHitCapsule(def: ZombieDef): {
  radius: number;
  minY: number;
  maxY: number;
} {
  return {
    radius: def.radius,
    minY: 0,
    maxY: def.height + 0.15,
  };
}

export const ZOMBIE_DEFS: Record<ZombieTypeId, ZombieDef> = {
  walker: {
    id: "walker",
    label: "Walker",
    color: 0x5a7a4a,
    /** ~torso + arms; keep pathable through doors (width 2.6). */
    radius: 0.42,
    height: 1.75,
    speed: 2.2,
    /** ~3 pistol shots (pistol damage 18). */
    maxHp: 54,
    damage: 8,
    attackRange: 1.15,
    attackCooldown: 0.9,
    aggroRange: 55,
  },
  runner: {
    id: "runner",
    label: "Runner",
    color: 0x8a4a3a,
    radius: 0.38,
    height: 1.65,
    speed: 4.4,
    maxHp: 54,
    damage: 6,
    attackRange: 1.05,
    attackCooldown: 0.7,
    aggroRange: 60,
  },
  bruiser: {
    id: "bruiser",
    label: "Bruiser",
    color: 0x4a3a5a,
    radius: 0.55,
    height: 2.05,
    speed: 1.6,
    maxHp: 108,
    damage: 18,
    attackRange: 1.35,
    attackCooldown: 1.25,
    aggroRange: 45,
  },
};
