import { STORAGE_POS, type LootNodeSnapshot } from "@coop/shared";
import * as THREE from "three";

export class LootNodeRenderer {
  private readonly group = new THREE.Group();
  private readonly byId = new Map<string, THREE.Mesh>();
  private readonly storageMesh: THREE.Mesh;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);

    this.storageMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 1.0, 0.85),
      new THREE.MeshStandardMaterial({ color: 0xc4a35a, roughness: 0.55, metalness: 0.2 }),
    );
    this.storageMesh.position.set(STORAGE_POS.x, 0.5, STORAGE_POS.z);
    this.group.add(this.storageMesh);

    const lid = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, 0.12, 0.9),
      new THREE.MeshStandardMaterial({ color: 0x8a7340, roughness: 0.6 }),
    );
    lid.position.set(0, 0.56, 0);
    this.storageMesh.add(lid);
  }

  sync(nodes: LootNodeSnapshot[]): void {
    const seen = new Set<string>();
    for (const node of nodes) {
      seen.add(node.id);
      let mesh = this.byId.get(node.id);
      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.45, 0.55, 0.7, 8),
          new THREE.MeshStandardMaterial({ color: 0x5a8f6a, roughness: 0.75 }),
        );
        mesh.position.set(node.x, 0.35, node.z);
        this.group.add(mesh);
        this.byId.set(node.id, mesh);
      }
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (node.searched) {
        mat.color.setHex(0x3a3f46);
        mat.opacity = 0.45;
        mat.transparent = true;
        mesh.scale.set(1, 0.55, 1);
      } else {
        mat.color.setHex(0x5a8f6a);
        mat.opacity = 1;
        mat.transparent = false;
        mesh.scale.set(1, 1, 1);
      }
    }

    for (const [id, mesh] of this.byId) {
      if (seen.has(id)) continue;
      this.group.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      this.byId.delete(id);
    }
  }
}
