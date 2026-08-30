import { WebSocket } from "ws";
import { LOOT, LOOT_SPOTS, STORAGE_POS, bagTotal } from "@coop/shared";

function connect(): Promise<WebSocket> {
  return new Promise((res, rej) => {
    const ws = new WebSocket("ws://localhost:2567");
    ws.once("open", () => res(ws));
    ws.once("error", rej);
  });
}

function wait(ws: WebSocket, type: string): Promise<any> {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("timeout " + type)), 8000);
    const onMsg = (d: WebSocket.RawData) => {
      const m = JSON.parse(String(d));
      if (m.type === type) {
        clearTimeout(t);
        ws.off("message", onMsg);
        res(m);
      }
    };
    ws.on("message", onMsg);
  });
}

/** yaw such that forward faces (dx, dz) in XZ (matches shared movement). */
function faceYaw(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

function sendInput(
  ws: WebSocket,
  seq: number,
  extra: Partial<{
    forward: number;
    strafe: number;
    yaw: number;
    pitch: number;
    interact: boolean;
    withdraw: boolean;
  }> = {},
): void {
  ws.send(
    JSON.stringify({
      type: "input",
      seq,
      forward: 0,
      strafe: 0,
      yaw: 0,
      pitch: 0,
      ...extra,
    }),
  );
}

async function walkTo(
  ws: WebSocket,
  playerId: string,
  target: { x: number; z: number },
  range: number,
  seqRef: { n: number },
  maxSteps = 500,
): Promise<any> {
  let me: any = null;
  let snap: any = null;
  for (let i = 0; i < maxSteps; i++) {
    snap = await wait(ws, "snapshot");
    me = snap.players.find((p: { id: string }) => p.id === playerId) ?? snap.players[0];
    const dx = target.x - me.x;
    const dz = target.z - me.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= range) return snap;
    sendInput(ws, seqRef.n++, { forward: 1, yaw: faceYaw(dx, dz) });
  }
  throw new Error(`never reached ${target.x},${target.z} (last ${me?.x},${me?.z})`);
}

async function main() {
  const a = await connect();
  const welcome = await wait(a, "welcome");
  if (welcome.milestone !== "M6") throw new Error("expected M6, got " + welcome.milestone);

  a.send(JSON.stringify({ type: "createRoom", name: "Looter" }));
  const joined = await wait(a, "roomJoined");

  if (!joined.lootNodes || joined.lootNodes.length !== LOOT_SPOTS.length) {
    throw new Error("lootNodes missing or wrong count: " + joined.lootNodes?.length);
  }
  if (!joined.storage) throw new Error("storage missing on roomJoined");
  console.log("PASS roomJoined loot/storage", joined.lootNodes.length);

  const seqRef = { n: 1 };
  const me0 = joined.players.find((p: { id: string }) => p.id === joined.playerId) ?? joined.players[0];

  // Pick nearest unsearched loot to spawn.
  let spot = joined.lootNodes[0];
  let best = Infinity;
  for (const n of joined.lootNodes) {
    const d = Math.hypot(n.x - me0.x, n.z - me0.z);
    if (d < best) {
      best = d;
      spot = n;
    }
  }
  console.log("targeting loot", spot.id, spot.label, "dist", best.toFixed(1));

  let snap = await walkTo(a, joined.playerId, spot, LOOT.interactRange * 0.9, seqRef);
  let me = snap.players.find((p: { id: string }) => p.id === joined.playerId);

  let looted = false;
  for (let i = 0; i < 80; i++) {
    sendInput(a, seqRef.n++, { interact: true, yaw: me.yaw });
    snap = await wait(a, "snapshot");
    me = snap.players.find((p: { id: string }) => p.id === joined.playerId);
    const node = snap.lootNodes.find((n: { id: string }) => n.id === spot.id);
    if (node?.searched) {
      looted = true;
      console.log("PASS search", spot.id, "carry", me.carryWeight, me.inventory);
      break;
    }
  }
  if (!looted) throw new Error("failed to search " + spot.id);

  snap = await walkTo(a, joined.playerId, STORAGE_POS, LOOT.storageRange * 0.9, seqRef);
  me = snap.players.find((p: { id: string }) => p.id === joined.playerId);

  if (bagTotal(me.inventory) > 0) {
    let deposited = false;
    for (let i = 0; i < 60; i++) {
      sendInput(a, seqRef.n++, { interact: true, yaw: me.yaw });
      snap = await wait(a, "snapshot");
      me = snap.players.find((p: { id: string }) => p.id === joined.playerId);
      if (bagTotal(snap.storage) > 0) {
        deposited = true;
        console.log("PASS deposit", snap.storage);
        break;
      }
    }
    if (!deposited) throw new Error("deposit failed");

    let withdrew = false;
    for (let i = 0; i < 60; i++) {
      sendInput(a, seqRef.n++, { withdraw: true, yaw: me.yaw });
      snap = await wait(a, "snapshot");
      me = snap.players.find((p: { id: string }) => p.id === joined.playerId);
      if (bagTotal(me.inventory) > 0) {
        withdrew = true;
        console.log("PASS withdraw", me.inventory);
        break;
      }
    }
    if (!withdrew) throw new Error("withdraw failed");
  } else {
    console.log("PASS loot rolled empty / nothing fit — skip deposit");
  }

  a.close();
  console.log("M6 smoke OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
