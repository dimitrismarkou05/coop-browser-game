import { WebSocket } from "ws";

function connect(): Promise<WebSocket> {
  return new Promise((res, rej) => {
    const ws = new WebSocket("ws://localhost:2567");
    ws.once("open", () => res(ws));
    ws.once("error", rej);
  });
}

function wait(ws: WebSocket, type: string): Promise<any> {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("t " + type)), 8000);
    const h = (d: WebSocket.RawData) => {
      const m = JSON.parse(String(d));
      if (m.type === type) {
        clearTimeout(t);
        ws.off("message", h);
        res(m);
      }
    };
    ws.on("message", h);
  });
}

function snap(ws: WebSocket) {
  return wait(ws, "snapshot");
}

function input(
  ws: WebSocket,
  seq: number,
  p: { f?: number; yaw?: number; shoot?: boolean; interact?: boolean },
) {
  ws.send(
    JSON.stringify({
      type: "input",
      seq,
      forward: p.f ?? 0,
      strafe: 0,
      yaw: p.yaw ?? 0,
      pitch: 0,
      shoot: !!p.shoot,
      melee: false,
      interact: !!p.interact,
    }),
  );
}

const aim = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.atan2(-(b.x - a.x), -(b.z - a.z));
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.hypot(a.x - b.x, a.z - b.z);

async function main() {
  const a = await connect();
  await wait(a, "welcome");
  a.send(JSON.stringify({ type: "createRoom", name: "A" }));
  const ja = await wait(a, "roomJoined");
  const b = await connect();
  await wait(b, "welcome");
  b.send(JSON.stringify({ type: "joinRoom", code: ja.code, name: "B" }));
  await wait(b, "roomJoined");
  const idA = ja.playerId;

  for (let i = 0; i < 30; i++) {
    input(a, i, { f: 1, yaw: Math.PI });
    input(b, i, { f: 1, yaw: Math.PI });
    await snap(a);
  }

  let downed = false;
  for (let i = 0; i < 250; i++) {
    const s = await snap(a);
    const self = s.players.find((p: any) => p.id === idA);
    if (self.downed) {
      downed = true;
      console.log("downed at", self.x.toFixed(1), self.z.toFixed(1));
      break;
    }
    if (!s.zombies.length) {
      input(a, 100 + i, {});
      continue;
    }
    let t = s.zombies[0];
    let td = 1e9;
    for (const z of s.zombies) {
      const d = dist(self, z);
      if (d < td) {
        td = d;
        t = z;
      }
    }
    input(a, 100 + i, { f: 1, yaw: aim(self, t) });
  }
  if (!downed) throw new Error("not downed");

  let minD = 1e9;
  let revived = false;
  for (let i = 0; i < 250; i++) {
    const s = await snap(b);
    const br = s.players.find((p: any) => p.name === "B");
    const al = s.players.find((p: any) => p.id === idA);
    if (!al.downed) {
      revived = true;
      console.log("REVIVED at iter", i, "hp", al.hp);
      break;
    }
    const d = dist(br, al);
    if (d < minD) minD = d;
    const yaw = aim(br, al);
    input(b, 400 + i, { f: d > 1.0 ? 1 : 0, yaw, interact: d < 2.5 });
    input(a, 500 + i, {});
    if (i % 25 === 0) {
      console.log(
        "i",
        i,
        "d",
        d.toFixed(2),
        "A",
        al.x.toFixed(1),
        al.z.toFixed(1),
        "B",
        br.x.toFixed(1),
        br.z.toFixed(1),
        "reviving",
        br.reviving,
      );
    }
  }
  console.log("minD", minD.toFixed(2), "revived", revived);
  a.close();
  b.close();
  if (!revived) process.exit(1);
}

main();
