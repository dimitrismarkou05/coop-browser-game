import {
  BASE,
  BASE_LAYOUT,
  COMBAT,
  INV,
  PLAYER,
  STORAGE_POS,
  TICK_HZ,
  baseFacilityAabbs,
  baseWallSolids,
  countItem,
  distXZ,
  generatorTierDef,
  getSolidAabbs,
  lootSpotAabbs,
  storageTierDef,
  wallDoorCenter,
  wallHasDoor,
  wallTierDef,
  workbenchTierDef,
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
const roomCodeEl = document.getElementById("room-code")!;
const playerCountEl = document.getElementById("player-count")!;

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
      return "WAVE";
    case "resolve":
      return "PREP";
    default:
      return "PREP";
  }
}

function formatTimer(sec: number): string {
  if (sec < 0) return "waiting";
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
        `Wave ${ev.invasionIndex + 1} cleared`,
        `Back to base · +${ev.scrap} scrap · +${ev.ammo} ammo · R when ready`,
      );
    }
    if (ev.kind === "invasionLost") {
      sfx.lose();
      showSummary("lose", `Wave ${ev.invasionIndex + 1} failed`, "Core breached — regroup and rebuild.");
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
  playerCountEl.textContent = String(players.length);

  const me = players.find((p) => p.id === session!.playerId);
  lastKnownHp = me?.hp ?? PLAYER.maxHp;
  updateHpHud(me?.hp ?? PLAYER.maxHp, me?.maxHp ?? PLAYER.maxHp);
  updateHungerHud(me?.hunger ?? 100, me?.maxHunger ?? 100);

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
    sendToggleDoor: (wallId) => socket.send({ type: "toggleDoor", wallId }),
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
    sendToggleDoor: (wallId: WallId) => void;
  },
) {
  let solids = [
    ...getSolidAabbs(),
    ...baseWallSolids(initialBase.walls),
    ...baseFacilityAabbs(),
    ...lootSpotAabbs(),
  ];
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
    z: me?.z ?? 0,
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
    onSelectSlot: (n) => fp.setSelectedSlot(n),
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
    onSubmit: (line) => {
      const cmd = line.trim().toLowerCase();
      const driftWatch = cmd.match(/^time drift watch(?: (\d+))?$/);
      if (driftWatch) {
        startDriftWatch(Number(driftWatch[1] ?? 8));
        return;
      }
      if (cmd === "time drift") {
        printTimeDrift();
        return;
      }
      const watch = cmd.match(/^time watch(?: (\d+))?$/);
      if (watch) {
        startTimeWatch(Number(watch[1] ?? 8));
        return;
      }
      if (cmd === "time") {
        pendingTimeStats = true;
      }
      net.sendDev(line);
    },
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
  const inputIdleInterval = 1 / TICK_HZ;
  let alive = true;

  let lastSnapTick = 0;
  let lastSnapAt = 0;
  let snapGapMs: number[] = [];
  let pendingTimeStats = false;
  let pendingDriftServer = false;
  let timeWatchTimer: ReturnType<typeof setInterval> | null = null;
  let driftWatchTimer: ReturnType<typeof setInterval> | null = null;
  let inputSendTimes: number[] = [];
  let driftWatchMax = 0;

  function inputRateLine(): string {
    const now = performance.now();
    inputSendTimes = inputSendTimes.filter((t) => now - t < 2000);
    if (inputSendTimes.length < 2) return "input send: collecting…";
    const hz = inputSendTimes.length / 2;
    return `input send ~${hz.toFixed(0)} Hz (2s window)`;
  }

  function snapshotStats(): { line: string; hz: number; jitter: number } | null {
    if (snapGapMs.length < 2) return null;
    const avg = snapGapMs.reduce((a, b) => a + b, 0) / snapGapMs.length;
    const hz = 1000 / avg;
    const min = Math.min(...snapGapMs);
    const max = Math.max(...snapGapMs);
    return {
      line: `snapshots ~${hz.toFixed(1)} Hz (${min.toFixed(0)}–${max.toFixed(0)} ms, tick=${lastSnapTick})`,
      hz,
      jitter: max - min,
    };
  }

  function snapshotRateLine(): string {
    return snapshotStats()?.line ?? "client snapshots: collecting…";
  }

  function driftVerdict(distXZ: number, moving: boolean, snap: NonNullable<ReturnType<typeof snapshotStats>>, lastInputMs?: number): string {
    const issues: string[] = [];
    if (snap.hz < 14 || snap.jitter > 80) {
      issues.push("SERVER/HOST (snapshot jitter or low Hz)");
    }
    if (lastInputMs !== undefined && lastInputMs >= 400) {
      issues.push("SERVER/NETWORK (input packets late)");
    }
    if (distXZ >= 5) {
      issues.push("NETCODE (hard reconcile snap zone)");
    } else if (distXZ > 0.35 && moving) {
      issues.push("NETCODE (client ahead of server while moving)");
    }
    if (issues.length === 0) return "OK — infra and drift look nominal";
    return issues.join(" · ");
  }

  function printTimeDrift(fetchServer = true): void {
    const self = latestPlayers.find((p) => p.id === active.playerId);
    if (!self) {
      consoleUi.append("time drift: no player snapshot yet", "err");
      return;
    }

    const distXZ = Math.hypot(fp.state.x - self.x, fp.state.z - self.z);
    const dy = fp.state.y - self.y;
    driftWatchMax = Math.max(driftWatchMax, distXZ);
    const moving = fp.isMoving();
    const snap = snapshotStats();
    const rtt = rttEl.textContent ?? "—";

    consoleUi.append(
      `pos drift xz=${distXZ.toFixed(2)}m y=${dy.toFixed(2)}m · client=(${fp.state.x.toFixed(1)}, ${fp.state.z.toFixed(1)}) server=(${self.x.toFixed(1)}, ${self.z.toFixed(1)})`,
      "info",
    );
    consoleUi.append(`${inputRateLine()} · moving=${moving} · rtt=${rtt}`, "info");
    if (snap) {
      consoleUi.append(snap.line, "info");
      if (!fetchServer) {
        consoleUi.append(
          `verdict: ${driftVerdict(distXZ, moving, snap)}`,
          "info",
        );
      }
    } else {
      consoleUi.append("snapshots: collecting… (move around briefly)", "info");
    }

    if (fetchServer) {
      pendingDriftServer = true;
      net.sendDev("time");
    }
  }

  function startDriftWatch(sec: number): void {
    if (driftWatchTimer !== null) clearInterval(driftWatchTimer);
    driftWatchMax = 0;
    const duration = Math.max(3, Math.min(60, sec));
    consoleUi.append(`time drift watch ${duration}s…`, "info");
    printTimeDrift(false);
    const endAt = performance.now() + duration * 1000;
    driftWatchTimer = setInterval(() => {
      if (!alive || performance.now() >= endAt) {
        if (driftWatchTimer !== null) clearInterval(driftWatchTimer);
        driftWatchTimer = null;
        consoleUi.append(`time drift watch done · peak xz drift=${driftWatchMax.toFixed(2)}m`, "info");
        pendingDriftServer = true;
        net.sendDev("time");
        return;
      }
      printTimeDrift(false);
    }, 1000);
  }

  function startTimeWatch(sec: number): void {
    if (timeWatchTimer !== null) clearInterval(timeWatchTimer);
    const duration = Math.max(3, Math.min(60, sec));
    consoleUi.append(`time watch ${duration}s — logging snapshot rate…`, "info");
    const endAt = performance.now() + duration * 1000;
    timeWatchTimer = setInterval(() => {
      if (!alive || performance.now() >= endAt) {
        if (timeWatchTimer !== null) clearInterval(timeWatchTimer);
        timeWatchTimer = null;
        consoleUi.append("time watch done", "info");
        return;
      }
      consoleUi.append(snapshotRateLine(), "info");
      net.sendDev("time");
    }, 1000);
  }

  function updateInvasionHud(inv: InvasionSnapshot, self?: PlayerSnapshot): void {
    invasionPhaseEl.textContent = phaseLabel(inv.phase);
    invasionMetaEl.textContent =
      inv.phase === "prep"
        ? `Wave ${inv.invasionIndex + 1} · wait for ready`
        : inv.phase === "warning"
          ? `Wave ${inv.invasionIndex + 1} incoming · ${formatTimer(inv.phaseEndsIn)}`
          : `Wave ${inv.invasionIndex + 1} · ${formatTimer(inv.phaseEndsIn)}`;
    const readyHint =
      inv.phase === "prep"
        ? self?.ready
          ? "You are READY · R to cancel"
          : "R — Ready (starts when all ready)"
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
    if (!alive || consoleUi.isOpen()) return;
    if (e.repeat) return;

    if (e.code === "Escape") {
      if (invUi.isOpen) {
        e.preventDefault();
        invUi.close();
      }
      return;
    }

    if (e.code === "KeyI") {
      e.preventDefault();
      const selfInv = latestPlayers.find((p) => p.id === active.playerId);
      if (invUi.isOpen || !selfInv || selfInv.downed) return;
      invUi.openPlayer();
      return;
    }

    if (invUi.isOpen) return;
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
      const have = bagCounts(self);

      if (nearWorkbench() && latestBase.workbenchTier < 3) {
        const next = workbenchTierDef(latestBase.workbenchTier + 1);
        const msg = needMsg("workbench", next.upgradeScrap, 0, have);
        if (msg) {
          flashLootToast(msg);
          return;
        }
        net.sendUpgradeBase("workbench");
        return;
      }
      if (nearGenerator() && latestBase.generatorTier < 3) {
        const next = generatorTierDef(latestBase.generatorTier + 1);
        const msg = needMsg("generator", next.upgradeScrap, 0, have);
        if (msg) {
          flashLootToast(msg);
          return;
        }
        net.sendUpgradeBase("generator");
        return;
      }
      if (nearStorage() && latestBase.storageTier < 3) {
        const next = storageTierDef(latestBase.storageTier + 1);
        const msg = needMsg("storage", next.upgradeScrap, next.upgradeWood, have);
        if (msg) {
          flashLootToast(msg);
          return;
        }
        net.sendUpgradeBase("storage");
        return;
      }
      const wall = nearestWall();
      if (wall && wall.tier < 3) {
        const next = wallTierDef(wall.tier + 1);
        const msg = needMsg(`${wall.id} wall`, next.upgradeScrap, next.upgradeWood, have);
        if (msg) {
          flashLootToast(msg);
          return;
        }
        net.sendUpgradeBase("wall", wall.id);
      }
      return;
    }

    if (e.code === "KeyC") {
      e.preventDefault();
      if (nearWorkbench() && latestBase.unlocks.includes("shotgun")) {
        const have = bagCounts(self);
        if (have.scrap < BASE.shotgunCraftScrap || have.wood < BASE.shotgunCraftWood) {
          const missing: string[] = [];
          if (BASE.shotgunCraftScrap > have.scrap) missing.push(`${BASE.shotgunCraftScrap} scrap`);
          if (BASE.shotgunCraftWood > have.wood) missing.push(`${BASE.shotgunCraftWood} wood`);
          flashLootToast(`Need ${missing.join(" + ")} to craft shotgun`);
          return;
        }
        net.sendCraft("shotgun");
      }
    }
  };
  window.addEventListener("keydown", onGameKeyDown);

  function nearestDoorWall(): (typeof latestBase.walls)[number] | null {
    let best: (typeof latestBase.walls)[number] | null = null;
    let dist = Number(BASE.doorInteractRange);
    for (const wall of latestBase.walls) {
      if (!wallHasDoor(wall.id)) continue;
      if (wall.broken || wall.hp <= 0) continue;
      const door = wallDoorCenter(wall.id);
      const d = distXZ(fp.state.x, fp.state.z, door.x, door.z);
      if (d < dist) {
        dist = d;
        best = wall;
      }
    }
    return best;
  }

  function rebuildSolidsFromBase(base: BaseSnapshot): void {
    solids = [
      ...getSolidAabbs(),
      ...baseWallSolids(base.walls),
      ...baseFacilityAabbs(),
      ...lootSpotAabbs(),
    ];
  }

  function bagCounts(self: PlayerSnapshot): { scrap: number; wood: number } {
    return {
      scrap: countItem(self.hotbar, "scrap") + countItem(self.inventory, "scrap"),
      wood: countItem(self.hotbar, "wood") + countItem(self.inventory, "wood"),
    };
  }

  function needMsg(label: string, needScrap: number, needWood: number, have: { scrap: number; wood: number }): string | null {
    const missing: string[] = [];
    if (needScrap > have.scrap) missing.push(`${needScrap} scrap`);
    if (needWood > have.wood) missing.push(`${needWood} wood`);
    if (!missing.length) return null;
    return `Need ${missing.join(" + ")} to upgrade ${label}`;
  }

  function handleInteractEdge(self: PlayerSnapshot): void {
    if (!fp.consumeInteractEdge() || self.downed) return;

    if (invUi.isOpen) {
      if (invUi.getMode() === "storage" && nearStorage()) {
        invUi.close();
        return;
      }
      if (invUi.getMode() === "loot") {
        const loot = nearestLoot();
        if (loot && loot.id === invUi.getLootId()) {
          invUi.close();
          return;
        }
      }
      return;
    }

    if (nearestDowned(active.playerId)) return;

    const doorWall = nearestDoorWall();
    if (doorWall) {
      net.sendToggleDoor(doorWall.id);
      return;
    }

    if (nearStorage()) {
      invUi.openStorage();
      return;
    }

    const loot = nearestLoot();
    if (loot) {
      net.sendOpenLoot(loot.id);
      const node = latestLoot.find((n) => n.id === loot.id) ?? loot;
      invUi.openLoot(node.id, node.label, node.slots);
    }
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
    promptEl.classList.remove("visible");

    if (self.downed) {
      downedBannerEl.classList.add("visible");
      downedBannerEl.textContent = self.beingRevived
        ? `DOWNED — revive in progress · bleedout paused (${Math.max(0, self.bleedout).toFixed(0)}s left)`
        : `DOWNED — bleedout ${Math.max(0, self.bleedout).toFixed(0)}s · wait for revive`;
      return;
    }
    downedBannerEl.classList.remove("visible");
  }

  updateInvasionHud(initialInvasion, me);
  updateBaseHud(initialBase);

  function onSnapshot(msg: Extract<ServerMessage, { type: "snapshot" }>): void {
    const snapNow = performance.now();
    if (lastSnapAt > 0) {
      snapGapMs.push(snapNow - lastSnapAt);
      if (snapGapMs.length > 40) snapGapMs.shift();
    }
    lastSnapAt = snapNow;
    lastSnapTick = msg.tick;

    if (msg.you !== active.playerId) return;
    latestPlayers = msg.players;
    latestLoot = msg.lootNodes;
    latestStorage = msg.storage;
    latestBase = msg.base;
    latestInvasion = msg.invasion;
    rebuildSolidsFromBase(msg.base);
    playerCountEl.textContent = String(msg.players.length);
    const self = msg.players.find((p) => p.id === active.playerId);
    if (self) {
      fp.reconcile(self, fp.isMoving());
      fp.acceptServerSlot(self.selectedSlot);
      updateHpHud(self.hp, self.maxHp);
      updateHungerHud(self.hunger, self.maxHunger);
      const held = self.hotbar[fp.getSelectedSlot()];
      viewmodel.setItem(held?.id ?? null);

      const lootSlots =
        invUi.getMode() === "loot" && invUi.getLootId()
          ? (latestLoot.find((n) => n.id === invUi.getLootId())?.slots ?? [])
          : undefined;
      invUi.sync({
        hotbar: self.hotbar,
        inventory: self.inventory,
        storage: latestStorage,
        lootSlots,
        selectedSlot: fp.getSelectedSlot(),
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
    const forceInput = fp.consumeForceInput();
    const sendInputNow =
      forceInput || moving || inputAcc >= inputIdleInterval;
    if (sendInputNow) {
      inputAcc = moving || forceInput ? 0 : inputAcc - inputIdleInterval;
      if (inputAcc < 0) inputAcc = 0;
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
        inputSendTimes.push(performance.now());
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

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);

  return {
    onSnapshot,
    onDevResult(ok: boolean, message: string) {
      if (pendingDriftServer && ok && message.startsWith("epoch=")) {
        pendingDriftServer = false;
        consoleUi.append(`server · ${message}`, "ok");
        const lastInput = Number(message.match(/lastInput=(\d+)ms/)?.[1] ?? NaN);
        const self = latestPlayers.find((p) => p.id === active.playerId);
        const snap = snapshotStats();
        if (self && snap) {
          const distXZ = Math.hypot(fp.state.x - self.x, fp.state.z - self.z);
          const verdict = driftVerdict(distXZ, fp.isMoving(), snap, lastInput);
          consoleUi.append(
            `verdict (with server): ${verdict}`,
            verdict.startsWith("OK") ? "ok" : "err",
          );
        }
        return;
      }
      consoleUi.append(message, ok ? "ok" : "err");
      if (pendingTimeStats && ok && message.startsWith("epoch=")) {
        pendingTimeStats = false;
        consoleUi.append(snapshotRateLine(), "info");
      }
    },
    dispose() {
      if (timeWatchTimer !== null) clearInterval(timeWatchTimer);
      if (driftWatchTimer !== null) clearInterval(driftWatchTimer);
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
