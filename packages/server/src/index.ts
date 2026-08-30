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
      });
      return;
    }

    if (msg.type === "input") {
      rooms.handleInput(ws, msg);
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
