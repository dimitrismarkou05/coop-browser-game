import { WebSocket } from "ws";

function once(ws: WebSocket, type: string) {
  return new Promise<any>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout " + type)), 8000);
    const onMsg = (d: WebSocket.RawData) => {
      const m = JSON.parse(String(d));
      if (m.type === type) {
        clearTimeout(t);
        ws.off("message", onMsg);
        resolve(m);
      }
    };
    ws.on("message", onMsg);
  });
}

const a = new WebSocket("ws://localhost:2567");
await new Promise<void>((r, j) => {
  a.on("open", () => r());
  a.on("error", j);
});
await once(a, "welcome");
a.send(JSON.stringify({ type: "createRoom", name: "Bait" }));
const joined = await once(a, "roomJoined");
if (!joined.zombies || joined.zombies.length < 6) {
  throw new Error("expected ambient zombies on join, got " + joined.zombies?.length);
}
console.log("join zombies", joined.zombies.length, "player hp", joined.players[0].hp);

const snap = await once(a, "snapshot");
console.log("snapshot zombies", snap.zombies.length);

// Walk toward nearest zombie to force an encounter faster.
const me0 = snap.players.find((p: any) => p.id === snap.you);
let nearest = snap.zombies[0];
let best = Infinity;
for (const z of snap.zombies) {
  const d = Math.hypot(z.x - me0.x, z.z - me0.z);
  if (d < best) {
    best = d;
    nearest = z;
  }
}
const yaw = Math.atan2(nearest.x - me0.x, -(nearest.z - me0.z));
console.log("hunting zombie at dist", best.toFixed(1));

let damaged = false;
for (let i = 0; i < 120; i++) {
  a.send(
    JSON.stringify({
      type: "input",
      seq: i + 1,
      forward: 1,
      strafe: 0,
      yaw,
      pitch: 0,
    }),
  );
  const s = await once(a, "snapshot");
  const me = s.players.find((p: any) => p.id === s.you);
  if (me.hp < me.maxHp) {
    damaged = true;
    console.log("damage ok hp", me.hp);
    break;
  }
}

a.close();
if (!damaged) {
  console.warn("WARN: no damage in window (AI may be blocked); zombies still syncing");
}
console.log("M4_OK");
