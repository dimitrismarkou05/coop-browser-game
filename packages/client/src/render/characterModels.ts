import * as THREE from "three";

function mat(color: number, opts?: { rough?: number; metal?: number }): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts?.rough ?? 0.75,
    metalness: opts?.metal ?? 0.05,
  });
}

function box(
  w: number,
  h: number,
  d: number,
  color: number,
  x: number,
  y: number,
  z: number,
  opts?: { rough?: number; metal?: number },
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts));
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
  return mesh;
}

export type HumanoidParts = {
  root: THREE.Group;
  body: THREE.Group;
  /** Soft tint target (shirt / main mass). */
  shirtMats: THREE.MeshStandardMaterial[];
};

/** Low-poly humanoid: head, torso, hips, limbs.
 * Art faces +Z; body is yaw-offset so game forward (−Z / camera) matches. */
export function createHumanoid(shirtColor: number, skinColor = 0xc68642): HumanoidParts {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.rotation.y = Math.PI;
  root.add(body);

  const shirtMats: THREE.MeshStandardMaterial[] = [];

  const torso = box(0.42, 0.55, 0.24, shirtColor, 0, 1.15, 0);
  shirtMats.push(torso.material as THREE.MeshStandardMaterial);
  body.add(torso);

  const hips = box(0.4, 0.22, 0.22, 0x2c333b, 0, 0.78, 0);
  body.add(hips);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), mat(skinColor, { rough: 0.7 }));
  head.position.set(0, 1.58, 0);
  body.add(head);

  // Simple face (dark eyes)
  const eyeL = box(0.04, 0.04, 0.02, 0x1a1a1a, -0.06, 1.6, 0.15);
  const eyeR = box(0.04, 0.04, 0.02, 0x1a1a1a, 0.06, 1.6, 0.15);
  body.add(eyeL, eyeR);

  const armL = box(0.12, 0.48, 0.12, shirtColor, -0.3, 1.12, 0);
  const armR = box(0.12, 0.48, 0.12, shirtColor, 0.3, 1.12, 0);
  shirtMats.push(
    armL.material as THREE.MeshStandardMaterial,
    armR.material as THREE.MeshStandardMaterial,
  );
  body.add(armL, armR);

  const handL = box(0.1, 0.1, 0.1, skinColor, -0.3, 0.82, 0);
  const handR = box(0.1, 0.1, 0.1, skinColor, 0.3, 0.82, 0);
  body.add(handL, handR);

  const legL = box(0.14, 0.55, 0.14, 0x3d4450, -0.11, 0.4, 0);
  const legR = box(0.14, 0.55, 0.14, 0x3d4450, 0.11, 0.4, 0);
  body.add(legL, legR);

  const footL = box(0.14, 0.08, 0.22, 0x1f2328, -0.11, 0.08, 0.04);
  const footR = box(0.14, 0.08, 0.22, 0x1f2328, 0.11, 0.08, 0.04);
  body.add(footL, footR);

  return { root, body, shirtMats };
}

/** Ghoulish low-poly zombie — hunched, mottled green, longer arms. */
export function createZombieModel(baseColor: number): HumanoidParts {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.rotation.y = Math.PI;
  root.add(body);

  const shirtMats: THREE.MeshStandardMaterial[] = [];
  const flesh = 0x6d8f5c;
  const dark = 0x3a4a32;

  const torso = box(0.44, 0.5, 0.26, baseColor, 0, 1.05, 0.05);
  torso.rotation.x = 0.25;
  shirtMats.push(torso.material as THREE.MeshStandardMaterial);
  body.add(torso);

  const hips = box(0.4, 0.2, 0.22, dark, 0, 0.72, 0);
  body.add(hips);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.19, 9, 7),
    mat(flesh, { rough: 0.95 }),
  );
  head.position.set(0, 1.45, 0.12);
  head.scale.set(1, 0.9, 1.1);
  body.add(head);

  // Jaw / glow eyes
  const jaw = box(0.16, 0.06, 0.1, 0x4a5e3a, 0, 1.36, 0.22);
  body.add(jaw);
  const eyeL = box(0.05, 0.04, 0.02, 0xc4ff6a, -0.07, 1.48, 0.28);
  const eyeR = box(0.05, 0.04, 0.02, 0xc4ff6a, 0.07, 1.48, 0.28);
  body.add(eyeL, eyeR);

  const armL = box(0.11, 0.58, 0.11, flesh, -0.32, 0.95, 0.15);
  armL.rotation.x = -0.6;
  const armR = box(0.11, 0.58, 0.11, flesh, 0.32, 0.95, 0.15);
  armR.rotation.x = -0.45;
  body.add(armL, armR);

  const legL = box(0.13, 0.5, 0.13, dark, -0.12, 0.36, 0);
  const legR = box(0.13, 0.5, 0.13, 0x4a5538, 0.12, 0.36, 0.02);
  legR.rotation.z = 0.08;
  body.add(legL, legR);

  return { root, body, shirtMats };
}

export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      const m = o.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else (m as THREE.Material).dispose();
    }
  });
}
