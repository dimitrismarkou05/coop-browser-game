import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import {
  DEFAULT_SERVER_PORT,
  MILESTONE,
  parseClientMessage,
  type ServerMessage,
} from "@coop/shared";
import { RoomManager } from "./room/RoomManager.js";

const port = Number(process.env.PORT) || DEFAULT_SERVER_PORT;
const rooms = new RoomManager();

function send(ws: import("ws").WebSocket, message: ServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, milestone: MILESTONE }));
});

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws) => {
  send(ws, {
    type: "welcome",
    milestone: MILESTONE,
    serverTime: Date.now(),
  });

  ws.on("message", (data) => {
    let raw: unknown;
    try {
      raw = JSON.parse(String(data));
    } catch {
      send(ws, { type: "error", message: "Invalid JSON" });
      return;
    }

    const msg = parseClientMessage(raw);
    if (!msg) {
      send(ws, { type: "error", message: "Unknown message" });
      return;
    }

    if (msg.type === "ping") {
      send(ws, {
        type: "pong",
        clientTime: msg.clientTime,
        serverTime: Date.now(),
      });
      return;
    }

    if (msg.type === "createRoom") {
      const result = rooms.create(ws, msg.name);
      if ("error" in result) {
        send(ws, { type: "error", message: result.error });
        return;
      }
      send(ws, {
        type: "roomJoined",
        code: result.room.code,
        playerId: result.player.id,
        players: result.room.snapshotPlayers(),
        zombies: result.room.snapshotZombies(),
        lootNodes: result.room.snapshotLootNodes(),
        storage: result.room.snapshotStorage(),
        base: result.room.snapshotBase(),
        invasion: result.room.snapshotInvasion(),
        pings: result.room.snapshotPings(),
      });
      return;
    }

    if (msg.type === "joinRoom") {
      const result = rooms.join(ws, msg.code, msg.name);
      if ("error" in result) {
        send(ws, { type: "error", message: result.error });
        return;
      }
      send(ws, {
        type: "roomJoined",
        code: result.room.code,
        playerId: result.player.id,
        players: result.room.snapshotPlayers(),
        zombies: result.room.snapshotZombies(),
        lootNodes: result.room.snapshotLootNodes(),
        storage: result.room.snapshotStorage(),
        base: result.room.snapshotBase(),
        invasion: result.room.snapshotInvasion(),
        pings: result.room.snapshotPings(),
      });
      return;
    }

    if (msg.type === "input") {
      rooms.handleInput(ws, msg);
      return;
    }

    if (msg.type === "openLoot") {
      rooms.handleOpenLoot(ws, msg.lootId);
      return;
    }

    if (msg.type === "invMove") {
      rooms.handleInvMove(ws, msg.from, msg.to);
      return;
    }

    if (msg.type === "invQuickMove") {
      rooms.handleInvQuickMove(ws, msg.from, msg.prefer, msg.containerLootId);
      return;
    }

    if (msg.type === "setReady") {
      rooms.handleSetReady(ws, msg.ready);
      return;
    }

    if (msg.type === "repairWall") {
      rooms.handleRepairWall(ws, msg.wallId);
      return;
    }

    if (msg.type === "toggleDoor") {
      rooms.handleToggleDoor(ws, msg.wallId);
      return;
    }

    if (msg.type === "upgradeBase") {
      rooms.handleUpgradeBase(ws, msg.component, msg.wallId);
      return;
    }

    if (msg.type === "craft") {
      rooms.handleCraft(ws, msg.recipe);
      return;
    }

    if (msg.type === "worldPing") {
      rooms.handleWorldPing(ws, msg.x, msg.y, msg.z);
      return;
    }

    if (msg.type === "devCommand") {
      rooms.handleDevCommand(ws, msg.line);
      return;
    }
  });

  ws.on("close", () => {
    rooms.disconnect(ws);
  });
});

httpServer.listen(port, () => {
  console.log(`[${MILESTONE}] server listening on http://localhost:${port}`);
  console.log(`[${MILESTONE}] websocket at ws://localhost:${port}`);
});
