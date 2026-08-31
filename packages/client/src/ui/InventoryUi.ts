import {
  INV,
  ITEMS,
  type Slot,
  type SlotBag,
  type SlotRef,
} from "@coop/shared";
import { itemIconUrl } from "./itemIcons";

export type InvUiMode = "closed" | "player" | "storage" | "loot";

type DragState = {
  from: SlotRef;
  label: string;
  color: string;
};

export type InventoryUiOptions = {
  onMove: (from: SlotRef, to: SlotRef) => void;
  onQuickMove: (
    from: SlotRef,
    prefer: "player" | "container",
    containerLootId?: string,
  ) => void;
  onClose: () => void;
  onOpenChange: (open: boolean) => void;
};

function slotLabel(slot: Slot): string {
  if (!slot) return "";
  const name = ITEMS[slot.id].label;
  return slot.count > 1 ? `${name}\n${slot.count}` : name;
}

export class InventoryUi {
  private readonly root: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly containerLabel: HTMLElement;
  private readonly containerGrid: HTMLElement;
  private readonly invGrid: HTMLElement;
  private readonly panelHotbarGrid: HTMLElement;
  private readonly hudHotbar: HTMLElement;
  private readonly vitalsEl: HTMLElement;
  private readonly ghost: HTMLElement;
  private mode: InvUiMode = "closed";
  private lootId: string | null = null;
  private drag: DragState | null = null;
  private hotbar: Slot[] = [];
  private inventory: Slot[] = [];
  private storage: Slot[] = [];
  private lootSlots: Slot[] = [];
  private selectedSlot = 0;

  constructor(private readonly opts: InventoryUiOptions) {
    this.root = document.getElementById("inv-ui")!;
    this.titleEl = document.getElementById("inv-title")!;
    this.containerLabel = document.getElementById("inv-container-label")!;
    this.containerGrid = document.getElementById("inv-container-grid")!;
    this.invGrid = document.getElementById("inv-player-grid")!;
    this.panelHotbarGrid = document.getElementById("inv-hotbar-grid")!;
    this.hudHotbar = document.getElementById("hotbar")!;
    this.vitalsEl = document.getElementById("vitals")!;
    this.ghost = document.getElementById("inv-ghost")!;

    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("mouseup", this.onMouseUp);
    this.root.addEventListener("mousedown", (e) => e.stopPropagation());
  }

  dispose(): void {
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("mouseup", this.onMouseUp);
    this.close();
  }

  get isOpen(): boolean {
    return this.mode !== "closed";
  }

  getMode(): InvUiMode {
    return this.mode;
  }

  getLootId(): string | null {
    return this.lootId;
  }

  getSelectedSlot(): number {
    return this.selectedSlot;
  }

  setSelectedSlot(n: number): void {
    this.selectedSlot = Math.max(0, Math.min(INV.hotbarSize - 1, n));
    this.renderHotbars();
  }

  sync(data: {
    hotbar: Slot[];
    inventory: Slot[];
    storage: Slot[];
    lootSlots?: Slot[];
    selectedSlot: number;
  }): void {
    this.hotbar = data.hotbar;
    this.inventory = data.inventory;
    this.storage = data.storage;
    if (data.lootSlots) this.lootSlots = data.lootSlots;
    this.selectedSlot = data.selectedSlot;
    this.renderHotbars();
    if (this.isOpen) this.renderMenus();
  }

  openPlayer(): void {
    this.mode = "player";
    this.lootId = null;
    this.titleEl.textContent = "Inventory";
    this.containerLabel.hidden = true;
    this.containerGrid.style.display = "none";
    this.root.classList.add("open");
    this.hudHotbar.classList.remove("visible");
    this.vitalsEl.classList.remove("visible");
    this.opts.onOpenChange(true);
    this.renderMenus();
  }

  openStorage(): void {
    this.mode = "storage";
    this.lootId = null;
    this.titleEl.textContent = "Base storage";
    this.containerLabel.hidden = false;
    this.containerLabel.textContent = "Storage";
    this.containerGrid.style.display = "grid";
    this.root.classList.add("open");
    this.hudHotbar.classList.remove("visible");
    this.vitalsEl.classList.remove("visible");
    this.opts.onOpenChange(true);
    this.renderMenus();
  }

  openLoot(lootId: string, label: string, slots: Slot[]): void {
    this.mode = "loot";
    this.lootId = lootId;
    this.lootSlots = slots;
    this.titleEl.textContent = label;
    this.containerLabel.hidden = false;
    this.containerLabel.textContent = "Loot";
    this.containerGrid.style.display = "grid";
    this.root.classList.add("open");
    this.hudHotbar.classList.remove("visible");
    this.vitalsEl.classList.remove("visible");
    this.opts.onOpenChange(true);
    this.renderMenus();
  }

  close(): void {
    if (this.mode === "closed") return;
    this.mode = "closed";
    this.lootId = null;
    this.drag = null;
    this.ghost.classList.remove("on");
    this.root.classList.remove("open");
    this.hudHotbar.classList.add("visible");
    this.vitalsEl.classList.add("visible");
    this.opts.onOpenChange(false);
    this.opts.onClose();
    this.renderHotbars();
  }

  /** HUD bar when closed; panel bar when open — same slot data. */
  private renderHotbars(): void {
    this.fillHotbar(this.hudHotbar, !this.isOpen);
    this.fillHotbar(this.panelHotbarGrid, this.isOpen);
  }

  private fillHotbar(target: HTMLElement, interactive: boolean): void {
    target.innerHTML = "";
    target.style.gridTemplateColumns = `repeat(${INV.hotbarSize}, var(--slot))`;
    for (let i = 0; i < INV.hotbarSize; i++) {
      const cell = this.makeCell("hotbar", i, this.hotbar[i] ?? null, true, interactive);
      if (i === this.selectedSlot) cell.classList.add("selected");
      const num = document.createElement("span");
      num.className = "slot-num";
      num.textContent = String(i + 1);
      cell.appendChild(num);
      target.appendChild(cell);
    }
  }

  private renderMenus(): void {
    this.invGrid.style.gridTemplateColumns = `repeat(${INV.invCols}, var(--slot))`;
    this.invGrid.innerHTML = "";
    for (let i = 0; i < INV.invSize; i++) {
      this.invGrid.appendChild(this.makeCell("inv", i, this.inventory[i] ?? null, false, true));
    }

    this.containerGrid.innerHTML = "";
    if (this.mode === "storage") {
      this.containerGrid.style.gridTemplateColumns = `repeat(${INV.storageCols}, var(--slot))`;
      for (let i = 0; i < INV.storageSize; i++) {
        this.containerGrid.appendChild(
          this.makeCell("storage", i, this.storage[i] ?? null, false, true),
        );
      }
    } else if (this.mode === "loot") {
      const n = Math.max(1, this.lootSlots.length);
      const cols = Math.min(6, n);
      this.containerGrid.style.gridTemplateColumns = `repeat(${cols}, var(--slot))`;
      for (let i = 0; i < this.lootSlots.length; i++) {
        this.containerGrid.appendChild(
          this.makeCell("loot", i, this.lootSlots[i] ?? null, false, true),
        );
      }
      if (this.lootSlots.length === 0) {
        const empty = document.createElement("div");
        empty.className = "inv-empty";
        empty.textContent = "Empty";
        this.containerGrid.appendChild(empty);
      }
    }

    this.renderHotbars();
  }

  private makeCell(
    bag: SlotBag,
    index: number,
    slot: Slot,
    allowSelectClick: boolean,
    interactive: boolean,
  ): HTMLElement {
    const cell = document.createElement("div");
    cell.className = "inv-slot";
    cell.dataset.bag = bag;
    cell.dataset.index = String(index);
    if (slot) {
      cell.style.setProperty("--item", ITEMS[slot.id].color);
      cell.classList.add("filled");
      const icon = document.createElement("img");
      icon.className = "slot-icon";
      icon.src = itemIconUrl(slot.id);
      icon.alt = ITEMS[slot.id].label;
      icon.draggable = false;
      cell.appendChild(icon);
      if (slot.count > 1) {
        const count = document.createElement("span");
        count.className = "slot-count";
        count.textContent = String(slot.count);
        cell.appendChild(count);
      }
    }

    if (!interactive) return cell;

    cell.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      // Closed HUD hotbar: click selects active item only.
      if (!this.isOpen && allowSelectClick && bag === "hotbar") {
        this.setSelectedSlot(index);
        return;
      }

      if (!this.isOpen) return;

      // Minecraft shift-click quick transfer
      if (e.shiftKey && slot) {
        this.drag = null;
        this.ghost.classList.remove("on");
        this.handleShiftClick(bag, index);
        return;
      }

      if (this.drag) {
        this.dropOn(bag, index);
        return;
      }

      if (!slot) {
        if (allowSelectClick && bag === "hotbar") this.setSelectedSlot(index);
        return;
      }

      this.drag = {
        from: this.ref(bag, index),
        label: slotLabel(slot).replace("\n", " "),
        color: ITEMS[slot.id].color,
      };
      this.ghost.textContent = this.drag.label;
      this.ghost.style.background = this.drag.color;
      this.ghost.classList.add("on");
      this.ghost.style.left = `${e.clientX + 8}px`;
      this.ghost.style.top = `${e.clientY + 8}px`;
    });

    return cell;
  }

  private handleShiftClick(bag: SlotBag, index: number): void {
    const from = this.ref(bag, index);
    if (bag === "storage" || bag === "loot") {
      this.opts.onQuickMove(from, "player");
      return;
    }
    // From player slots
    if (this.mode === "storage") {
      this.opts.onQuickMove(from, "container");
      return;
    }
    if (this.mode === "loot" && this.lootId) {
      this.opts.onQuickMove(from, "container", this.lootId);
      return;
    }
    // Inventory-only: hotbar ↔ inv
    this.opts.onQuickMove(from, "player");
  }

  private ref(bag: SlotBag, index: number): SlotRef {
    const r: SlotRef = { bag, index };
    if (bag === "loot" && this.lootId) r.lootId = this.lootId;
    return r;
  }

  private dropOn(bag: SlotBag, index: number): void {
    if (!this.drag) return;
    const to = this.ref(bag, index);
    this.opts.onMove(this.drag.from, to);
    this.drag = null;
    this.ghost.classList.remove("on");
  }

  private readonly onMouseMove = (e: MouseEvent) => {
    if (!this.drag) return;
    this.ghost.style.left = `${e.clientX + 8}px`;
    this.ghost.style.top = `${e.clientY + 8}px`;
  };

  private readonly onMouseUp = (e: MouseEvent) => {
    if (!this.drag || e.button !== 0) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const cell = el?.closest?.(".inv-slot") as HTMLElement | null;
    if (cell?.dataset.bag && cell.dataset.index != null) {
      this.dropOn(cell.dataset.bag as SlotBag, Number(cell.dataset.index));
      return;
    }
    this.drag = null;
    this.ghost.classList.remove("on");
  };
}
