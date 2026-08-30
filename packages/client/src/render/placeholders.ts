import {
  MAP,
  PLACEHOLDER_BUILDINGS,
  createBoundaryWalls,
  type Aabb,
} from "@coop/shared";
import * as THREE from "three";

function aabbToMesh(box: Aabb, color: number, opacity = 1): THREE.Mesh {
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  const d = box.maxZ - box.minZ;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({
      color,
      transparent: opacity < 1,
      opacity,
      roughness: 0.85,
      metalness: 0.05,
    }),
  );
  mesh.position.set(
    (box.minX + box.maxX) / 2,
    (box.minY + box.maxY) / 2,
    (box.minZ + box.maxZ) / 2,
  );
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

export function buildPlaceholderWorld(scene: THREE.Scene): void {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP.halfExtent * 2, MAP.halfExtent * 2),
    new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(MAP.halfExtent * 2, 40, 0x3d4654, 0x323944);
  grid.position.y = 0.01;
  scene.add(grid);

  for (const building of PLACEHOLDER_BUILDINGS) {
    const opacity = building.solid === false ? 0.85 : 1;
    scene.add(aabbToMesh(building.box, building.color, opacity));
  }

  for (const wall of createBoundaryWalls()) {
    scene.add(aabbToMesh(wall, 0x3a4250, 0.55));
  }

  const hemi = new THREE.HemisphereLight(0xb1c4d8, 0x3a3028, 0.7);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff2dd, 1.05);
  sun.position.set(20, 30, 10);
  scene.add(sun);
}
