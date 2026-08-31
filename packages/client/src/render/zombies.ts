import { ZOMBIE_DEFS, type ZombieSnapshot } from "@coop/shared";
import * as THREE from "three";
import { createZombieModel, disposeObject3D } from "./characterModels";

type ZombieVisual = {
  root: THREE.Group;
  body: THREE.Group;
  target: { x: number; y: number; z: number; yaw: number };
  walkPhase: number;
};

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

      if (moving) {
        visual.walkPhase += dt * 7;
        visual.body.position.y = Math.abs(Math.sin(visual.walkPhase)) * 0.05;
        visual.body.rotation.z = Math.sin(visual.walkPhase) * 0.06;
        visual.body.rotation.x = 0.12 + Math.sin(visual.walkPhase * 0.5) * 0.04;
      }
    }
  }

  private create(zombie: ZombieSnapshot): ZombieVisual {
    const def = ZOMBIE_DEFS[zombie.kind];
    const model = createZombieModel(def.color);
    // Scale slightly by type radius so bruisers read bigger.
    const scale = Math.max(0.85, def.radius / 0.35);
    model.root.scale.setScalar(scale);
    model.root.position.set(zombie.x, zombie.y, zombie.z);
    model.root.rotation.y = zombie.yaw;

    return {
      root: model.root,
      body: model.body,
      target: { x: zombie.x, y: zombie.y, z: zombie.z, yaw: zombie.yaw },
      walkPhase: Math.random() * Math.PI * 2,
    };
  }
}
