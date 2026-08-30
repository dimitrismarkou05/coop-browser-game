import {
  DEFAULT_SERVER_PORT,
  parseServerMessage,
  type ClientMessage,
  type ServerMessage,
} from "@coop/shared";

type Handlers = {
  onStatus: (text: string, kind: "connecting" | "connected" | "disconnected") => void;
  onMessage: (msg: ServerMessage) => void;
};

export class ClientSocket {
  private ws: WebSocket | null = null;
  private disposed = false;

  constructor(private readonly handlers: Handlers) {
    this.connect();
  }

  send(message: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  dispose(): void {
    this.disposed = true;
    this.ws?.close();
    this.ws = null;
  }

  private connect(): void {
    if (this.disposed) return;
    const url = `ws://localhost:${DEFAULT_SERVER_PORT}`;
    this.handlers.onStatus("Connecting…", "connecting");
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.addEventListener("open", () => {
      this.handlers.onStatus("Connected", "connected");
      this.send({ type: "ping", clientTime: performance.now() });
    });

    ws.addEventListener("close", () => {
      this.handlers.onStatus("Disconnected — is the server running?", "disconnected");
      if (!this.disposed) {
        window.setTimeout(() => this.connect(), 1500);
      }
    });

    ws.addEventListener("error", () => {
      this.handlers.onStatus("Connection error", "disconnected");
    });

    ws.addEventListener("message", (event) => {
      let raw: unknown;
      try {
        raw = JSON.parse(String(event.data));
      } catch {
        return;
      }
      const msg = parseServerMessage(raw);
      if (msg) this.handlers.onMessage(msg);
    });
  }
}
