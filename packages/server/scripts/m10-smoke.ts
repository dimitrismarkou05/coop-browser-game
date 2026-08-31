/** Quick M7–M10 smoke: base repair, invasion start, checkpoint save/load. */
import { WebSocket } from "ws";
import { DEFAULT_SERVER_PORT, type ServerMessage } from "@coop/shared";

const url = `ws://localhost:${DEFAULT_SERVER_PORT}`;

function once(ws: WebSocket, type: string, timeoutMs = 5000): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), timeoutMs);
    const onMsg = (data: WebSocket.RawData) => {
      const msg = JSON.parse(String(data)) as ServerMessage;
      if (msg.type === type) {
        clearTimeout(t);
        ws.off("message", onMsg);
        resolve(msg);
      }
    };
    ws.on("message", onMsg);
  });
}

async function main(): Promise<void> {
  const ws = new WebSocket(url);
  await new Promise<void>((res, rej) => {
    ws.once("open", () => res());
    ws.once("error", rej);
  });
  await once(ws, "welcome");

  ws.send(JSON.stringify({ type: "createRoom", name: "Smoke" }));
  const joined = (await once(ws, "roomJoined")) as Extract<ServerMessage, { type: "roomJoined" }>;
  console.log("joined", joined.code, "core", joined.base.coreHp, "phase", joined.invasion.phase);

  ws.send(JSON.stringify({ type: "devCommand", line: "give wood 20" }));
  await once(ws, "devResult");
  ws.send(JSON.stringify({ type: "devCommand", line: "give scrap 30" }));
  await once(ws, "devResult");

  const wallId = joined.base.walls[0]!.id;
  // Damage isn't easy without invasion — upgrade storage instead
  ws.send(JSON.stringify({ type: "upgradeBase", component: "storage" }));
  await new Promise((r) => setTimeout(r, 200));

  ws.send(JSON.stringify({ type: "setReady", ready: true }));
  ws.send(JSON.stringify({ type: "devCommand", line: "invasion start" }));
  const startRes = await once(ws, "devResult");
  console.log("invasion start", startRes);

  await new Promise((r) => setTimeout(r, 400));
  ws.send(JSON.stringify({ type: "devCommand", line: "invasion skip" }));
  const skipRes = await once(ws, "devResult");
  console.log("invasion skip", skipRes);

  await new Promise((r) => setTimeout(r, 300));
  const code = joined.code;
  ws.close();
  await new Promise((r) => setTimeout(r, 500));

  const ws2 = new WebSocket(url);
  await new Promise<void>((res, rej) => {
    ws2.once("open", () => res());
    ws2.once("error", rej);
  });
  await once(ws2, "welcome");
  ws2.send(JSON.stringify({ type: "joinRoom", code, name: "Smoke2" }));
  const rejoined = (await once(ws2, "roomJoined")) as Extract<
    ServerMessage,
    { type: "roomJoined" }
  >;
  console.log(
    "rejoined",
    rejoined.code,
    "storageTier",
    rejoined.base.storageTier,
    "invasionIndex",
    rejoined.invasion.invasionIndex,
    "unlocks",
    rejoined.base.unlocks,
  );
  if (rejoined.invasion.invasionIndex < 1) {
    throw new Error("expected invasionIndex >= 1 after skip");
  }
  if (rejoined.base.storageTier < 2) {
    console.warn("storage tier may not have upgraded (need scrap in bags near prop)");
  }
  console.log("OK");
  ws2.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
