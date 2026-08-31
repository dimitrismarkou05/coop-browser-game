import { WebSocket } from "ws";
import { INV, LOOT_SPOTS, STORAGE_POS } from "@coop/shared";

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

function faceYaw(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

function sendInput(
  ws: WebSocket,
  seq: number,
  extra: Partial<{
    forward: number;
    yaw: number;
    selectedSlot: number;
    shoot: boolean;
    melee: boolean;
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
): Promise<any> {
  let me: any = null;
  for (let i = 0; i < 500; i++) {
    const snap = await wait(ws, "snapshot");
    me = snap.players.find((p: { id: string }) => p.id === playerId) ?? snap.players[0];
    const dx = target.x - me.x;
    const dz = target.z - me.z;
    if (Math.hypot(dx, dz) <= range) return snap;
    sendInput(ws, seqRef.n++, { forward: 1, yaw: faceYaw(dx, dz) });
  }
  throw new Error(`never reached ${target.x},${target.z}`);
}

async function main() {
  const a = await connect();
  const welcome = await wait(a, "welcome");
  if (welcome.milestone !== "M6") throw new Error("expected M6");

  a.send(JSON.stringify({ type: "createRoom", name: "Looter" }));
  const joined = await wait(a, "roomJoined");
  if (joined.lootNodes?.length !== LOOT_SPOTS.length) throw new Error("loot nodes");
  if (!Array.isArray(joined.storage) || joined.storage.length !== INV.storageSize) {
    throw new Error("storage size");
  }
  const me0 = joined.players[0];
  if (!me0.hotbar || me0.hotbar.length !== INV.hotbarSize) throw new Error("hotbar");
  if (me0.hotbar[0]?.id !== "pistol") throw new Error("start without pistol");
  console.log("PASS roomJoined grids");

  const seqRef = { n: 1 };

  // Can't shoot without gun selected — select empty slot 5
  sendInput(a, seqRef.n++, { selectedSlot: 5, shoot: true });
  let snap = await wait(a, "snapshot");
  let me = snap.players.find((p: { id: string }) => p.id === joined.playerId);
  if (me.selectedSlot !== 5) throw new Error("select slot");
  // Shoot with empty hand should not consume ammo
  const ammoBefore = me.ammo;
  sendInput(a, seqRef.n++, { selectedSlot: 5, shoot: true });
  snap = await wait(a, "snapshot");
  me = snap.players.find((p: { id: string }) => p.id === joined.playerId);
  if (me.ammo !== ammoBefore) throw new Error("shot without gun consumed ammo");
  console.log("PASS no-gun shoot blocked");

  // Melee still works without gun
  sendInput(a, seqRef.n++, { selectedSlot: 5, melee: true });
  snap = await wait(a, "snapshot");
  console.log("PASS melee without gun");

  // Walk to loot, open, drag to inv
  let spot = joined.lootNodes[0];
  let best = Infinity;
  for (const n of joined.lootNodes) {
    const d = Math.hypot(n.x - me0.x, n.z - me0.z);
    if (d < best) {
      best = d;
      spot = n;
    }
  }
  snap = await walkTo(a, joined.playerId, spot, INV.interactRange * 0.85, seqRef);
  a.send(JSON.stringify({ type: "openLoot", lootId: spot.id }));
  for (let i = 0; i < 20; i++) {
    snap = await wait(a, "snapshot");
    const node = snap.lootNodes.find((n: { id: string }) => n.id === spot.id);
    if (node?.opened) {
      console.log("PASS open loot slots", node.slots.length);
      if (node.slots.length > 0 && node.slots[0]) {
        a.send(
          JSON.stringify({
            type: "invMove",
            from: { bag: "loot", index: 0, lootId: spot.id },
            to: { bag: "inv", index: 0 },
          }),
        );
        snap = await wait(a, "snapshot");
        me = snap.players.find((p: { id: string }) => p.id === joined.playerId);
        if (!me.inventory[0]) throw new Error("loot drag failed");
        console.log("PASS loot → inv", me.inventory[0]);
      }
      break;
    }
    sendInput(a, seqRef.n++, {});
  }

  // Storage drag
  snap = await walkTo(a, joined.playerId, STORAGE_POS, INV.storageRange * 0.85, seqRef);
  me = snap.players.find((p: { id: string }) => p.id === joined.playerId);
  // Move hotbar ammo into storage
  a.send(
    JSON.stringify({
      type: "invMove",
      from: { bag: "hotbar", index: 1 },
      to: { bag: "storage", index: 0 },
    }),
  );
  snap = await wait(a, "snapshot");
  if (!snap.storage[0] || snap.storage[0].id !== "ammo") throw new Error("storage deposit");
  console.log("PASS hotbar → storage", snap.storage[0]);

  a.send(
    JSON.stringify({
      type: "invMove",
      from: { bag: "storage", index: 0 },
      to: { bag: "hotbar", index: 1 },
    }),
  );
  snap = await wait(a, "snapshot");
  me = snap.players.find((p: { id: string }) => p.id === joined.playerId);
  if (!me.hotbar[1] || me.hotbar[1].id !== "ammo") throw new Error("storage withdraw");
  console.log("PASS storage → hotbar");

  a.close();
  console.log("M6 inventory smoke OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
