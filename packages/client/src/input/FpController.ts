import { PLAYER, applyPlayerMovement, clampPitch, type Aabb } from "@coop/shared";

export type FpState = {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
};

export class FpController {
  readonly state: FpState;
  private readonly keys = new Set<string>();
  private locked = false;
  private seq = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    spawn: { x: number; y: number; z: number; yaw?: number; pitch?: number },
  ) {
    this.state = {
      x: spawn.x,
      y: spawn.y,
      z: spawn.z,
      yaw: spawn.yaw ?? 0,
      pitch: spawn.pitch ?? 0,
    };

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    canvas.addEventListener("click", this.requestLock);
    document.addEventListener("pointerlockchange", this.onLockChange);
    document.addEventListener("mousemove", this.onMouseMove);
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.canvas.removeEventListener("click", this.requestLock);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    document.removeEventListener("mousemove", this.onMouseMove);
  }

  get isLocked(): boolean {
    return this.locked;
  }

  getAxes(): { forward: number; strafe: number } {
    let forward = 0;
    let strafe = 0;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) forward += 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) forward -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) strafe += 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) strafe -= 1;
    return { forward, strafe };
  }

  nextInputPacket(): {
    seq: number;
    forward: number;
    strafe: number;
    yaw: number;
    pitch: number;
  } {
    const axes = this.getAxes();
    this.seq += 1;
    return {
      seq: this.seq,
      forward: axes.forward,
      strafe: axes.strafe,
      yaw: this.state.yaw,
      pitch: this.state.pitch,
    };
  }

  /** Client-side prediction using the same movement rules as the server. */
  predict(dt: number, solids: readonly Aabb[]): void {
    const axes = this.getAxes();
    const moved = applyPlayerMovement(
      this.state.x,
      this.state.z,
      this.state.yaw,
      axes.forward,
      axes.strafe,
      dt,
      solids,
    );
    this.state.x = moved.x;
    this.state.z = moved.z;
  }

  reconcile(server: { x: number; y: number; z: number; yaw: number; pitch: number }): void {
    const dx = server.x - this.state.x;
    const dz = server.z - this.state.z;
    const distSq = dx * dx + dz * dz;
    if (distSq > 2.5 * 2.5) {
      this.state.x = server.x;
      this.state.z = server.z;
    } else if (distSq > 0.0001) {
      this.state.x += dx * 0.35;
      this.state.z += dz * 0.35;
    }
    this.state.y = server.y;
    // Keep local look — don't snap yaw/pitch from server (feels awful).
  }

  snapTo(server: { x: number; y: number; z: number; yaw: number; pitch: number }): void {
    this.state.x = server.x;
    this.state.y = server.y;
    this.state.z = server.z;
    this.state.yaw = server.yaw;
    this.state.pitch = clampPitch(server.pitch);
  }

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
      e.preventDefault();
    }
    this.keys.add(e.code);
  };

  private readonly onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private readonly requestLock = () => {
    if (document.pointerLockElement !== this.canvas) {
      void this.canvas.requestPointerLock();
    }
  };

  private readonly onLockChange = () => {
    this.locked = document.pointerLockElement === this.canvas;
  };

  private readonly onMouseMove = (e: MouseEvent) => {
    if (!this.locked) return;
    this.state.yaw -= e.movementX * PLAYER.mouseSensitivity;
    this.state.pitch = clampPitch(this.state.pitch - e.movementY * PLAYER.mouseSensitivity);
  };
}
