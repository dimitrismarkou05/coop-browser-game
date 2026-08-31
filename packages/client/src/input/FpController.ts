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

const MOVE_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

export class FpController {
  readonly state: FpState;
  private readonly keys = new Set<string>();
  private locked = false;
  private seq = 0;
  private useEdge = false;
  private jumpEdge = false;
  private interactEdge = false;
  private pingEdge = false;
  private downed = false;
  private blocked = false;
  private selectedSlot = 0;
  private slotEdge: number | null = null;
  /** Send an input packet ASAP (e.g. on key release so server stops). */
  private forceInput = false;

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
    window.addEventListener("blur", this.onBlur);
    canvas.addEventListener("click", this.requestLock);
    canvas.addEventListener("mousedown", this.onMouseDown);
    canvas.addEventListener("auxclick", this.onAuxClick);
    document.addEventListener("pointerlockchange", this.onLockChange);
    document.addEventListener("mousemove", this.onMouseMove);
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.canvas.removeEventListener("click", this.requestLock);
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    this.canvas.removeEventListener("auxclick", this.onAuxClick);
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
    if (blocked) {
      this.keys.clear();
      this.forceInput = true;
    }
  }

  setSelectedSlot(n: number): void {
    this.selectedSlot = n;
  }

  getSelectedSlot(): number {
    return this.selectedSlot;
  }

  isSprinting(): boolean {
    return (
      !this.blocked &&
      !this.downed &&
      (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight"))
    );
  }

  /** True if any move key is held. */
  isMoving(): boolean {
    const a = this.getAxes();
    return a.forward !== 0 || a.strafe !== 0;
  }

  /** Consume request to send input immediately (stop / menu). */
  consumeForceInput(): boolean {
    const v = this.forceInput;
    this.forceInput = false;
    return v;
  }

  /** Consume one-frame E press for interactions. */
  consumeInteractEdge(): boolean {
    const v = this.interactEdge;
    this.interactEdge = false;
    return v;
  }

  /** Consume middle-mouse ping request. */
  consumePingEdge(): boolean {
    const v = this.pingEdge;
    this.pingEdge = false;
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
    sprint: boolean;
  } {
    const axes = this.getAxes();
    const shoot = this.useEdge;
    const jump = this.jumpEdge;
    this.useEdge = false;
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
      melee: false,
      interact: this.isInteractHeld(),
      jump,
      selectedSlot: this.selectedSlot,
      sprint: this.isSprinting(),
    };
  }

  predict(dt: number, solids: readonly Aabb[]): void {
    if (this.downed || this.blocked) return;
    const axes = this.getAxes();
    // No residual motion when keys are up.
    if (axes.forward === 0 && axes.strafe === 0) {
      const vert = applyVerticalMovement(
        this.state.y,
        this.state.vy,
        false,
        dt,
        this.state.grounded,
      );
      this.state.y = vert.y;
      this.state.vy = vert.vy;
      this.state.grounded = vert.grounded;
      return;
    }

    const speed = PLAYER.moveSpeed * (this.isSprinting() ? PLAYER.sprintMul : 1);
    const moved = applyPlayerMovement(
      this.state.x,
      this.state.z,
      this.state.yaw,
      axes.forward,
      axes.strafe,
      dt,
      solids,
      PLAYER.radius,
      speed,
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

  /**
   * Local player is visual-authority for movement.
   * Only snap for huge errors (teleport / soft-stuck) — never micro-correct,
   * or holding W/A/D rubberbands you back toward the lagged server pos.
   */
  reconcile(server: { x: number; y: number; z: number }, _localMoving?: boolean): void {
    const dx = server.x - this.state.x;
    const dz = server.z - this.state.z;
    const dist = Math.hypot(dx, dz);
    const dy = server.y - this.state.y;

    if (dist > 5) {
      this.state.x = server.x;
      this.state.z = server.z;
    }
    if (Math.abs(dy) > 3) {
      this.state.y = server.y;
      this.state.vy = 0;
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
        "Space",
        "ShiftLeft",
        "ShiftRight",
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
    if (MOVE_KEYS.has(e.code) || e.code === "ShiftLeft" || e.code === "ShiftRight") {
      this.forceInput = true;
    }
  };

  private readonly onBlur = () => {
    this.keys.clear();
    this.forceInput = true;
  };

  private readonly onMouseDown = (e: MouseEvent) => {
    if (!this.locked || this.downed || this.blocked) return;
    if (e.button === 0) {
      this.useEdge = true;
    }
    if (e.button === 1) {
      e.preventDefault();
      this.pingEdge = true;
    }
  };

  private readonly onAuxClick = (e: MouseEvent) => {
    if (e.button === 1) e.preventDefault();
  };

  private readonly requestLock = () => {
    if (this.blocked) return;
    if (document.pointerLockElement !== this.canvas) {
      void this.canvas.requestPointerLock();
    }
  };

  private readonly onLockChange = () => {
    this.locked = document.pointerLockElement === this.canvas;
    if (!this.locked) {
      this.keys.clear();
      this.forceInput = true;
    }
  };

  private readonly onMouseMove = (e: MouseEvent) => {
    if (!this.locked || this.blocked) return;
    this.state.yaw -= e.movementX * PLAYER.mouseSensitivity;
    this.state.pitch = clampPitch(this.state.pitch - e.movementY * PLAYER.mouseSensitivity);
  };
}
