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

export const ZOMBIE_DEFS: Record<ZombieTypeId, ZombieDef> = {
  walker: {
    id: "walker",
    label: "Walker",
    color: 0x5a7a4a,
    radius: 0.38,
    height: 1.7,
    speed: 2.2,
    maxHp: 40,
    damage: 8,
    attackRange: 1.15,
    attackCooldown: 0.9,
    aggroRange: 55,
  },
  runner: {
    id: "runner",
    label: "Runner",
    color: 0x8a4a3a,
    radius: 0.32,
    height: 1.55,
    speed: 4.4,
    maxHp: 28,
    damage: 6,
    attackRange: 1.05,
    attackCooldown: 0.7,
    aggroRange: 60,
  },
  bruiser: {
    id: "bruiser",
    label: "Bruiser",
    color: 0x4a3a5a,
    radius: 0.5,
    height: 2.1,
    speed: 1.6,
    maxHp: 120,
    damage: 18,
    attackRange: 1.35,
    attackCooldown: 1.25,
    aggroRange: 45,
  },
};

