import {
  PLAYER,
  applyPlayerMovement,
  applyVerticalMovement,
  clampPitch,
  type Aabb,
} from "@coop/shared";

export type FpState = {
  x: number;
  y: number;
  z: number;
  vy: number;
  grounded: boolean;
  yaw: number;
  pitch: number;
};

export class FpController {
  readonly state: FpState;
  private readonly keys = new Set<string>();
  private locked = false;
  private seq = 0;
  private shootEdge = false;
  private meleeEdge = false;
  private jumpEdge = false;
  private interactEdge = false;
  private downed = false;
  private blocked = false;
  private selectedSlot = 0;
  private slotEdge: number | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    spawn: { x: number; y: number; z: number; yaw?: number; pitch?: number },
  ) {
    this.state = {
      x: spawn.x,
      y: spawn.y,
      z: spawn.z,
      vy: 0,
      grounded: true,
      yaw: spawn.yaw ?? 0,
      pitch: spawn.pitch ?? 0,
    };

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    canvas.addEventListener("click", this.requestLock);
    canvas.addEventListener("mousedown", this.onMouseDown);
    document.addEventListener("pointerlockchange", this.onLockChange);
    document.addEventListener("mousemove", this.onMouseMove);
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.canvas.removeEventListener("click", this.requestLock);
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    document.removeEventListener("mousemove", this.onMouseMove);
  }

  get isLocked(): boolean {
    return this.locked;
  }

  setDowned(downed: boolean): void {
    this.downed = downed;
  }

  setBlocked(blocked: boolean): void {
    this.blocked = blocked;
    if (blocked) this.keys.clear();
  }

  setSelectedSlot(n: number): void {
    this.selectedSlot = n;
  }

  getSelectedSlot(): number {
    return this.selectedSlot;
  }

  /** Consume one-frame E press for inventory open/close. */
  consumeInteractEdge(): boolean {
    const v = this.interactEdge;
    this.interactEdge = false;
    return v;
  }

  getAxes(): { forward: number; strafe: number } {
    if (this.downed || this.blocked) return { forward: 0, strafe: 0 };
    let forward = 0;
    let strafe = 0;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) forward += 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) forward -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) strafe += 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) strafe -= 1;
    return { forward, strafe };
  }

  isInteractHeld(): boolean {
    return !this.blocked && this.keys.has("KeyE");
  }

  nextInputPacket(): {
    seq: number;
    forward: number;
    strafe: number;
    yaw: number;
    pitch: number;
    shoot: boolean;
    melee: boolean;
    interact: boolean;
    jump: boolean;
    selectedSlot: number;
  } {
    const axes = this.getAxes();
    const shoot = this.shootEdge;
    const melee = this.meleeEdge;
    const jump = this.jumpEdge;
    this.shootEdge = false;
    this.meleeEdge = false;
    this.jumpEdge = false;
    if (this.slotEdge !== null) {
      this.selectedSlot = this.slotEdge;
      this.slotEdge = null;
    }
    this.seq += 1;
    return {
      seq: this.seq,
      forward: axes.forward,
      strafe: axes.strafe,
      yaw: this.state.yaw,
      pitch: this.state.pitch,
      shoot,
      melee,
      interact: this.isInteractHeld(),
      jump,
      selectedSlot: this.selectedSlot,
    };
  }

  predict(dt: number, solids: readonly Aabb[]): void {
    if (this.downed || this.blocked) return;
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

    const wantJump = this.jumpEdge;
    const vert = applyVerticalMovement(
      this.state.y,
      this.state.vy,
      wantJump,
      dt,
      this.state.grounded,
    );
    this.state.y = vert.y;
    this.state.vy = vert.vy;
    this.state.grounded = vert.grounded;
  }

  reconcile(server: { x: number; y: number; z: number }): void {
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
    const dy = server.y - this.state.y;
    if (Math.abs(dy) > 1.5) {
      this.state.y = server.y;
      this.state.vy = 0;
    } else {
      this.state.y += dy * 0.4;
    }
  }

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (this.blocked && e.code !== "KeyE") return;
    if (
      [
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "KeyE",
        "KeyF",
        "Space",
        "Digit1",
        "Digit2",
        "Digit3",
        "Digit4",
        "Digit5",
        "Digit6",
      ].includes(e.code)
    ) {
      e.preventDefault();
    }
    if (e.code === "KeyE" && !e.repeat) {
      this.interactEdge = true;
    }
    if (this.blocked) return;
    if (e.code === "KeyF" && !e.repeat && !this.downed) {
      this.meleeEdge = true;
    }
    if (e.code === "Space" && !e.repeat && !this.downed) {
      this.jumpEdge = true;
    }
    const digit = e.code.match(/^Digit([1-6])$/);
    if (digit && !e.repeat) {
      this.slotEdge = Number(digit[1]) - 1;
    }
    this.keys.add(e.code);
  };

  private readonly onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private readonly onMouseDown = (e: MouseEvent) => {
    if (!this.locked || this.downed || this.blocked) return;
    if (e.button === 0) {
      this.shootEdge = true;
    }
  };

  private readonly requestLock = () => {
    if (this.blocked) return;
    if (document.pointerLockElement !== this.canvas) {
      void this.canvas.requestPointerLock();
    }
  };

  private readonly onLockChange = () => {
    this.locked = document.pointerLockElement === this.canvas;
  };

  private readonly onMouseMove = (e: MouseEvent) => {
    if (!this.locked || this.blocked) return;
    this.state.yaw -= e.movementX * PLAYER.mouseSensitivity;
    this.state.pitch = clampPitch(this.state.pitch - e.movementY * PLAYER.mouseSensitivity);
  };
}
