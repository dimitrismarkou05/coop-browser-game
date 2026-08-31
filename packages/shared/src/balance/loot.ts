/** Slot-based items, hotbar, inventory, storage, loot containers. */

import { BASE_LAYOUT } from "./baseUpgrades.js";

export type ItemId =
  | "food"
  | "scrap"
  | "wood"
  | "ammo"
  | "medkit"
  | "pistol"
  | "smg"
  | "ar"
  | "shotgun"
  | "knife"
  | "sword"
  | "axe";

export type ItemKind = "resource" | "gun" | "melee";

export type ItemDef = {
  id: ItemId;
  label: string;
  kind: ItemKind;
  maxStack: number;
  /** Hotbar / slot tint (CSS hex). */
  color: string;
  /** Links to WEAPONS when kind is gun or melee. */
  weaponId?: ItemId;
};

export type ItemStack = { id: ItemId; count: number };
export type Slot = ItemStack | null;

export const ITEM_IDS: readonly ItemId[] = [
  "food",
  "scrap",
  "wood",
  "ammo",
  "medkit",
  "pistol",
  "smg",
  "ar",
  "shotgun",
  "knife",
  "sword",
  "axe",
] as const;

export const ITEMS: Record<ItemId, ItemDef> = {
  food: { id: "food", label: "Food", kind: "resource", maxStack: 16, color: "#c4a35a" },
  scrap: { id: "scrap", label: "Scrap", kind: "resource", maxStack: 32, color: "#8b949e" },
  wood: { id: "wood", label: "Wood", kind: "resource", maxStack: 32, color: "#8b5a2b" },
  ammo: { id: "ammo", label: "Ammo", kind: "resource", maxStack: 48, color: "#d29922" },
  medkit: { id: "medkit", label: "Medkit", kind: "resource", maxStack: 4, color: "#f85149" },
  pistol: {
    id: "pistol",
    label: "Pistol",
    kind: "gun",
    maxStack: 1,
    color: "#6e7681",
    weaponId: "pistol",
  },
  smg: { id: "smg", label: "SMG", kind: "gun", maxStack: 1, color: "#58a6ff", weaponId: "smg" },
  ar: { id: "ar", label: "AR", kind: "gun", maxStack: 1, color: "#3d9a5f", weaponId: "ar" },
  shotgun: {
    id: "shotgun",
    label: "Shotgun",
    kind: "gun",
    maxStack: 1,
    color: "#9a3412",
    weaponId: "shotgun",
  },
  knife: {
    id: "knife",
    label: "Knife",
    kind: "melee",
    maxStack: 1,
    color: "#c9d1d9",
    weaponId: "knife",
  },
  sword: {
    id: "sword",
    label: "Sword",
    kind: "melee",
    maxStack: 1,
    color: "#a371f7",
    weaponId: "sword",
  },
  axe: { id: "axe", label: "Axe", kind: "melee", maxStack: 1, color: "#db6d28", weaponId: "axe" },
};

export const INV = {
  hotbarSize: 6,
  invSize: 18, // 3 × 6
  invCols: 6,
  invRows: 3,
  storageSize: 36, // 4 × 9
  storageCols: 9,
  storageRows: 4,
  interactRange: 2.4,
  storageRange: 2.6,
} as const;

/** Compat alias used by older call sites. */
export const LOOT = {
  interactRange: INV.interactRange,
  storageRange: INV.storageRange,
  carryMaxWeight: 999,
  searchDuration: 0,
  depositDuration: 0,
  withdrawDuration: 0,
  withdrawChunk: 0,
} as const;

/** Shared storage crate position (west facility row). */
export const STORAGE_POS = {
  x: BASE_LAYOUT.storage.x,
  y: BASE_LAYOUT.storage.y,
  z: BASE_LAYOUT.storage.z,
} as const;

export type SlotBag = "hotbar" | "inv" | "storage" | "loot";

export function emptySlots(n: number): Slot[] {
  return Array.from({ length: n }, () => null);
}

export function cloneSlots(slots: readonly Slot[]): Slot[] {
  return slots.map((s) => (s ? { id: s.id, count: s.count } : null));
}

export function isItemId(raw: unknown): raw is ItemId {
  return typeof raw === "string" && raw in ITEMS;
}

export function countItem(slots: readonly Slot[], id: ItemId): number {
  let n = 0;
  for (const s of slots) {
    if (s?.id === id) n += s.count;
  }
  return n;
}

/** Consume up to `amount`. Returns remaining amount that could not be taken. */
export function consumeItem(slots: Slot[], id: ItemId, amount: number): number {
  let left = amount;
  for (let i = 0; i < slots.length && left > 0; i++) {
    const s = slots[i];
    if (!s || s.id !== id) continue;
    const take = Math.min(s.count, left);
    s.count -= take;
    left -= take;
    if (s.count <= 0) slots[i] = null;
  }
  return left;
}

/** Move / merge / swap stack from → to. Mutates both arrays. */
export function moveSlots(
  fromSlots: Slot[],
  fromIndex: number,
  toSlots: Slot[],
  toIndex: number,
): boolean {
  if (
    fromIndex < 0 ||
    fromIndex >= fromSlots.length ||
    toIndex < 0 ||
    toIndex >= toSlots.length
  ) {
    return false;
  }
  if (fromSlots === toSlots && fromIndex === toIndex) return true;

  const from = fromSlots[fromIndex];
  if (!from) return true;

  const to = toSlots[toIndex];
  if (!to) {
    toSlots[toIndex] = { id: from.id, count: from.count };
    fromSlots[fromIndex] = null;
    return true;
  }

  if (to.id === from.id) {
    const max = ITEMS[to.id].maxStack;
    const space = max - to.count;
    if (space <= 0) {
      toSlots[toIndex] = from;
      fromSlots[fromIndex] = to;
      return true;
    }
    const move = Math.min(space, from.count);
    to.count += move;
    from.count -= move;
    if (from.count <= 0) fromSlots[fromIndex] = null;
    return true;
  }

  toSlots[toIndex] = from;
  fromSlots[fromIndex] = to;
  return true;
}

/**
 * Minecraft-style shift-click: pour stack into destination bag(s)
 * left→right, top→bottom (index order). Merge existing stacks first, then empties.
 * Mutates arrays. Returns true if anything moved.
 */
export function quickMoveInto(
  fromSlots: Slot[],
  fromIndex: number,
  destinations: Slot[][],
): boolean {
  if (fromIndex < 0 || fromIndex >= fromSlots.length) return false;
  const stack = fromSlots[fromIndex];
  if (!stack) return false;

  const startCount = stack.count;

  for (const toSlots of destinations) {
    if (stack.count <= 0) break;
    // Pass 1: merge
    for (let i = 0; i < toSlots.length && stack.count > 0; i++) {
      const t = toSlots[i];
      if (!t || t.id !== stack.id) continue;
      const space = ITEMS[t.id].maxStack - t.count;
      if (space <= 0) continue;
      const move = Math.min(space, stack.count);
      t.count += move;
      stack.count -= move;
    }
    // Pass 2: empty slots L→R
    for (let i = 0; i < toSlots.length && stack.count > 0; i++) {
      if (toSlots[i]) continue;
      const take = Math.min(ITEMS[stack.id].maxStack, stack.count);
      toSlots[i] = { id: stack.id, count: take };
      stack.count -= take;
    }
  }

  if (stack.count <= 0) fromSlots[fromIndex] = null;
  return stack.count < startCount;
}

export type LootTableEntry = {
  id: ItemId;
  min: number;
  max: number;
  chance: number;
};

export type LootSpotDef = {
  id: string;
  label: string;
  x: number;
  z: number;
  table: LootTableEntry[];
};

export const LOOT_SPOTS: readonly LootSpotDef[] = [
  {
    id: "shop",
    label: "Corner shop",
    x: 14,
    z: -6.2,
    table: [
      { id: "food", min: 3, max: 8, chance: 0.98 },
      { id: "ammo", min: 10, max: 28, chance: 0.95 },
      { id: "scrap", min: 3, max: 8, chance: 0.85 },
      { id: "wood", min: 2, max: 6, chance: 0.55 },
      { id: "medkit", min: 1, max: 2, chance: 0.4 },
      { id: "pistol", min: 1, max: 1, chance: 0.5 },
      { id: "knife", min: 1, max: 1, chance: 0.35 },
      { id: "smg", min: 1, max: 1, chance: 0.15 },
    ],
  },
  {
    id: "garage",
    label: "Garage",
    x: -16,
    z: -3.8,
    table: [
      { id: "scrap", min: 6, max: 16, chance: 0.98 },
      { id: "wood", min: 5, max: 14, chance: 0.95 },
      { id: "ammo", min: 6, max: 18, chance: 0.65 },
      { id: "food", min: 2, max: 5, chance: 0.5 },
      { id: "medkit", min: 1, max: 2, chance: 0.3 },
      { id: "axe", min: 1, max: 1, chance: 0.6 },
      { id: "sword", min: 1, max: 1, chance: 0.18 },
      { id: "ar", min: 1, max: 1, chance: 0.12 },
    ],
  },
  {
    id: "apartments",
    label: "Apartments",
    x: 12,
    z: 9.2,
    table: [
      { id: "food", min: 3, max: 8, chance: 0.92 },
      { id: "scrap", min: 3, max: 10, chance: 0.8 },
      { id: "wood", min: 2, max: 7, chance: 0.7 },
      { id: "ammo", min: 6, max: 16, chance: 0.7 },
      { id: "medkit", min: 1, max: 3, chance: 0.5 },
      { id: "knife", min: 1, max: 1, chance: 0.3 },
      { id: "pistol", min: 1, max: 1, chance: 0.28 },
      { id: "smg", min: 1, max: 1, chance: 0.12 },
    ],
  },
  {
    id: "clinic",
    label: "Clinic",
    x: -12,
    z: 7.5,
    table: [
      { id: "medkit", min: 3, max: 6, chance: 0.98 },
      { id: "food", min: 3, max: 7, chance: 0.85 },
      { id: "scrap", min: 2, max: 6, chance: 0.55 },
      { id: "ammo", min: 4, max: 12, chance: 0.45 },
      { id: "wood", min: 1, max: 4, chance: 0.35 },
      { id: "knife", min: 1, max: 1, chance: 0.15 },
    ],
  },
  {
    id: "debris",
    label: "Street debris",
    x: 4,
    z: -15.5,
    table: [
      { id: "wood", min: 4, max: 12, chance: 0.98 },
      { id: "scrap", min: 3, max: 10, chance: 0.92 },
      { id: "ammo", min: 3, max: 10, chance: 0.5 },
      { id: "food", min: 1, max: 4, chance: 0.45 },
      { id: "medkit", min: 1, max: 1, chance: 0.2 },
      { id: "axe", min: 1, max: 1, chance: 0.3 },
    ],
  },
  {
    id: "police",
    label: "Police cache",
    x: -6,
    z: -12,
    table: [
      { id: "ammo", min: 16, max: 40, chance: 0.98 },
      { id: "scrap", min: 3, max: 8, chance: 0.55 },
      { id: "food", min: 2, max: 5, chance: 0.4 },
      { id: "medkit", min: 1, max: 3, chance: 0.5 },
      { id: "pistol", min: 1, max: 1, chance: 0.7 },
      { id: "smg", min: 1, max: 1, chance: 0.5 },
      { id: "ar", min: 1, max: 1, chance: 0.32 },
      { id: "shotgun", min: 1, max: 1, chance: 0.18 },
      { id: "sword", min: 1, max: 1, chance: 0.22 },
    ],
  },
  {
    id: "gas",
    label: "Gas station",
    x: 18,
    z: -14,
    table: [
      { id: "food", min: 2, max: 6, chance: 0.85 },
      { id: "scrap", min: 4, max: 10, chance: 0.9 },
      { id: "wood", min: 2, max: 5, chance: 0.6 },
      { id: "ammo", min: 8, max: 20, chance: 0.75 },
      { id: "medkit", min: 1, max: 2, chance: 0.35 },
      { id: "knife", min: 1, max: 1, chance: 0.25 },
    ],
  },
  {
    id: "diner",
    label: "Diner",
    x: 8,
    z: -10,
    table: [
      { id: "food", min: 4, max: 10, chance: 0.98 },
      { id: "scrap", min: 2, max: 6, chance: 0.6 },
      { id: "wood", min: 1, max: 4, chance: 0.45 },
      { id: "ammo", min: 2, max: 8, chance: 0.35 },
      { id: "medkit", min: 1, max: 1, chance: 0.25 },
    ],
  },
  {
    id: "school",
    label: "School",
    x: -18,
    z: 12,
    table: [
      { id: "food", min: 2, max: 7, chance: 0.8 },
      { id: "scrap", min: 4, max: 12, chance: 0.88 },
      { id: "wood", min: 3, max: 9, chance: 0.75 },
      { id: "ammo", min: 4, max: 14, chance: 0.55 },
      { id: "medkit", min: 1, max: 2, chance: 0.4 },
      { id: "knife", min: 1, max: 1, chance: 0.2 },
    ],
  },
  {
    id: "church",
    label: "Church",
    x: -8,
    z: 16,
    table: [
      { id: "food", min: 3, max: 8, chance: 0.85 },
      { id: "wood", min: 4, max: 10, chance: 0.8 },
      { id: "scrap", min: 2, max: 7, chance: 0.65 },
      { id: "medkit", min: 1, max: 3, chance: 0.55 },
      { id: "ammo", min: 2, max: 8, chance: 0.3 },
    ],
  },
  {
    id: "warehouse",
    label: "Warehouse",
    x: 18,
    z: 8,
    table: [
      { id: "scrap", min: 8, max: 20, chance: 0.98 },
      { id: "wood", min: 6, max: 16, chance: 0.95 },
      { id: "ammo", min: 6, max: 18, chance: 0.6 },
      { id: "food", min: 2, max: 5, chance: 0.45 },
      { id: "medkit", min: 1, max: 2, chance: 0.25 },
      { id: "axe", min: 1, max: 1, chance: 0.35 },
    ],
  },
  {
    id: "hardware",
    label: "Hardware store",
    x: -14,
    z: -14,
    table: [
      { id: "wood", min: 6, max: 14, chance: 0.98 },
      { id: "scrap", min: 5, max: 14, chance: 0.92 },
      { id: "ammo", min: 4, max: 12, chance: 0.5 },
      { id: "food", min: 1, max: 3, chance: 0.35 },
      { id: "axe", min: 1, max: 1, chance: 0.55 },
      { id: "medkit", min: 1, max: 1, chance: 0.2 },
    ],
  },
  {
    id: "motel",
    label: "Motel",
    x: 6,
    z: 14,
    table: [
      { id: "food", min: 3, max: 8, chance: 0.9 },
      { id: "scrap", min: 3, max: 9, chance: 0.75 },
      { id: "wood", min: 2, max: 6, chance: 0.6 },
      { id: "ammo", min: 4, max: 12, chance: 0.55 },
      { id: "medkit", min: 1, max: 2, chance: 0.45 },
      { id: "pistol", min: 1, max: 1, chance: 0.15 },
    ],
  },
  {
    id: "bus",
    label: "Bus stop",
    x: -4,
    z: -18,
    table: [
      { id: "scrap", min: 2, max: 7, chance: 0.85 },
      { id: "food", min: 1, max: 4, chance: 0.7 },
      { id: "wood", min: 1, max: 4, chance: 0.55 },
      { id: "ammo", min: 2, max: 8, chance: 0.4 },
      { id: "medkit", min: 1, max: 1, chance: 0.15 },
    ],
  },
  {
    id: "alley",
    label: "Alley stash",
    x: 16,
    z: 2,
    table: [
      { id: "scrap", min: 3, max: 9, chance: 0.88 },
      { id: "ammo", min: 6, max: 16, chance: 0.7 },
      { id: "food", min: 1, max: 3, chance: 0.5 },
      { id: "wood", min: 1, max: 3, chance: 0.4 },
      { id: "knife", min: 1, max: 1, chance: 0.35 },
      { id: "pistol", min: 1, max: 1, chance: 0.2 },
    ],
  },
  {
    id: "construction",
    label: "Construction site",
    x: -10,
    z: -6,
    table: [
      { id: "wood", min: 8, max: 18, chance: 0.98 },
      { id: "scrap", min: 6, max: 14, chance: 0.9 },
      { id: "food", min: 1, max: 4, chance: 0.4 },
      { id: "ammo", min: 2, max: 8, chance: 0.35 },
      { id: "axe", min: 1, max: 1, chance: 0.4 },
    ],
  },
  {
    id: "pharmacy",
    label: "Pharmacy back room",
    x: 10,
    z: -18,
    table: [
      { id: "medkit", min: 2, max: 5, chance: 0.95 },
      { id: "food", min: 2, max: 5, chance: 0.7 },
      { id: "scrap", min: 2, max: 6, chance: 0.55 },
      { id: "ammo", min: 3, max: 10, chance: 0.45 },
      { id: "wood", min: 1, max: 3, chance: 0.3 },
    ],
  },
  {
    id: "rooftop",
    label: "Rooftop cache",
    x: -18,
    z: -10,
    table: [
      { id: "ammo", min: 10, max: 24, chance: 0.85 },
      { id: "food", min: 2, max: 5, chance: 0.65 },
      { id: "scrap", min: 3, max: 8, chance: 0.7 },
      { id: "medkit", min: 1, max: 2, chance: 0.4 },
      { id: "smg", min: 1, max: 1, chance: 0.15 },
      { id: "ar", min: 1, max: 1, chance: 0.1 },
    ],
  },
  {
    id: "farm",
    label: "Farm shed",
    x: 20,
    z: -2,
    table: [
      { id: "wood", min: 5, max: 12, chance: 0.95 },
      { id: "food", min: 4, max: 10, chance: 0.9 },
      { id: "scrap", min: 2, max: 6, chance: 0.6 },
      { id: "ammo", min: 2, max: 8, chance: 0.35 },
      { id: "axe", min: 1, max: 1, chance: 0.45 },
    ],
  },
  {
    id: "subway",
    label: "Subway entrance",
    x: -2,
    z: 18,
    table: [
      { id: "scrap", min: 4, max: 11, chance: 0.9 },
      { id: "ammo", min: 8, max: 22, chance: 0.75 },
      { id: "food", min: 2, max: 6, chance: 0.65 },
      { id: "wood", min: 2, max: 5, chance: 0.5 },
      { id: "medkit", min: 1, max: 2, chance: 0.35 },
      { id: "knife", min: 1, max: 1, chance: 0.25 },
    ],
  },
  {
    id: "office",
    label: "Office block",
    x: 14,
    z: 16,
    table: [
      { id: "scrap", min: 4, max: 12, chance: 0.92 },
      { id: "food", min: 2, max: 6, chance: 0.75 },
      { id: "ammo", min: 4, max: 14, chance: 0.6 },
      { id: "wood", min: 2, max: 5, chance: 0.5 },
      { id: "medkit", min: 1, max: 2, chance: 0.3 },
    ],
  },
  {
    id: "junkyard",
    label: "Junkyard",
    x: -20,
    z: 2,
    table: [
      { id: "scrap", min: 10, max: 24, chance: 0.98 },
      { id: "wood", min: 4, max: 10, chance: 0.75 },
      { id: "ammo", min: 4, max: 12, chance: 0.45 },
      { id: "food", min: 1, max: 3, chance: 0.35 },
      { id: "axe", min: 1, max: 1, chance: 0.3 },
    ],
  },
];

/** Solid boxes for loot crates (match client cylinder footprint). */
export function lootSpotAabbs(): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}[] {
  return LOOT_SPOTS.map((s) => ({
    minX: s.x - 0.48,
    maxX: s.x + 0.48,
    minY: 0,
    maxY: 0.75,
    minZ: s.z - 0.48,
    maxZ: s.z + 0.48,
  }));
}

/** One slot per successful table roll. */
export function rollLootStacks(table: readonly LootTableEntry[]): ItemStack[] {
  const stacks: ItemStack[] = [];
  for (const entry of table) {
    if (Math.random() > entry.chance) continue;
    const def = ITEMS[entry.id];
    let n = entry.min + Math.floor(Math.random() * (entry.max - entry.min + 1));
    n = Math.min(n, def.maxStack);
    if (n <= 0) continue;
    stacks.push({ id: entry.id, count: n });
  }
  return stacks;
}

export function startingHotbar(): Slot[] {
  const slots = emptySlots(INV.hotbarSize);
  slots[0] = { id: "pistol", count: 1 };
  slots[1] = { id: "ammo", count: 24 };
  slots[2] = { id: "food", count: 3 };
  return slots;
}

export function startingInventory(): Slot[] {
  return emptySlots(INV.invSize);
}

export function formatStack(stack: ItemStack): string {
  const label = ITEMS[stack.id].label;
  return stack.count > 1 ? `${label} ×${stack.count}` : label;
}

// Legacy ResourceBag shims (older scripts / toasts).
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
export function emptyBag(): ResourceBag {
  return { food: 0, scrap: 0, wood: 0, ammo: 0, medkit: 0 };
}
export function bagWeight(_bag: ResourceBag): number {
  return 0;
}
export function bagTotal(bag: ResourceBag): number {
  return RESOURCE_IDS.reduce((sum, id) => sum + bag[id], 0);
}
export function formatBag(bag: ResourceBag): string {
  const parts: string[] = [];
  for (const id of RESOURCE_IDS) {
    if (bag[id] > 0) parts.push(`${RESOURCE_LABELS[id]} ${bag[id]}`);
  }
  return parts.length ? parts.join(", ") : "nothing";
}
export function transferFill(
  from: ResourceBag,
  to: ResourceBag,
): { from: ResourceBag; to: ResourceBag; moved: ResourceBag } {
  return { from: { ...from }, to: { ...to }, moved: emptyBag() };
}
export function transferAll(
  from: ResourceBag,
  to: ResourceBag,
): { from: ResourceBag; to: ResourceBag } {
  const nextTo = { ...to };
  for (const id of RESOURCE_IDS) nextTo[id] += from[id];
  return { from: emptyBag(), to: nextTo };
}
export function rollLootTable(_table: readonly LootTableEntry[]): ResourceBag {
  return emptyBag();
}
