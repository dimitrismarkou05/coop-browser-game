import { ZOMBIE_DEFS, zombieHitCapsule, type ZombieSnapshot } from "@coop/shared";
import * as THREE from "three";
import { createZombieModel, disposeObject3D } from "./characterModels";

/** TEMP: green wireframe cylinders matching server hitscan capsules. */
const DEBUG_HITBOXES = true;

type ZombieVisual = {
  root: THREE.Group;
  body: THREE.Group;
  hitbox: THREE.Mesh | null;
  target: { x: number; y: number; z: number; yaw: number };
  walkPhase: number;
  kind: ZombieSnapshot["kind"];
};

function makeHitboxWire(kind: ZombieSnapshot["kind"]): THREE.Mesh {
  const def = ZOMBIE_DEFS[kind];
  const hit = zombieHitCapsule(def);
  const height = Math.max(0.1, hit.maxY - hit.minY);
  const geo = new THREE.CylinderGeometry(hit.radius, hit.radius, height, 14, 1, true);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x39ff14,
    wireframe: true,
    transparent: true,
    opacity: 0.85,
    depthTest: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = hit.minY + height / 2;
  mesh.renderOrder = 10;
  return mesh;
}

export class ZombieRenderer {
  private readonly visuals = new Map<string, ZombieVisual>();

  constructor(private readonly scene: THREE.Scene) {}

  sync(zombies: ZombieSnapshot[]): void {
    const seen = new Set<string>();

    for (const zombie of zombies) {
      seen.add(zombie.id);
      let visual = this.visuals.get(zombie.id);
      if (!visual) {
        visual = this.create(zombie);
        this.visuals.set(zombie.id, visual);
        this.scene.add(visual.root);
      }
      visual.target.x = zombie.x;
      visual.target.y = zombie.y;
      visual.target.z = zombie.z;
      visual.target.yaw = zombie.yaw;
    }

    for (const [id, visual] of this.visuals) {
      if (!seen.has(id)) {
        this.scene.remove(visual.root);
        disposeObject3D(visual.root);
        this.visuals.delete(id);
      }
    }
  }

  update(dt: number): void {
    const t = 1 - Math.exp(-10 * dt);
    for (const visual of this.visuals.values()) {
      const dx = visual.target.x - visual.root.position.x;
      const dz = visual.target.z - visual.root.position.z;
      const moving = Math.hypot(dx, dz) > 0.015;
      visual.root.position.x += dx * t;
      visual.root.position.y += (visual.target.y - visual.root.position.y) * t;
      visual.root.position.z += dz * t;
      visual.root.rotation.y = visual.target.yaw;
      // Keep facing offset stable (model art faces +Z; game forward is −Z).
      visual.body.rotation.y = Math.PI;

      if (moving) {
        visual.walkPhase += dt * 7;
        visual.body.position.y = Math.abs(Math.sin(visual.walkPhase)) * 0.05;
        visual.body.rotation.z = Math.sin(visual.walkPhase) * 0.06;
        visual.body.rotation.x = 0.12 + Math.sin(visual.walkPhase * 0.5) * 0.04;
      } else {
        visual.body.position.y += (0 - visual.body.position.y) * 0.2;
        visual.body.rotation.z *= 0.85;
        visual.body.rotation.x += (0.12 - visual.body.rotation.x) * 0.15;
      }

      // Hitbox stays world-aligned (no yaw) so it matches the server capsule.
      if (visual.hitbox) {
        visual.hitbox.rotation.y = -visual.root.rotation.y;
      }
    }
  }

  private create(zombie: ZombieSnapshot): ZombieVisual {
    const def = ZOMBIE_DEFS[zombie.kind];
    const model = createZombieModel(def.color);
    // Mild type scale only — previously radius/0.35 blew models past the hitbox.
    const scale = zombie.kind === "bruiser" ? 1.15 : zombie.kind === "runner" ? 0.92 : 1;
    model.root.scale.setScalar(scale);
    model.root.position.set(zombie.x, zombie.y, zombie.z);
    model.root.rotation.y = zombie.yaw;

    const hitbox = DEBUG_HITBOXES ? makeHitboxWire(zombie.kind) : null;
    if (hitbox) {
      // Counter parent scale so wireframe matches world-space server radius/height.
      hitbox.scale.setScalar(1 / scale);
      model.root.add(hitbox);
    }

    return {
      root: model.root,
      body: model.body,
      hitbox,
      target: { x: zombie.x, y: zombie.y, z: zombie.z, yaw: zombie.yaw },
      walkPhase: Math.random() * Math.PI * 2,
      kind: zombie.kind,
    };
  }
}
