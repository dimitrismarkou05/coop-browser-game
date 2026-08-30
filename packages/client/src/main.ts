import {
  COMBAT,
  MILESTONE,
  PLAYER,
  distXZ,
  getSolidAabbs,
  type GameEvent,
  type PlayerSnapshot,
  type ServerMessage,
  type ZombieSnapshot,
} from "@coop/shared";
import * as THREE from "three";
import { FpController } from "./input/FpController";
import { ClientSocket } from "./net/ClientSocket";
import { buildPlaceholderWorld } from "./render/placeholders";
import { RemotePlayers } from "./render/remoteAvatars";
import { ZombieRenderer } from "./render/zombies";
import { DevConsole } from "./ui/DevConsole";

const lobbyEl = document.getElementById("lobby")!;
const lobbyStatusEl = document.getElementById("lobby-status")!;
const lobbyNetEl = document.getElementById("lobby-net")!;
const nameInput = document.getElementById("name") as HTMLInputElement;
const codeInput = document.getElementById("code") as HTMLInputElement;
const btnCreate = document.getElementById("btn-create") as HTMLButtonElement;
const btnJoin = document.getElementById("btn-join") as HTMLButtonElement;

const hudEl = document.getElementById("hud")!;
const crosshairEl = document.getElementById("crosshair")!;
const hurtFlashEl = document.getElementById("hurt-flash")!;
const hitMarkerEl = document.getElementById("hit-marker")!;
const promptEl = document.getElementById("prompt")!;
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
nameInput.value = `Survivor${Math.floor(Math.random() * 90 + 10)}`;

type Session = {
  playerId: string;
  code: string;
  name: string;
};

let session: Session | null = null;
let game: ReturnType<typeof startGame> | null = null;
let lastKnownHp = PLAYER.maxHp;

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

function handleEvents(events: GameEvent[] | undefined, you: string): void {
  if (!events) return;
  for (const ev of events) {
    if ((ev.kind === "shot" || ev.kind === "melee") && ev.playerId === you && ev.hit) {
      flashHitMarker();
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
      session = {
        playerId: msg.playerId,
        code: msg.code,
        name: nameInput.value.trim() || "Survivor",
      };
      enterWorld(msg.players, msg.zombies);
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
  socket.send({ type: "createRoom", name: nameInput.value.trim() || "Survivor" });
});

btnJoin.addEventListener("click", () => {
  setLobbyError(null);
  const code = codeInput.value.trim().toUpperCase();
  if (code.length < 4) {
    setLobbyError("Enter the 6-character invite code");
    return;
  }
  socket.send({ type: "joinRoom", code, name: nameInput.value.trim() || "Survivor" });
});

codeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") btnJoin.click();
});

function enterWorld(players: PlayerSnapshot[], zombies: ZombieSnapshot[]): void {
  if (!session) return;
  lobbyEl.classList.add("hidden");
  hudEl.classList.add("visible");
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
  game = startGame(session, players, zombies, {
    sendInput: (packet) => socket.send({ type: "input", ...packet }),
    sendDev: (line) => socket.send({ type: "devCommand", line }),
  });
}

function startGame(
  active: Session,
  initialPlayers: PlayerSnapshot[],
  initialZombies: ZombieSnapshot[],
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
    }) => void;
    sendDev: (line: string) => void;
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

  const fp = new FpController(renderer.domElement, {
    x: me?.x ?? 0,
    y: me?.y ?? 0,
    z: me?.z ?? 4,
    yaw: me?.yaw ?? 0,
    pitch: me?.pitch ?? 0,
  });

  const consoleUi = new DevConsole({
    onSubmit: (line) => net.sendDev(line),
    onOpenChange: (open) => {
      fp.setBlocked(open);
      crosshairEl.classList.toggle("visible", !open);
    },
  });
  consoleUi.append("Dev console ready. Press ` to toggle.", "info");

  remotes.sync(initialPlayers, active.playerId);
  zombies.sync(initialZombies);

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

  function updateReviveHud(self: PlayerSnapshot): void {
    const progress = self.reviveProgress;
    const being = self.beingRevived;
    // Find progress if we're the downed one being revived
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

    if (shown > 0 || (being && shown >= 0 && latestPlayers.some((p) => p.reviveProgress > 0))) {
      const p = Math.max(shown, being ? latestPlayers.find((x) => x.reviveProgress > 0)?.reviveProgress ?? 0 : 0);
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

    let nearestDown: PlayerSnapshot | null = null;
    let best = COMBAT.reviveRange;
    for (const p of latestPlayers) {
      if (p.id === active.playerId || !p.downed) continue;
      const d = distXZ(fp.state.x, fp.state.z, p.x, p.z);
      if (d < best) {
        best = d;
        nearestDown = p;
      }
    }

    if (nearestDown && self.reviveProgress <= 0) {
      promptEl.classList.add("visible");
      promptEl.textContent = `Hold E to revive ${nearestDown.name} (${COMBAT.reviveDuration}s)`;
    } else if (!nearestDown) {
      promptEl.classList.remove("visible");
    } else {
      promptEl.classList.remove("visible");
    }
  }

  function onSnapshot(msg: Extract<ServerMessage, { type: "snapshot" }>): void {
    if (msg.you !== active.playerId) return;
    latestPlayers = msg.players;
    playerCountEl.textContent = String(msg.players.length);
    zombieCountEl.textContent = String(msg.zombies.length);
    const self = msg.players.find((p) => p.id === active.playerId);
    if (self) {
      fp.reconcile(self);
      updateHpHud(self.hp, self.maxHp);
      ammoEl.textContent = String(self.ammo);
      updatePrompts(self);
    }
    remotes.sync(msg.players, active.playerId);
    zombies.sync(msg.zombies);
    handleEvents(msg.events, active.playerId);
  }

  function frame(now: number): void {
    if (!alive) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    fp.predict(dt, solids);
    remotes.update(dt);
    zombies.update(dt);

    inputAcc += dt;
    if (inputAcc >= 1 / 30) {
      inputAcc = 0;
      if (!consoleUi.isOpen()) {
        net.sendInput(fp.nextInputPacket());
      }
    }

    const self = latestPlayers.find((p) => p.id === active.playerId);
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
      : fp.isLocked
        ? "LMB shoot · F melee · Space jump · E revive · ` console"
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
      consoleUi.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      promptEl.classList.remove("visible");
      reviveHudEl.classList.remove("visible");
      downedBannerEl.classList.remove("visible");
    },
  };
}
