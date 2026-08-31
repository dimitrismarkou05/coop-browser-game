/** Default WebSocket port for local development. */
export const DEFAULT_SERVER_PORT = 2567;

/** Milestone tag — bump as milestones complete. */
export const MILESTONE = "M6" as const;

export const TICK_HZ = 15;
export const TICK_MS = 1000 / TICK_HZ;
export const MAX_PLAYERS_PER_ROOM = 4;

/** Player locomotion / capsule (shared so client prediction matches server). */
export const PLAYER = {
  moveSpeed: 5.5,
  eyeHeight: 1.6,
  radius: 0.35,
  height: 1.8,
  mouseSensitivity: 0.0022,
  pitchMin: -1.4,
  pitchMax: 1.4,
  maxHp: 100,
  /** Seconds of invulnerability after a hit / respawn. */
  hurtIFrames: 0.55,
  respawnIFrames: 2,
  jumpSpeed: 7.2,
  gravity: 22,
  /** Multiplier applied to moveSpeed while sprinting (Shift). */
  sprintMul: 1.65,
} as const;

/** Placeholder map bounds (world units). */
export const MAP = {
  halfExtent: 40,
} as const;

export const PLAYER_COLORS = [0x3d9a5f, 0xd97706, 0x3b82f6, 0xc084fc] as const;

