export type ResourceId = "food" | "scrap" | "wood" | "ammo" | "medkit";

export type ResourceBag = Record<ResourceId, number>;

export const RESOURCE_IDS: readonly ResourceId[] = [
  "food",
  "scrap",
  "wood",
  "ammo",
  "medkit",
] as const;

export const RESOURCE_LABELS: Record<ResourceId, string> = {
  food: "Food",
  scrap: "Scrap",
  wood: "Wood",
  ammo: "Ammo",
  medkit: "Medkit",
};

/** Weight per unit toward carry capacity. */
export const RESOURCE_WEIGHT: Record<ResourceId, number> = {
  food: 1,
  scrap: 1,
  wood: 1,
  ammo: 1,
  medkit: 2,
};

export const LOOT = {
  carryMaxWeight: 12,
  searchDuration: 0.85,
  interactRange: 2.4,
  storageRange: 2.6,
  depositDuration: 0.45,
  withdrawDuration: 0.45,
  /** Units moved per withdraw action, per resource that has stock. */
  withdrawChunk: 3,
} as const;

export function emptyBag(): ResourceBag {
  return { food: 0, scrap: 0, wood: 0, ammo: 0, medkit: 0 };
}

export function bagWeight(bag: ResourceBag): number {
  let w = 0;
  for (const id of RESOURCE_IDS) {
    w += bag[id] * RESOURCE_WEIGHT[id];
  }
  return w;
}

export function bagTotal(bag: ResourceBag): number {
  return RESOURCE_IDS.reduce((sum, id) => sum + bag[id], 0);
}

export function canFit(bag: ResourceBag, add: Partial<ResourceBag>): boolean {
  let extra = 0;
  for (const id of RESOURCE_IDS) {
    extra += (add[id] ?? 0) * RESOURCE_WEIGHT[id];
  }
  return bagWeight(bag) + extra <= LOOT.carryMaxWeight + 1e-6;
}

export function addToBag(bag: ResourceBag, add: Partial<ResourceBag>): ResourceBag {
  const next = { ...bag };
  for (const id of RESOURCE_IDS) {
    const n = add[id] ?? 0;
    if (n) next[id] += n;
  }
  return next;
}

/** Move as much as possible from `from` into `to` without exceeding carry weight. */
export function transferFill(
  from: ResourceBag,
  to: ResourceBag,
  maxWeight = LOOT.carryMaxWeight,
): { from: ResourceBag; to: ResourceBag; moved: ResourceBag } {
  const nextFrom = { ...from };
  const nextTo = { ...to };
  const moved = emptyBag();
  let weight = bagWeight(nextTo);

  for (const id of RESOURCE_IDS) {
    while (nextFrom[id] > 0) {
      const w = RESOURCE_WEIGHT[id];
      if (weight + w > maxWeight + 1e-6) break;
      nextFrom[id] -= 1;
      nextTo[id] += 1;
      moved[id] += 1;
      weight += w;
    }
  }
  return { from: nextFrom, to: nextTo, moved };
}

export function transferAll(from: ResourceBag, to: ResourceBag): { from: ResourceBag; to: ResourceBag } {
  const nextTo = { ...to };
  for (const id of RESOURCE_IDS) {
    nextTo[id] += from[id];
  }
  return { from: emptyBag(), to: nextTo };
}

export type LootTableEntry = { id: ResourceId; min: number; max: number; chance: number };

export type LootSpotDef = {
  id: string;
  label: string;
  x: number;
  z: number;
  table: LootTableEntry[];
};

/** Spots sit outside solid buildings so players can reach them. */
export const LOOT_SPOTS: readonly LootSpotDef[] = [
  {
    id: "shop",
    label: "Corner shop",
    x: 14,
    z: -6.2,
    table: [
      { id: "food", min: 1, max: 3, chance: 0.9 },
      { id: "ammo", min: 4, max: 10, chance: 0.7 },
      { id: "scrap", min: 1, max: 2, chance: 0.35 },
    ],
  },
  {
    id: "garage",
    label: "Garage",
    x: -16,
    z: -3.8,
    table: [
      { id: "scrap", min: 2, max: 5, chance: 0.95 },
      { id: "wood", min: 2, max: 4, chance: 0.8 },
      { id: "ammo", min: 2, max: 6, chance: 0.3 },
    ],
  },
  {
    id: "apartments",
    label: "Apartments",
    x: 12,
    z: 9.2,
    table: [
      { id: "food", min: 1, max: 2, chance: 0.75 },
      { id: "scrap", min: 1, max: 3, chance: 0.6 },
      { id: "medkit", min: 1, max: 1, chance: 0.25 },
      { id: "ammo", min: 2, max: 5, chance: 0.4 },
    ],
  },
  {
    id: "clinic",
    label: "Clinic",
    x: -12,
    z: 7.5,
    table: [
      { id: "medkit", min: 1, max: 2, chance: 0.85 },
      { id: "food", min: 1, max: 2, chance: 0.5 },
      { id: "ammo", min: 1, max: 4, chance: 0.25 },
    ],
  },
  {
    id: "debris",
    label: "Street debris",
    x: 4,
    z: -15.5,
    table: [
      { id: "wood", min: 1, max: 3, chance: 0.9 },
      { id: "scrap", min: 1, max: 2, chance: 0.7 },
    ],
  },
  {
    id: "police",
    label: "Police cache",
    x: -6,
    z: -12,
    table: [
      { id: "ammo", min: 8, max: 16, chance: 0.95 },
      { id: "scrap", min: 1, max: 2, chance: 0.4 },
      { id: "medkit", min: 1, max: 1, chance: 0.2 },
    ],
  },
];

export const STORAGE_POS = { x: 3.2, y: 0, z: 0.5 } as const;

export function rollLootTable(table: readonly LootTableEntry[]): ResourceBag {
  const bag = emptyBag();
  for (const entry of table) {
    if (Math.random() > entry.chance) continue;
    const n = entry.min + Math.floor(Math.random() * (entry.max - entry.min + 1));
    bag[entry.id] += n;
  }
  return bag;
}

export function formatBag(bag: ResourceBag): string {
  const parts: string[] = [];
  for (const id of RESOURCE_IDS) {
    if (bag[id] > 0) parts.push(`${RESOURCE_LABELS[id]} ${bag[id]}`);
  }
  return parts.length ? parts.join(", ") : "nothing";
}
