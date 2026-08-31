import type { WorldPingSnapshot } from "@coop/shared";
import * as THREE from "three";

const PING_TTL_REF = 8;

type PingVisual = {
  root: THREE.Group;
  stem: THREE.Mesh;
  tip: THREE.Mesh;
};

/** Floating world-ping markers that fade out with TTL. */
export class WorldPings {
  private readonly group = new THREE.Group();
  private readonly byId = new Map<string, PingVisual>();

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  sync(pings: WorldPingSnapshot[]): void {
    const seen = new Set<string>();
    for (const ping of pings) {
      seen.add(ping.id);
      let visual = this.byId.get(ping.id);
      if (!visual) {
        visual = this.createMarker(ping.color);
        this.group.add(visual.root);
        this.byId.set(ping.id, visual);
      }
      visual.root.position.set(ping.x, ping.y + 0.35, ping.z);
      const fade = Math.max(0, Math.min(1, ping.ttl / PING_TTL_REF));
      const opacity = 0.25 + fade * 0.75;
      for (const mesh of [visual.stem, visual.tip]) {
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = opacity;
        mat.color.setHex(ping.color);
      }
      visual.root.visible = ping.ttl > 0;
      // Gentle bob so markers read as living UI.
      visual.root.position.y = ping.y + 0.35 + Math.sin(performance.now() * 0.004 + ping.x) * 0.08;
    }

    for (const [id, visual] of this.byId) {
      if (seen.has(id)) continue;
      this.group.remove(visual.root);
      this.disposeVisual(visual);
      this.byId.delete(id);
    }
  }

  dispose(): void {
    for (const visual of this.byId.values()) {
      this.group.remove(visual.root);
      this.disposeVisual(visual);
    }
    this.byId.clear();
    this.group.parent?.remove(this.group);
  }

  private createMarker(color: number): PingVisual {
    const root = new THREE.Group();
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.12, 1.1, 8),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1,
        depthWrite: false,
      }),
    );
    stem.position.y = 0.55;
    root.add(stem);

    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.45, 8),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1,
        depthWrite: false,
      }),
    );
    tip.position.y = 1.3;
    tip.rotation.x = Math.PI;
    root.add(tip);

    return { root, stem, tip };
  }

  private disposeVisual(visual: PingVisual): void {
    for (const mesh of [visual.stem, visual.tip]) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  }
}
