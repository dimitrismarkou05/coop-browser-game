export type WeaponId = "fists" | "knife" | "sword" | "axe" | "pistol" | "smg" | "ar";

export type WeaponDef = {
  id: WeaponId;
  label: string;
  damage: number;
  range: number;
  cooldown: number;
  /** Degrees half-angle for melee cone; unused for guns. */
  coneDeg?: number;
  ammoCost: number;
  kind: "gun" | "melee";
};

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  fists: {
    id: "fists",
    label: "Fists",
    damage: 12,
    range: 1.5,
    cooldown: 0.45,
    coneDeg: 55,
    ammoCost: 0,
    kind: "melee",
  },
  knife: {
    id: "knife",
    label: "Knife",
    damage: 18,
    range: 1.7,
    cooldown: 0.4,
    coneDeg: 45,
    ammoCost: 0,
    kind: "melee",
  },
  sword: {
    id: "sword",
    label: "Sword",
    damage: 28,
    range: 2.1,
    cooldown: 0.6,
    coneDeg: 50,
    ammoCost: 0,
    kind: "melee",
  },
  axe: {
    id: "axe",
    label: "Axe",
    damage: 34,
    range: 1.9,
    cooldown: 0.7,
    coneDeg: 40,
    ammoCost: 0,
    kind: "melee",
  },
  pistol: {
    id: "pistol",
    label: "Pistol",
    damage: 18,
    range: 35,
    cooldown: 0.28,
    ammoCost: 1,
    kind: "gun",
  },
  smg: {
    id: "smg",
    label: "SMG",
    damage: 12,
    range: 28,
    cooldown: 0.12,
    ammoCost: 1,
    kind: "gun",
  },
  ar: {
    id: "ar",
    label: "AR",
    damage: 22,
    range: 42,
    cooldown: 0.18,
    ammoCost: 1,
    kind: "gun",
  },
};

/** @deprecated use fists — kept for older melee call sites */
export const MELEE_FALLBACK = WEAPONS.fists;

export const COMBAT = {
  reviveRange: 2.2,
  reviveDuration: 5.0,
  reviveHpFraction: 0.35,
  bleedoutSeconds: 28,
  downedMoveMul: 0,
} as const;

/** Hunger / passive regen (food is the stamina meter). */
export const SURVIVAL = {
  maxHunger: 100,
  startingHunger: 100,
  /** Baseline hunger drain / sec (idle & walk). ~28 min to empty from full. */
  hungerDrainPerSec: 0.06,
  /** Extra hunger drain / sec while sprinting. */
  hungerSprintDrainPerSec: 0.85,
  /** HP restored / sec when hunger is high enough. */
  hpRegenPerSec: 4,
  /** Need at least this much hunger (absolute) to regen HP. */
  hpRegenMinHunger: 50,
  /** Hunger restored per food item eaten. */
  foodRestore: 32,
  eatCooldown: 0.55,
} as const;
