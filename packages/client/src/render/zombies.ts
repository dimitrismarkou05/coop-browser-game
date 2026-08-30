import { ZOMBIE_DEFS, type ZombieSnapshot } from "@coop/shared";
import * as THREE from "three";

type ZombieVisual = {
  root: THREE.Group;
  body: THREE.Mesh;
  target: { x: number; y: number; z: number; yaw: number };
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
        visual.body.geometry.dispose();
        (visual.body.material as THREE.Material).dispose();
        this.visuals.delete(id);
      }
    }
  }

  update(dt: number): void {
    const t = 1 - Math.exp(-10 * dt);
    for (const visual of this.visuals.values()) {
      visual.root.position.x += (visual.target.x - visual.root.position.x) * t;
      visual.root.position.y += (visual.target.y - visual.root.position.y) * t;
      visual.root.position.z += (visual.target.z - visual.root.position.z) * t;
      visual.root.rotation.y = visual.target.yaw;
    }
  }

  private create(zombie: ZombieSnapshot): ZombieVisual {
    const def = ZOMBIE_DEFS[zombie.kind];
    const root = new THREE.Group();
    root.position.set(zombie.x, zombie.y, zombie.z);
    root.rotation.y = zombie.yaw;

    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(def.radius, Math.max(0.1, def.height - def.radius * 2), 3, 6),
      new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.9 }),
    );
    body.position.y = def.height / 2;
    root.add(body);

    // Simple head bump so they read as zombies, not players.
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(def.radius * 0.85, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x6d8f5c, roughness: 0.95 }),
    );
    head.position.y = def.height + def.radius * 0.15;
    root.add(head);

    return {
      root,
      body,
      target: { x: zombie.x, y: zombie.y, z: zombie.z, yaw: zombie.yaw },
    };
  }
}
