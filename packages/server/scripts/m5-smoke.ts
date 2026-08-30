import { WebSocket } from "ws";

function once(ws: WebSocket, type: string) {
  return new Promise<any>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout " + type)), 10000);
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
a.send(JSON.stringify({ type: "createRoom", name: "Shooter" }));
const joined = await once(a, "roomJoined");
console.log("ammo", joined.players[0].ammo, "zombies", joined.zombies.length);

const snap = await once(a, "snapshot");
const me = snap.players.find((p: any) => p.id === snap.you);
let nearest = snap.zombies[0];
let best = Infinity;
for (const z of snap.zombies) {
  const d = Math.hypot(z.x - me.x, z.z - me.z);
  if (d < best) {
    best = d;
    nearest = z;
  }
}

let kills = 0;
let shots = 0;
for (let i = 0; i < 80; i++) {
  const s0 = await once(a, "snapshot");
  const self = s0.players.find((p: any) => p.id === s0.you);
  // Retarget each few ticks
  let target = nearest;
  let td = Infinity;
  for (const z of s0.zombies) {
    const d = Math.hypot(z.x - self.x, z.z - self.z);
    if (d < td) {
      td = d;
      target = z;
    }
  }
  const yaw = Math.atan2(-(target.x - self.x), -(target.z - self.z));
  const pitch = -0.05;
  a.send(
    JSON.stringify({
      type: "input",
      seq: i + 1,
      forward: td > 1.5 ? 1 : 0,
      strafe: 0,
      yaw,
      pitch,
      shoot: true,
      melee: td < 1.8,
      interact: false,
    }),
  );
  shots += 1;
  const s = await once(a, "snapshot");
  if (s.events) {
    for (const ev of s.events) {
      if (ev.kind === "kill") kills += 1;
    }
  }
  if (kills > 0 && s.players[0].ammo < joined.players[0].ammo) break;
}

console.log("kills", kills, "shots fired attempts", shots);
a.close();
if (kills < 1) throw new Error("expected at least one zombie kill");
console.log("M5_OK");
