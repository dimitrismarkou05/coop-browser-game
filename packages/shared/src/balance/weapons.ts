export type WeaponId = "pistol" | "melee";

export type WeaponDef = {
  id: WeaponId;
  label: string;
  damage: number;
  range: number;
  cooldown: number;
  /** Degrees half-angle for melee cone; unused for hitscan pistol. */
  coneDeg?: number;
  ammoCost: number;
};

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol: {
    id: "pistol",
    label: "Pistol",
    damage: 18,
    range: 35,
    cooldown: 0.28,
    ammoCost: 1,
  },
  melee: {
    id: "melee",
    label: "Crowbar",
    damage: 22,
    range: 1.85,
    cooldown: 0.55,
    coneDeg: 50,
    ammoCost: 0,
  },
};

export const COMBAT = {
  startingAmmo: 48,
  reviveRange: 2.2,
  reviveDuration: 5.0,
  reviveHpFraction: 0.35,
  bleedoutSeconds: 28,
  downedMoveMul: 0,
} as const;
