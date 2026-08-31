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

type RejoinSession = { code: string; name: string };

export class ClientSocket {
  private ws: WebSocket | null = null;
  private disposed = false;
  private hadConnection = false;
  private pendingRejoin: RejoinSession | null = null;

  constructor(private readonly handlers: Handlers) {
    this.connect();
  }

  send(message: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /** Remember room credentials so a reconnect can auto-joinRoom. */
  setRejoin(session: RejoinSession | null): void {
    this.pendingRejoin = session;
  }

  dispose(): void {
    this.disposed = true;
    this.ws?.close();
    this.ws = null;
  }

  private connect(): void {
    if (this.disposed) return;
    const fromEnv = import.meta.env.VITE_WS_URL as string | undefined;
    const url =
      fromEnv && fromEnv.length > 0
        ? fromEnv
        : `ws://localhost:${DEFAULT_SERVER_PORT}`;
    this.handlers.onStatus("Connecting…", "connecting");
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.addEventListener("open", () => {
      this.handlers.onStatus("Connected", "connected");
      this.send({ type: "ping", clientTime: performance.now() });
      if (this.hadConnection && this.pendingRejoin) {
        this.send({
          type: "joinRoom",
          code: this.pendingRejoin.code,
          name: this.pendingRejoin.name,
        });
      }
      this.hadConnection = true;
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
