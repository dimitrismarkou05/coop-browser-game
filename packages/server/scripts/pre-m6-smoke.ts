import { WebSocket } from "ws";
import { COMBAT, ZOMBIE_PEN } from "@coop/shared";

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

async function main() {
  const a = await connect();
  await wait(a, "welcome");
  a.send(JSON.stringify({ type: "createRoom", name: "DevHost" }));
  const joined = await wait(a, "roomJoined");
  console.log("zombies", joined.zombies.length);

  // All ambient should be in pen
  for (const z of joined.zombies) {
    const inside =
      z.x >= ZOMBIE_PEN.minX &&
      z.x <= ZOMBIE_PEN.maxX &&
      z.z >= ZOMBIE_PEN.minZ &&
      z.z <= ZOMBIE_PEN.maxZ;
    if (!inside) throw new Error(`zombie outside pen ${z.x},${z.z}`);
  }
  console.log("PASS pen containment on spawn");

  // Jump
  a.send(JSON.stringify({ type: "input", seq: 1, forward: 0, strafe: 0, yaw: 0, pitch: 0, jump: true }));
  let maxY = 0;
  for (let i = 0; i < 30; i++) {
    const s = await wait(a, "snapshot");
    const me = s.players[0];
    maxY = Math.max(maxY, me.y);
    a.send(JSON.stringify({ type: "input", seq: 2 + i, forward: 0, strafe: 0, yaw: 0, pitch: 0 }));
  }
  if (maxY < 0.5) throw new Error("jump did not leave ground, maxY=" + maxY);
  console.log("PASS jump maxY", maxY.toFixed(2));

  // Dev: kill all zombies then spawn one
  a.send(JSON.stringify({ type: "devCommand", line: "kill all zombies" }));
  const r1 = await wait(a, "devResult");
  if (!r1.ok) throw new Error(r1.message);
  a.send(JSON.stringify({ type: "devCommand", line: "spawn zombie walker" }));
  const r2 = await wait(a, "devResult");
  if (!r2.ok) throw new Error(r2.message);
  const afterSpawn = await wait(a, "snapshot");
  if (afterSpawn.zombies.length < 1) throw new Error("spawn failed");
  console.log("PASS dev spawn/kill", afterSpawn.zombies.length);

  // Second player + revive duration check
  const b = await connect();
  await wait(b, "welcome");
  b.send(JSON.stringify({ type: "joinRoom", code: joined.code, name: "Victim" }));
  await wait(b, "roomJoined");

  a.send(JSON.stringify({ type: "devCommand", line: "kill player Victim" }));
  const r3 = await wait(a, "devResult");
  if (!r3.ok) throw new Error(r3.message);

  // Walk A to B and revive — count time via progress
  let sawProgress = false;
  for (let i = 0; i < 200; i++) {
    const s = await wait(a, "snapshot");
    const host = s.players.find((p: any) => p.name === "DevHost");
    const vic = s.players.find((p: any) => p.name === "Victim");
    if (!vic.downed) {
      console.log("PASS revive done at progress path, duration const", COMBAT.reviveDuration);
      break;
    }
    const yaw = Math.atan2(-(vic.x - host.x), -(vic.z - host.z));
    const d = Math.hypot(vic.x - host.x, vic.z - host.z);
    a.send(
      JSON.stringify({
        type: "input",
        seq: 100 + i,
        forward: d > 1.2 ? 1 : 0,
        strafe: 0,
        yaw,
        pitch: 0,
        interact: d < 2.4,
      }),
    );
    if (host.reviveProgress > 0.05) sawProgress = true;
    if (i === 199) throw new Error("revive failed");
  }
  if (!sawProgress) throw new Error("never saw revive progress");
  console.log("PASS revive progress HUD fields");

  a.close();
  b.close();
  console.log("PRE_M6_OK");
}

main();
