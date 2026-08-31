import {
  COMBAT,
  INV,
  ITEMS,
  MILESTONE,
  PLAYER,
  STORAGE_POS,
  distXZ,
  getSolidAabbs,
  type GameEvent,
  type LootNodeSnapshot,
  type PlayerSnapshot,
  type ServerMessage,
  type Slot,
  type SlotRef,
  type ZombieSnapshot,
} from "@coop/shared";
import * as THREE from "three";
import { FpController } from "./input/FpController";
import { ClientSocket } from "./net/ClientSocket";
import { LootNodeRenderer } from "./render/lootNodes";
import { buildPlaceholderWorld } from "./render/placeholders";
import { RemotePlayers } from "./render/remoteAvatars";
import { Viewmodel } from "./render/viewmodel";
import { ZombieRenderer } from "./render/zombies";
import { DevConsole } from "./ui/DevConsole";
import { InventoryUi } from "./ui/InventoryUi";
import { getPreviousNames, getRememberedName, rememberName } from "./ui/nameMemory";

const lobbyEl = document.getElementById("lobby")!;
const lobbyStatusEl = document.getElementById("lobby-status")!;
const lobbyNetEl = document.getElementById("lobby-net")!;
const nameInput = document.getElementById("name") as HTMLInputElement;
const codeInput = document.getElementById("code") as HTMLInputElement;
const btnCreate = document.getElementById("btn-create") as HTMLButtonElement;
const btnJoin = document.getElementById("btn-join") as HTMLButtonElement;

const hudEl = document.getElementById("hud")!;
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
const hpFillEl = document.getElementById("hp-fill")!;
const hpTextEl = document.getElementById("hp-text")!;
const ammoEl = document.getElementById("ammo")!;
const hintEl = document.getElementById("hint")!;

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
  const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  hpFillEl.style.width = `${pct}%`;
  hpTextEl.textContent = `${Math.round(hp)} / ${maxHp}`;
  hpFillEl.classList.toggle("critical", pct <= 30);
  hpFillEl.classList.toggle("hurt", pct > 30 && pct <= 60);
  if (hp < lastKnownHp) {
    hurtFlashEl.classList.add("on");
    window.setTimeout(() => hurtFlashEl.classList.remove("on"), 180);
  }
  lastKnownHp = hp;
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
    if (ev.kind === "lootOpen" && ev.playerId === you) {
      flashLootToast("Loot container opened");
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
      enterWorld(msg.players, msg.zombies, msg.lootNodes, msg.storage);
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
  socket.send({ type: "createRoom", name: commitDisplayName() });
});

btnJoin.addEventListener("click", () => {
  setLobbyError(null);
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
): void {
  if (!session) return;
  lobbyEl.classList.add("hidden");
  hudEl.classList.add("visible");
  hotbarEl.classList.add("visible");
  crosshairEl.classList.add("visible");
  roomCodeEl.textContent = session.code;
  youNameEl.textContent = session.name;
  playerCountEl.textContent = String(players.length);
  zombieCountEl.textContent = String(zombies.length);

  const me = players.find((p) => p.id === session!.playerId);
  lastKnownHp = me?.hp ?? PLAYER.maxHp;
  updateHpHud(me?.hp ?? PLAYER.maxHp, me?.maxHp ?? PLAYER.maxHp);
  ammoEl.textContent = String(me?.ammo ?? 0);

  if (game) game.dispose();
  game = startGame(session, players, zombies, lootNodes, storage, {
    sendInput: (packet) => socket.send({ type: "input", ...packet }),
    sendDev: (line) => socket.send({ type: "devCommand", line }),
    sendInvMove: (from, to) => socket.send({ type: "invMove", from, to }),
    sendOpenLoot: (lootId) => socket.send({ type: "openLoot", lootId }),
  });
}

function startGame(
  active: Session,
  initialPlayers: PlayerSnapshot[],
  initialZombies: ZombieSnapshot[],
  initialLoot: LootNodeSnapshot[],
  initialStorage: Slot[],
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
    }) => void;
    sendDev: (line: string) => void;
    sendInvMove: (from: SlotRef, to: SlotRef) => void;
    sendOpenLoot: (lootId: string) => void;
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

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener("resize", onResize);

  let last = performance.now();
  let inputAcc = 0;
  let alive = true;
  let latestPlayers: PlayerSnapshot[] = initialPlayers;
  let latestLoot: LootNodeSnapshot[] = initialLoot;
  let latestStorage: Slot[] = initialStorage;

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

  function handleInteractEdge(self: PlayerSnapshot): void {
    if (!fp.consumeInteractEdge() || self.downed) return;

    if (invUi.isOpen) {
      invUi.close();
      return;
    }

    // Revive takes priority — don't open menus when a downed ally is in range.
    if (nearestDowned(active.playerId)) return;

    if (nearStorage()) {
      invUi.openStorage();
      return;
    }

    const loot = nearestLoot();
    if (loot) {
      net.sendOpenLoot(loot.id);
      // Open with current snapshot; next snapshot will fill rolled slots.
      const node = latestLoot.find((n) => n.id === loot.id) ?? loot;
      invUi.openLoot(node.id, node.label, node.slots);
      return;
    }

    invUi.openPlayer();
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

    if (nearStorage()) {
      promptEl.classList.add("visible");
      promptEl.textContent = "E — open storage";
      return;
    }

    const loot = nearestLoot();
    if (loot) {
      promptEl.classList.add("visible");
      promptEl.textContent = loot.opened ? `E — open ${loot.label}` : `E — search ${loot.label}`;
      return;
    }

    promptEl.classList.remove("visible");
  }

  function onSnapshot(msg: Extract<ServerMessage, { type: "snapshot" }>): void {
    if (msg.you !== active.playerId) return;
    latestPlayers = msg.players;
    latestLoot = msg.lootNodes;
    latestStorage = msg.storage;
    playerCountEl.textContent = String(msg.players.length);
    zombieCountEl.textContent = String(msg.zombies.length);
    const self = msg.players.find((p) => p.id === active.playerId);
    if (self) {
      fp.reconcile(self);
      fp.setSelectedSlot(self.selectedSlot);
      updateHpHud(self.hp, self.maxHp);
      ammoEl.textContent = String(self.ammo);
      const active = self.hotbar[self.selectedSlot];
      viewmodel.setItem(active?.id ?? null);
      const gunHint =
        active && ITEMS[active.id].kind === "gun" ? ITEMS[active.id].label : "no gun";
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
      updatePrompts(self);
    }
    remotes.sync(msg.players, active.playerId);
    zombies.sync(msg.zombies);
    lootVisuals.sync(msg.lootNodes);
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
        // While inventory is open, don't hold E for revive, and don't shoot.
        if (invUi.isOpen) {
          packet.interact = false;
          packet.shoot = false;
          packet.melee = false;
          packet.jump = false;
          packet.forward = 0;
          packet.strafe = 0;
        }
        invUi.setSelectedSlot(packet.selectedSlot);
        net.sendInput(packet);
      }
    }

    // Poll E edge between snapshots so UI feels snappy.
    if (self) handleInteractEdge(self);

    camera.position.set(
      fp.state.x,
      fp.state.y + (self?.downed ? 0.55 : PLAYER.eyeHeight),
      fp.state.z,
    );
    camera.rotation.order = "YXZ";
    camera.rotation.y = fp.state.yaw;
    camera.rotation.x = fp.state.pitch;

    hintEl.textContent = consoleUi.isOpen()
      ? "Dev console open — ` to close"
      : invUi.isOpen
        ? "Inventory open — E to close · drag to move items"
        : fp.isLocked
          ? "1–6 hotbar · E inventory/loot/storage · LMB shoot (gun) · F melee · Space jump · ` console"
          : "Click the game to capture mouse";

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
      fp.dispose();
      invUi.dispose();
      consoleUi.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      promptEl.classList.remove("visible");
      reviveHudEl.classList.remove("visible");
      downedBannerEl.classList.remove("visible");
      lootToastEl.classList.remove("on");
      hotbarEl.classList.remove("visible");
    },
  };
}
