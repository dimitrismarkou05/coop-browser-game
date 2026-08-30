import { WebSocket } from "ws";

function once(ws: WebSocket, type: string) {
  return new Promise<any>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout " + type)), 3000);
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
a.send(JSON.stringify({ type: "createRoom", name: "Alpha" }));
const joinedA = await once(a, "roomJoined");
console.log("created", joinedA.code, "players", joinedA.players.length);

const b = new WebSocket("ws://localhost:2567");
await new Promise<void>((r, j) => {
  b.on("open", () => r());
  b.on("error", j);
});
await once(b, "welcome");
b.send(JSON.stringify({ type: "joinRoom", code: joinedA.code, name: "Bravo" }));
const joinedB = await once(b, "roomJoined");
console.log("joined B players", joinedB.players.map((p: { name: string }) => p.name).join(","));

a.send(JSON.stringify({ type: "input", seq: 1, forward: 1, strafe: 0, yaw: 0, pitch: 0 }));
const snap = await once(a, "snapshot");
console.log(
  "snapshot players",
  snap.players.length,
  snap.players.map((p: { name: string; x: number; z: number }) => ({
    name: p.name,
    x: p.x.toFixed(2),
    z: p.z.toFixed(2),
  })),
);
a.close();
b.close();
console.log("M3_OK");
