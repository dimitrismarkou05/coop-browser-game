import {
  BASE,
  BASE_LAYOUT,
  COMBAT,
  INV,
  ITEMS,
  MILESTONE,
  PLAYER,
  STORAGE_POS,
  distXZ,
  getSolidAabbs,
  type BaseSnapshot,
  type GameEvent,
  type InvasionSnapshot,
  type LootNodeSnapshot,
  type PlayerSnapshot,
  type ServerMessage,
  type Slot,
  type SlotRef,
  type WallId,
  type WorldPingSnapshot,
  type ZombieSnapshot,
} from "@coop/shared";
import * as THREE from "three";
import { sfx } from "./audio/sfx";
import { FpController } from "./input/FpController";
import { ClientSocket } from "./net/ClientSocket";
import { BaseProps } from "./render/baseProps";
import { LootNodeRenderer } from "./render/lootNodes";
import { buildPlaceholderWorld } from "./render/placeholders";
import { RemotePlayers } from "./render/remoteAvatars";
import { Viewmodel } from "./render/viewmodel";
import { WorldPings } from "./render/worldPings";
import { ZombieRenderer } from "./render/zombies";
import { DevConsole } from "./ui/DevConsole";
import { InventoryUi } from "./ui/InventoryUi";
import { renderPipRow, valueToPips } from "./ui/mcVitals";
import { getPreviousNames, getRememberedName, rememberName } from "./ui/nameMemory";

const lobbyEl = document.getElementById("lobby")!;
const lobbyStatusEl = document.getElementById("lobby-status")!;
const lobbyNetEl = document.getElementById("lobby-net")!;
const nameInput = document.getElementById("name") as HTMLInputElement;
const codeInput = document.getElementById("code") as HTMLInputElement;
const btnCreate = document.getElementById("btn-create") as HTMLButtonElement;
const btnJoin = document.getElementById("btn-join") as HTMLButtonElement;

const hudEl = document.getElementById("hud")!;
const vitalsEl = document.getElementById("vitals")!;
const heartsEl = document.getElementById("hearts")!;
const foodIconsEl = document.getElementById("food-icons")!;
const hotbarEl = document.getElementById("hotbar")!;
const crosshairEl = document.getElementById("crosshair")!;
const hurtFlashEl = document.getElementById("hurt-flash")!;
const hitMarkerEl = document.getElementById("hit-marker")!;
const promptEl = document.getElementById("prompt")!;
const lootToastEl = document.getElementById("loot-toast")!;
const reviveHudEl = document.getElementById("revive-hud")!;
const reviveFillEl = document.getElementById("revive-fill")!;
const reviveTimeEl = document.getElementById("revive-time")!;
const downedBannerEl = document.getElementById("downed-banner")!;
const statusEl = document.getElementById("status")!;
const rttEl = document.getElementById("rtt")!;
const milestoneEl = document.getElementById("milestone")!;
const roomCodeEl = document.getElementById("room-code")!;
const youNameEl = document.getElementById("you-name")!;
const playerCountEl = document.getElementById("player-count")!;
const zombieCountEl = document.getElementById("zombie-count")!;
const ammoEl = document.getElementById("ammo")!;
const hintEl = document.getElementById("hint")!;

const invasionHudEl = document.getElementById("invasion-hud")!;
const invasionPhaseEl = document.getElementById("invasion-phase")!;
const invasionMetaEl = document.getElementById("invasion-meta")!;
const invasionReadyEl = document.getElementById("invasion-ready")!;
const baseHudEl = document.getElementById("base-hud")!;
const baseCoreEl = document.getElementById("base-core")!;
const baseWallsEl = document.getElementById("base-walls")!;
const baseTiersEl = document.getElementById("base-tiers")!;
const compassEl = document.getElementById("compass")!;
const compassArrowEl = document.getElementById("compass-arrow")!;
const summaryOverlayEl = document.getElementById("summary-overlay")!;
const summaryCardEl = document.getElementById("summary-card")!;
const summaryTitleEl = document.getElementById("summary-title")!;
const summaryBodyEl = document.getElementById("summary-body")!;
const sirenFlashEl = document.getElementById("siren-flash")!;

milestoneEl.textContent = MILESTONE;

function refreshNameHistory(): void {
  const list = document.getElementById("name-history");
  if (!(list instanceof HTMLDataListElement)) return;
  list.innerHTML = "";
  for (const name of getPreviousNames()) {
    const option = document.createElement("option");
    option.value = name;
    list.appendChild(option);
  }
}

const remembered = getRememberedName();
nameInput.value = remembered || `Survivor${Math.floor(Math.random() * 90 + 10)}`;
refreshNameHistory();

function commitDisplayName(): string {
  const name = nameInput.value.trim() || "Survivor";
  nameInput.value = name;
  rememberName(name);
  refreshNameHistory();
  return name;
}

type Session = {
  playerId: string;
  code: string;
  name: string;
};

let session: Session | null = null;
let game: ReturnType<typeof startGame> | null = null;
let lastKnownHp: number = PLAYER.maxHp;

function setLobbyError(message: string | null): void {
  lobbyStatusEl.textContent = message ?? "";
  lobbyStatusEl.className = message ? "error" : "";
}

function setNetStatus(text: string, kind: "connecting" | "connected" | "disconnected"): void {
  statusEl.textContent = text;
  statusEl.className = kind;
  lobbyNetEl.textContent = `WebSocket: ${text}`;
  lobbyNetEl.style.color =
    kind === "connected" ? "#3fb950" : kind === "disconnected" ? "#f85149" : "#d29922";
}

function updateHpHud(hp: number, maxHp: number): void {
  renderPipRow(heartsEl, valueToPips(hp, maxHp), "heart");
  if (hp < lastKnownHp) {
    hurtFlashEl.classList.add("on");
    window.setTimeout(() => hurtFlashEl.classList.remove("on"), 180);
    sfx.hit();
  }
  lastKnownHp = hp;
}

function updateHungerHud(hunger: number, maxHunger: number): void {
  renderPipRow(foodIconsEl, valueToPips(hunger, maxHunger), "food");
}

function flashHitMarker(): void {
  hitMarkerEl.classList.add("on");
  window.setTimeout(() => hitMarkerEl.classList.remove("on"), 120);
}

function flashLootToast(text: string): void {
  lootToastEl.textContent = text;
  lootToastEl.classList.add("on");
  window.setTimeout(() => lootToastEl.classList.remove("on"), 2200);
}

function showSummary(kind: "win" | "lose", title: string, body: string): void {
  summaryCardEl.classList.remove("win", "lose");
  summaryCardEl.classList.add(kind);
  summaryTitleEl.textContent = title;
  summaryBodyEl.textContent = body;
  summaryOverlayEl.classList.add("visible");
  window.setTimeout(() => summaryOverlayEl.classList.remove("visible"), 5000);
}

function triggerSirenFlash(): void {
  sirenFlashEl.classList.remove("on");
  void sirenFlashEl.offsetWidth;
  sirenFlashEl.classList.add("on");
  window.setTimeout(() => sirenFlashEl.classList.remove("on"), 2200);
}

function phaseLabel(phase: InvasionSnapshot["phase"]): string {
  switch (phase) {
    case "prep":
      return "PREP";
    case "warning":
      return "WARNING";
    case "waves":
      return "WAVES";
    case "resolve":
      return "RESOLVE";
  }
}

function formatTimer(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}:${r.toString().padStart(2, "0")}` : `${s}s`;
}

function handleEvents(
  events: GameEvent[] | undefined,
  you: string,
  viewmodel?: Viewmodel,
): void {
  if (!events) return;
  for (const ev of events) {
    if ((ev.kind === "shot" || ev.kind === "melee") && ev.playerId === you && ev.hit) {
      flashHitMarker();
    }
    if (ev.kind === "shot" && ev.playerId === you) {
      viewmodel?.playShot();
    }
    if (ev.kind === "melee" && ev.playerId === you) {
      viewmodel?.playMelee();
    }
    if (ev.kind === "eat" && ev.playerId === you) {
      flashLootToast(`Ate food (+${Math.round(ev.restored)} hunger)`);
    }
    if (ev.kind === "phaseChange") {
      if (ev.phase === "warning") {
        sfx.siren();
        triggerSirenFlash();
      } else {
        sfx.warn();
      }
    }
    if (ev.kind === "invasionWon") {
      sfx.win();
      showSummary(
        "win",
        `Invasion ${ev.invasionIndex + 1} cleared`,
        `+${ev.scrap} scrap · +${ev.ammo} ammo`,
      );
    }
    if (ev.kind === "invasionLost") {
      sfx.lose();
      showSummary("lose", `Invasion ${ev.invasionIndex + 1} failed`, "Core breached — regroup and rebuild.");
    }
    if (ev.kind === "revive") {
      sfx.revive();
      if (ev.playerId === you) flashLootToast("Revived!");
      else if (ev.by === you) flashLootToast("Ally revived");
    }
    if (ev.kind === "repair" && ev.playerId === you) {
      flashLootToast(`Wall repaired (${Math.round(ev.hp)} HP)`);
    }
    if (ev.kind === "upgrade" && ev.playerId === you) {
      flashLootToast(`Upgraded ${ev.component} → T${ev.tier}`);
    }
    if (ev.kind === "craft" && ev.playerId === you) {
      flashLootToast(`Crafted ${ev.item}`);
    }
    if (ev.kind === "unlock") {
      flashLootToast(`Unlocked: ${ev.unlock}`);
    }
    if (ev.kind === "wallBreak") {
      flashLootToast(`Barricade ${ev.wallId} broken!`);
      sfx.warn();
    }
  }
}

const socket = new ClientSocket({
  onStatus: setNetStatus,
  onMessage: (msg) => {
    if (msg.type === "welcome") {
      milestoneEl.textContent = msg.milestone;
      return;
    }
    if (msg.type === "pong") {
      rttEl.textContent = `${Math.max(0, performance.now() - msg.clientTime).toFixed(0)} ms`;
      return;
    }
    if (msg.type === "error") {
      setLobbyError(msg.message);
      return;
    }
    if (msg.type === "devResult") {
      game?.onDevResult(msg.ok, msg.message);
      return;
    }
    if (msg.type === "roomJoined") {
      const name = commitDisplayName();
      session = {
        playerId: msg.playerId,
        code: msg.code,
        name,
      };
      socket.setRejoin({ code: msg.code, name });
      enterWorld(
        msg.players,
        msg.zombies,
        msg.lootNodes,
        msg.storage,
        msg.base,
        msg.invasion,
        msg.pings,
      );
      return;
    }
    if (msg.type === "snapshot" && game) {
      game.onSnapshot(msg);
      return;
    }
  },
});

window.setInterval(() => {
  socket.send({ type: "ping", clientTime: performance.now() });
}, 2000);

btnCreate.addEventListener("click", () => {
  setLobbyError(null);
  sfx.ensure();
  socket.send({ type: "createRoom", name: commitDisplayName() });
});

btnJoin.addEventListener("click", () => {
  setLobbyError(null);
  sfx.ensure();
  const code = codeInput.value.trim().toUpperCase();
  if (code.length < 4) {
    setLobbyError("Enter the 6-character invite code");
    return;
  }
  socket.send({ type: "joinRoom", code, name: commitDisplayName() });
});

codeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") btnJoin.click();
});

function enterWorld(
  players: PlayerSnapshot[],
  zombies: ZombieSnapshot[],
  lootNodes: LootNodeSnapshot[],
  storage: Slot[],
  base: BaseSnapshot,
  invasion: InvasionSnapshot,
  pings: WorldPingSnapshot[],
): void {
  if (!session) return;
  lobbyEl.classList.add("hidden");
  hudEl.classList.add("visible");
  vitalsEl.classList.add("visible");
  hotbarEl.classList.add("visible");
  crosshairEl.classList.add("visible");
  invasionHudEl.classList.add("visible");
  baseHudEl.classList.add("visible");
  compassEl.classList.add("visible");
  roomCodeEl.textContent = session.code;
  youNameEl.textContent = session.name;
  playerCountEl.textContent = String(players.length);
  zombieCountEl.textContent = String(zombies.length);

  const me = players.find((p) => p.id === session!.playerId);
  lastKnownHp = me?.hp ?? PLAYER.maxHp;
  updateHpHud(me?.hp ?? PLAYER.maxHp, me?.maxHp ?? PLAYER.maxHp);
  updateHungerHud(me?.hunger ?? 100, me?.maxHunger ?? 100);
  ammoEl.textContent = String(me?.ammo ?? 0);

  if (game) game.dispose();
  game = startGame(session, players, zombies, lootNodes, storage, base, invasion, pings, {
    sendInput: (packet) => socket.send({ type: "input", ...packet }),
    sendDev: (line) => socket.send({ type: "devCommand", line }),
    sendInvMove: (from, to) => socket.send({ type: "invMove", from, to }),
    sendInvQuickMove: (from, prefer, containerLootId) =>
      socket.send({ type: "invQuickMove", from, prefer, containerLootId }),
    sendOpenLoot: (lootId) => socket.send({ type: "openLoot", lootId }),
    sendSetReady: (ready) => socket.send({ type: "setReady", ready }),
    sendRepairWall: (wallId) => socket.send({ type: "repairWall", wallId }),
    sendUpgradeBase: (component, wallId) =>
      socket.send({ type: "upgradeBase", component, wallId }),
    sendCraft: (recipe) => socket.send({ type: "craft", recipe }),
    sendWorldPing: (x, y, z) => socket.send({ type: "worldPing", x, y, z }),
  });
}

function startGame(
  active: Session,
  initialPlayers: PlayerSnapshot[],
  initialZombies: ZombieSnapshot[],
  initialLoot: LootNodeSnapshot[],
  initialStorage: Slot[],
  initialBase: BaseSnapshot,
  initialInvasion: InvasionSnapshot,
  initialPings: WorldPingSnapshot[],
  net: {
    sendInput: (packet: {
      seq: number;
      forward: number;
      strafe: number;
      yaw: number;
      pitch: number;
      shoot: boolean;
      melee: boolean;
      interact: boolean;
      jump: boolean;
      selectedSlot: number;
      sprint: boolean;
    }) => void;
    sendDev: (line: string) => void;
    sendInvMove: (from: SlotRef, to: SlotRef) => void;
    sendInvQuickMove: (
      from: SlotRef,
      prefer: "player" | "container",
      containerLootId?: string,
    ) => void;
    sendOpenLoot: (lootId: string) => void;
    sendSetReady: (ready: boolean) => void;
    sendRepairWall: (wallId: WallId) => void;
    sendUpgradeBase: (
      component: "wall" | "storage" | "workbench" | "generator",
      wallId?: WallId,
    ) => void;
    sendCraft: (recipe: "shotgun") => void;
    sendWorldPing: (x: number, y: number, z: number) => void;
  },
) {
  const solids = getSolidAabbs();
  const me = initialPlayers.find((p) => p.id === active.playerId);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87a0b8);
  scene.fog = new THREE.Fog(0x87a0b8, 35, 90);

  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.08,
    200,
  );

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  buildPlaceholderWorld(scene);
  const remotes = new RemotePlayers(scene);
  const zombies = new ZombieRenderer(scene);
  const lootVisuals = new LootNodeRenderer(scene);
  lootVisuals.sync(initialLoot);
  const baseProps = new BaseProps(scene);
  baseProps.sync(initialBase);
  const worldPings = new WorldPings(scene);
  worldPings.sync(initialPings);

  const viewmodel = new Viewmodel();
  camera.add(viewmodel.root);
  scene.add(camera);
  const held0 = me?.hotbar[me.selectedSlot ?? 0];
  viewmodel.setItem(held0?.id ?? null);

  const fp = new FpController(renderer.domElement, {
    x: me?.x ?? 0,
    y: me?.y ?? 0,
    z: me?.z ?? 4,
    yaw: me?.yaw ?? 0,
    pitch: me?.pitch ?? 0,
  });
  fp.setSelectedSlot(me?.selectedSlot ?? 0);

  let menuBlocks = false;
  const syncBlock = () => {
    fp.setBlocked(menuBlocks || consoleUi.isOpen());
    crosshairEl.classList.toggle("visible", !menuBlocks && !consoleUi.isOpen());
  };

  const invUi = new InventoryUi({
    onMove: (from, to) => net.sendInvMove(from, to),
    onQuickMove: (from, prefer, containerLootId) =>
      net.sendInvQuickMove(from, prefer, containerLootId),
    onClose: () => {
      if (document.pointerLockElement !== renderer.domElement) {
        void renderer.domElement.requestPointerLock();
      }
    },
    onOpenChange: (open) => {
      menuBlocks = open;
      syncBlock();
      viewmodel.setVisible(!open && !consoleUi.isOpen());
      if (open && document.pointerLockElement) {
        document.exitPointerLock();
      }
    },
  });

  const consoleUi = new DevConsole({
    onSubmit: (line) => net.sendDev(line),
    onOpenChange: () => syncBlock(),
  });
  consoleUi.append("Dev console ready. Press ` to toggle.", "info");

  remotes.sync(initialPlayers, active.playerId);
  zombies.sync(initialZombies);
  invUi.sync({
    hotbar: me?.hotbar ?? [],
    inventory: me?.inventory ?? [],
    storage: initialStorage,
    selectedSlot: me?.selectedSlot ?? 0,
  });

  let latestPlayers: PlayerSnapshot[] = initialPlayers;
  let latestLoot: LootNodeSnapshot[] = initialLoot;
  let latestStorage: Slot[] = initialStorage;
  let latestBase: BaseSnapshot = initialBase;
  let latestInvasion: InvasionSnapshot = initialInvasion;

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener("resize", onResize);

  let last = performance.now();
  let inputAcc = 0;
  let alive = true;

  function updateInvasionHud(inv: InvasionSnapshot, self?: PlayerSnapshot): void {
    invasionPhaseEl.textContent = phaseLabel(inv.phase);
    const waveBit =
      inv.phase === "waves" ? ` · Wave ${inv.waveIndex + 1}/${inv.wavesTotal}` : "";
    invasionMetaEl.textContent = `Invasion ${inv.invasionIndex + 1}${waveBit} · ${formatTimer(inv.phaseEndsIn)}`;
    const readyHint =
      inv.phase === "prep"
        ? self?.ready
          ? "You are READY · R to cancel"
          : "R — Ready"
        : "";
    invasionReadyEl.textContent = `Ready ${inv.readyCount} / ${inv.playerCount}${readyHint ? ` · ${readyHint}` : ""}`;
    invasionReadyEl.style.color =
      inv.phase === "warning" ? "#f85149" : inv.phase === "prep" ? "#3fb950" : "#8b949e";
  }

  function updateBaseHud(base: BaseSnapshot): void {
    baseCoreEl.textContent = `${Math.round(base.coreHp)} / ${Math.round(base.coreMaxHp)}`;
    const intact = base.walls.filter((w) => !w.broken && w.hp > 0).length;
    const wallHp = base.walls.map((w) => (w.broken ? 0 : Math.round(w.hp))).join("/");
    baseWallsEl.textContent = `${intact}/4 up · ${wallHp}`;
    baseTiersEl.textContent = `W${Math.min(...base.walls.map((w) => w.tier))} · St${base.storageTier} · Wb${base.workbenchTier} · Gen${base.generatorTier}`;
  }

  function updateCompass(): void {
    const dx = 0 - fp.state.x;
    const dz = 0 - fp.state.z;
    const bearing = Math.atan2(dx, -dz);
    const relative = bearing - fp.state.yaw;
    compassArrowEl.style.transform = `rotate(${(relative * 180) / Math.PI}deg)`;
  }

  function updateReviveHud(self: PlayerSnapshot): void {
    const progress = self.reviveProgress;
    const being = self.beingRevived;
    let shown = progress;
    let label = "Reviving";
    if (being && progress <= 0) {
      const reviver = latestPlayers.find((p) => p.id !== self.id && p.reviveProgress > 0);
      shown = reviver?.reviveProgress ?? 0;
      label = "Being revived";
    } else if (progress > 0) {
      const target = latestPlayers.find((p) => p.downed && p.beingRevived);
      label = target ? `Reviving ${target.name}` : "Reviving";
    }

    if (shown > 0 || (being && latestPlayers.some((p) => p.reviveProgress > 0))) {
      const p = Math.max(
        shown,
        being ? (latestPlayers.find((x) => x.reviveProgress > 0)?.reviveProgress ?? 0) : 0,
      );
      if (p > 0) {
        reviveHudEl.classList.add("visible");
        reviveHudEl.querySelector(".label")!.textContent = label;
        reviveFillEl.style.width = `${Math.round(p * 100)}%`;
        const elapsed = p * COMBAT.reviveDuration;
        reviveTimeEl.textContent = `${elapsed.toFixed(1)} / ${COMBAT.reviveDuration.toFixed(1)}s`;
        return;
      }
    }
    reviveHudEl.classList.remove("visible");
  }

  function nearestDowned(selfId: string): PlayerSnapshot | null {
    let nearestDown: PlayerSnapshot | null = null;
    let best: number = COMBAT.reviveRange;
    for (const p of latestPlayers) {
      if (p.id === selfId || !p.downed) continue;
      const d = distXZ(fp.state.x, fp.state.z, p.x, p.z);
      if (d < best) {
        best = d;
        nearestDown = p;
      }
    }
    return nearestDown;
  }

  function nearestLoot(): LootNodeSnapshot | null {
    let best: LootNodeSnapshot | null = null;
    let dist: number = INV.interactRange;
    for (const node of latestLoot) {
      const d = distXZ(fp.state.x, fp.state.z, node.x, node.z);
      if (d < dist) {
        dist = d;
        best = node;
      }
    }
    return best;
  }

  function nearStorage(): boolean {
    return distXZ(fp.state.x, fp.state.z, STORAGE_POS.x, STORAGE_POS.z) <= INV.storageRange;
  }

  function nearWorkbench(): boolean {
    const wb = BASE_LAYOUT.workbench;
    return distXZ(fp.state.x, fp.state.z, wb.x, wb.z) <= BASE.interactRange;
  }

  function nearGenerator(): boolean {
    const gen = BASE_LAYOUT.generator;
    return distXZ(fp.state.x, fp.state.z, gen.x, gen.z) <= BASE.interactRange;
  }

  function nearestWall(): (typeof latestBase.walls)[number] | null {
    let best: (typeof latestBase.walls)[number] | null = null;
    let dist = BASE.interactRange + 2;
    for (const wall of latestBase.walls) {
      const layout = BASE_LAYOUT.walls[wall.id];
      const d = distXZ(fp.state.x, fp.state.z, layout.x, layout.z);
      if (d < dist) {
        dist = d;
        best = wall;
      }
    }
    return best;
  }

  function sendLookPing(): void {
    const yaw = fp.state.yaw;
    const pitch = fp.state.pitch;
    const range = 20;
    const dirX = -Math.sin(yaw) * Math.cos(pitch);
    const dirY = Math.sin(pitch);
    const dirZ = -Math.cos(yaw) * Math.cos(pitch);
    let x = fp.state.x + dirX * range;
    let y = fp.state.y + PLAYER.eyeHeight + dirY * range;
    let z = fp.state.z + dirZ * range;
    if (pitch < 0.15) {
      if (dirY < -0.05) {
        const t = Math.max(0.1, (fp.state.y + PLAYER.eyeHeight) / Math.max(0.05, -dirY));
        if (t < range) {
          x = fp.state.x + dirX * t;
          y = 0.15;
          z = fp.state.z + dirZ * t;
        } else {
          y = Math.max(0.15, y);
        }
      } else {
        y = Math.max(0.15, y);
      }
    } else {
      y = Math.max(0.15, y);
    }
    net.sendWorldPing(x, y, z);
  }

  const onGameKeyDown = (e: KeyboardEvent) => {
    if (!alive || consoleUi.isOpen() || invUi.isOpen) return;
    if (e.repeat) return;
    const self = latestPlayers.find((p) => p.id === active.playerId);
    if (!self || self.downed) return;

    if (e.code === "KeyR") {
      e.preventDefault();
      if (latestInvasion.phase === "prep") {
        net.sendSetReady(!self.ready);
      }
      return;
    }

    if (e.code === "KeyQ") {
      e.preventDefault();
      sendLookPing();
      return;
    }

    if (e.code === "KeyF") {
      e.preventDefault();
      const wall = nearestWall();
      if (wall && (wall.hp < wall.maxHp || wall.broken)) net.sendRepairWall(wall.id);
      return;
    }

    if (e.code === "KeyT") {
      e.preventDefault();
      if (nearWorkbench() && latestBase.workbenchTier < 3) {
        net.sendUpgradeBase("workbench");
        return;
      }
      if (nearGenerator() && latestBase.generatorTier < 3) {
        net.sendUpgradeBase("generator");
        return;
      }
      if (nearStorage() && latestBase.storageTier < 3) {
        net.sendUpgradeBase("storage");
        return;
      }
      const wall = nearestWall();
      if (wall && wall.tier < 3) {
        net.sendUpgradeBase("wall", wall.id);
      }
      return;
    }

    if (e.code === "KeyC") {
      e.preventDefault();
      if (nearWorkbench() && latestBase.unlocks.includes("shotgun")) {
        net.sendCraft("shotgun");
      }
    }
  };
  window.addEventListener("keydown", onGameKeyDown);

  function handleInteractEdge(self: PlayerSnapshot): void {
    if (!fp.consumeInteractEdge() || self.downed) return;

    if (invUi.isOpen) {
      invUi.close();
      return;
    }

    if (nearestDowned(active.playerId)) return;

    if (nearStorage()) {
      invUi.openStorage();
      return;
    }

    const loot = nearestLoot();
    if (loot) {
      net.sendOpenLoot(loot.id);
      const node = latestLoot.find((n) => n.id === loot.id) ?? loot;
      invUi.openLoot(node.id, node.label, node.slots);
      return;
    }

    invUi.openPlayer();
  }

  function handlePingEdge(self: PlayerSnapshot): void {
    if (self.downed) {
      fp.consumePingEdge();
      return;
    }
    if (fp.consumePingEdge()) sendLookPing();
  }

  function updatePrompts(self: PlayerSnapshot): void {
    fp.setDowned(self.downed);
    updateReviveHud(self);

    if (self.downed) {
      downedBannerEl.classList.add("visible");
      downedBannerEl.textContent = self.beingRevived
        ? `DOWNED — revive in progress · bleedout paused (${Math.max(0, self.bleedout).toFixed(0)}s left)`
        : `DOWNED — bleedout ${Math.max(0, self.bleedout).toFixed(0)}s · wait for revive`;
      promptEl.classList.remove("visible");
      return;
    }
    downedBannerEl.classList.remove("visible");

    if (invUi.isOpen) {
      promptEl.classList.remove("visible");
      return;
    }

    const down = nearestDowned(active.playerId);
    if (down) {
      promptEl.classList.add("visible");
      promptEl.textContent =
        self.reviveProgress > 0
          ? `Reviving ${down.name}…`
          : `Hold E to revive ${down.name} (${COMBAT.reviveDuration}s)`;
      return;
    }

    if (nearWorkbench()) {
      const parts: string[] = [];
      if (latestBase.unlocks.includes("shotgun")) parts.push("C — craft shotgun");
      if (latestBase.workbenchTier < 3) parts.push("T — upgrade workbench");
      if (parts.length) {
        promptEl.classList.add("visible");
        promptEl.textContent = parts.join(" · ");
        return;
      }
    }

    if (nearGenerator() && latestBase.generatorTier < 3) {
      promptEl.classList.add("visible");
      promptEl.textContent = "T — upgrade generator";
      return;
    }

    if (nearStorage()) {
      const parts = ["E — open storage"];
      if (latestBase.storageTier < 3) parts.push("T — upgrade storage");
      promptEl.classList.add("visible");
      promptEl.textContent = parts.join(" · ");
      return;
    }

    const wall = nearestWall();
    if (wall) {
      const parts: string[] = [];
      if (wall.hp < wall.maxHp || wall.broken) parts.push("F — repair wall");
      if (wall.tier < 3) parts.push("T — upgrade wall");
      if (parts.length) {
        promptEl.classList.add("visible");
        promptEl.textContent = parts.join(" · ");
        return;
      }
    }

    const loot = nearestLoot();
    if (loot) {
      promptEl.classList.add("visible");
      promptEl.textContent = loot.opened ? `E — open ${loot.label}` : `E — search ${loot.label}`;
      return;
    }

    promptEl.classList.remove("visible");
  }

  updateInvasionHud(initialInvasion, me);
  updateBaseHud(initialBase);

  function onSnapshot(msg: Extract<ServerMessage, { type: "snapshot" }>): void {
    if (msg.you !== active.playerId) return;
    latestPlayers = msg.players;
    latestLoot = msg.lootNodes;
    latestStorage = msg.storage;
    latestBase = msg.base;
    latestInvasion = msg.invasion;
    playerCountEl.textContent = String(msg.players.length);
    zombieCountEl.textContent = String(msg.zombies.length);
    const self = msg.players.find((p) => p.id === active.playerId);
    if (self) {
      fp.reconcile(self);
      fp.setSelectedSlot(self.selectedSlot);
      updateHpHud(self.hp, self.maxHp);
      updateHungerHud(self.hunger, self.maxHunger);
      const held = self.hotbar[self.selectedSlot];
      viewmodel.setItem(held?.id ?? null);
      const gunHint =
        held && ITEMS[held.id].kind === "gun" ? ITEMS[held.id].label : "no gun";
      ammoEl.textContent = `${self.ammo} · ${gunHint}`;

      const lootSlots =
        invUi.getMode() === "loot" && invUi.getLootId()
          ? (latestLoot.find((n) => n.id === invUi.getLootId())?.slots ?? [])
          : undefined;
      invUi.sync({
        hotbar: self.hotbar,
        inventory: self.inventory,
        storage: latestStorage,
        lootSlots,
        selectedSlot: self.selectedSlot,
      });
      handleInteractEdge(self);
      handlePingEdge(self);
      updatePrompts(self);
      updateInvasionHud(msg.invasion, self);
    } else {
      updateInvasionHud(msg.invasion);
    }
    updateBaseHud(msg.base);
    remotes.sync(msg.players, active.playerId);
    zombies.sync(msg.zombies);
    lootVisuals.sync(msg.lootNodes);
    baseProps.sync(msg.base);
    worldPings.sync(msg.pings);
    handleEvents(msg.events, active.playerId, viewmodel);
  }

  function frame(now: number): void {
    if (!alive) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    fp.predict(dt, solids);
    remotes.update(dt);
    zombies.update(dt);

    const self = latestPlayers.find((p) => p.id === active.playerId);
    const axes = fp.getAxes();
    const moving = axes.forward !== 0 || axes.strafe !== 0;
    viewmodel.setVisible(!invUi.isOpen && !consoleUi.isOpen() && !self?.downed);
    viewmodel.update(dt, moving && !invUi.isOpen);

    inputAcc += dt;
    if (inputAcc >= 1 / 30) {
      inputAcc = 0;
      if (!consoleUi.isOpen()) {
        const packet = fp.nextInputPacket();
        if (invUi.isOpen) {
          packet.interact = false;
          packet.shoot = false;
          packet.melee = false;
          packet.jump = false;
          packet.forward = 0;
          packet.strafe = 0;
          packet.sprint = false;
        }
        invUi.setSelectedSlot(packet.selectedSlot);
        net.sendInput(packet);
      }
    }

    if (self) {
      handleInteractEdge(self);
      handlePingEdge(self);
    }

    camera.position.set(
      fp.state.x,
      fp.state.y + (self?.downed ? 0.55 : PLAYER.eyeHeight),
      fp.state.z,
    );
    camera.rotation.order = "YXZ";
    camera.rotation.y = fp.state.yaw;
    camera.rotation.x = fp.state.pitch;
    updateCompass();

    hintEl.textContent = consoleUi.isOpen()
      ? "Dev console open — ` to close"
      : invUi.isOpen
        ? "Inventory open — drag or Shift-click · E to close"
        : !fp.isLocked
          ? "Click the game to capture mouse"
          : fp.isSprinting()
            ? "Sprinting · release Shift to walk"
            : "1–6 · Shift sprint · E inv · R ready · Q/MMB ping · F repair · T upgrade · C craft · LMB use · ` console";

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);

  return {
    onSnapshot,
    onDevResult(ok: boolean, message: string) {
      consoleUi.append(message, ok ? "ok" : "err");
    },
    dispose() {
      alive = false;
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onGameKeyDown);
      fp.dispose();
      invUi.dispose();
      consoleUi.dispose();
      baseProps.dispose();
      worldPings.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      promptEl.classList.remove("visible");
      reviveHudEl.classList.remove("visible");
      downedBannerEl.classList.remove("visible");
      lootToastEl.classList.remove("on");
      hotbarEl.classList.remove("visible");
      vitalsEl.classList.remove("visible");
      invasionHudEl.classList.remove("visible");
      baseHudEl.classList.remove("visible");
      compassEl.classList.remove("visible");
      summaryOverlayEl.classList.remove("visible");
      sirenFlashEl.classList.remove("on");
    },
  };
}
