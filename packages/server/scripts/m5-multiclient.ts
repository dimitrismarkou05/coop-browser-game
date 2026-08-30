/**
 * Multi-client integration test for M5: join sync, movement, combat, down/revive.
 */
import { WebSocket } from "ws";

type Snap = {
  type: "snapshot";
  you: string;
  players: Array<{
    id: string;
    name: string;
    x: number;
    z: number;
    hp: number;
    maxHp: number;
    ammo: number;
    downed: boolean;
    bleedout: number;
  }>;
  zombies: Array<{ id: string; x: number; z: number; hp: number }>;
  events?: Array<{ kind: string; playerId?: string; by?: string; hit?: boolean }>;
};

function connect(): Promise<WebSocket> {
  const ws = new WebSocket("ws://localhost:2567");
  return new Promise((resolve, reject) => {
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
  });
}

function waitFor<T = any>(ws: WebSocket, type: string, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), timeoutMs);
    const onMsg = (raw: WebSocket.RawData) => {
      const msg = JSON.parse(String(raw));
      if (msg.type === type) {
        clearTimeout(t);
        ws.off("message", onMsg);
        resolve(msg as T);
      }
    };
    ws.on("message", onMsg);
  });
}

async function nextSnap(ws: WebSocket): Promise<Snap> {
  return waitFor(ws, "snapshot", 5000);
}

function sendInput(
  ws: WebSocket,
  seq: number,
  partial: {
    forward?: number;
    strafe?: number;
    yaw?: number;
    pitch?: number;
    shoot?: boolean;
    melee?: boolean;
    interact?: boolean;
  },
) {
  ws.send(
    JSON.stringify({
      type: "input",
      seq,
      forward: partial.forward ?? 0,
      strafe: partial.strafe ?? 0,
      yaw: partial.yaw ?? 0,
      pitch: partial.pitch ?? 0,
      shoot: Boolean(partial.shoot),
      melee: Boolean(partial.melee),
      interact: Boolean(partial.interact),
    }),
  );
}

function aimYaw(from: { x: number; z: number }, to: { x: number; z: number }) {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}

function dist(a: { x: number; z: number }, b: { x: number; z: number }) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

const results: string[] = [];
function pass(name: string, detail = "") {
  results.push(`PASS ${name}${detail ? ` — ${detail}` : ""}`);
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name: string, detail: string): never {
  results.push(`FAIL ${name} — ${detail}`);
  console.error(`✗ ${name} — ${detail}`);
  throw new Error(detail);
}

const a = await connect();
await waitFor(a, "welcome");
a.send(JSON.stringify({ type: "createRoom", name: "Alpha" }));
const joinedA = await waitFor<any>(a, "roomJoined");
const code = joinedA.code as string;
const idA = joinedA.playerId as string;
pass("create room", code);

const b = await connect();
await waitFor(b, "welcome");
b.send(JSON.stringify({ type: "joinRoom", code, name: "Bravo" }));
const joinedB = await waitFor<any>(b, "roomJoined");
const idB = joinedB.playerId as string;
if (joinedB.players.length !== 2) fail("join room", `expected 2 players, got ${joinedB.players.length}`);
pass("join room", `${joinedB.players.map((p: any) => p.name).join(", ")}`);

// Movement sync: Alpha walks +Z, Bravo should see Alpha move.
const before = await nextSnap(a);
const a0 = before.players.find((p) => p.id === idA)!;
for (let i = 0; i < 20; i++) {
  sendInput(a, i + 1, { forward: 1, yaw: Math.PI }); // yaw π → +Z with our move math? 
  // yaw 0 → -Z; yaw π → +Z: dx=-sin(π)*f=0, dz=-cos(π)*f = f → +Z yes
  await nextSnap(a);
}
const afterA = await nextSnap(a);
const afterB = await nextSnap(b);
const a1 = afterA.players.find((p) => p.id === idA)!;
const aSeenByB = afterB.players.find((p) => p.id === idA)!;
const moved = Math.hypot(a1.x - a0.x, a1.z - a0.z);
if (moved < 1) fail("movement", `Alpha barely moved (${moved.toFixed(2)})`);
const syncErr = dist(a1, aSeenByB);
if (syncErr > 1.5) fail("movement sync", `Bravo sees Alpha offset by ${syncErr.toFixed(2)}`);
pass("movement sync", `Alpha moved ${moved.toFixed(1)}u, sync err ${syncErr.toFixed(2)}`);

// Combat: Alpha kills a zombie
let kills = 0;
let ammoStart = a1.ammo;
for (let i = 0; i < 60; i++) {
  const s = await nextSnap(a);
  const self = s.players.find((p) => p.id === idA)!;
  if (!s.zombies.length) break;
  let target = s.zombies[0]!;
  let td = Infinity;
  for (const z of s.zombies) {
    const d = dist(self, z);
    if (d < td) {
      td = d;
      target = z;
    }
  }
  const yaw = aimYaw(self, target);
  sendInput(a, 100 + i, {
    forward: td > 2 ? 1 : 0,
    yaw,
    pitch: -0.05,
    shoot: true,
    melee: td < 1.9,
  });
  const s2 = await nextSnap(a);
  for (const ev of s2.events ?? []) {
    if (ev.kind === "kill") kills += 1;
  }
  if (kills >= 1) {
    ammoStart = self.ammo;
    break;
  }
}
if (kills < 1) fail("combat", "no zombie kills");
const afterCombat = await nextSnap(a);
const ammoNow = afterCombat.players.find((p) => p.id === idA)!.ammo;
pass("combat kill", `kills=${kills}, ammo ${ammoNow}`);

// Down Alpha by standing still near zombies OR force damage via packing
// Easier: walk Alpha into zombies without shooting until downed
let downed = false;
for (let i = 0; i < 200; i++) {
  const s = await nextSnap(a);
  const self = s.players.find((p) => p.id === idA)!;
  if (self.downed) {
    downed = true;
    break;
  }
  if (!s.zombies.length) {
    // wait for respawn
    sendInput(a, 200 + i, {});
    continue;
  }
  let target = s.zombies[0]!;
  let td = Infinity;
  for (const z of s.zombies) {
    const d = dist(self, z);
    if (d < td) {
      td = d;
      target = z;
    }
  }
  sendInput(a, 200 + i, {
    forward: 1,
    yaw: aimYaw(self, target),
    shoot: false,
  });
}
if (!downed) fail("downed state", "Alpha never went down");
const downSnap = await nextSnap(b);
const alphaDown = downSnap.players.find((p) => p.id === idA)!;
if (!alphaDown.downed) fail("down sync", "Bravo does not see Alpha downed");
pass("downed sync", `bleedout ${alphaDown.bleedout.toFixed(1)}s`);

// Bravo walks to Alpha and holds E to revive (may be far after the chase).
let revived = false;
for (let i = 0; i < 300; i++) {
  const s = await nextSnap(b);
  const bravo = s.players.find((p) => p.id === idB)!;
  const alpha = s.players.find((p) => p.id === idA)!;
  if (!alpha.downed) {
    revived = true;
    break;
  }
  const yaw = aimYaw(bravo, alpha);
  const d = dist(bravo, alpha);
  sendInput(b, 400 + i, {
    forward: d > 1.2 ? 1 : 0,
    yaw,
    interact: d <= 2.4,
  });
  sendInput(a, 500 + i, {});
}
if (!revived) fail("revive", "Bravo failed to revive Alpha");
const revSnap = await nextSnap(a);
const alphaUp = revSnap.players.find((p) => p.id === idA)!;
if (alphaUp.downed || alphaUp.hp <= 0) fail("revive state", `still downed hp=${alphaUp.hp}`);
pass("revive", `Alpha HP ${alphaUp.hp}`);

a.close();
b.close();

console.log("\n=== MULTI-CLIENT M5 RESULTS ===");
for (const line of results) console.log(line);
console.log("ALL_PASSED");
