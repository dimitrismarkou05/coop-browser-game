import { ITEMS, type ItemId } from "@coop/shared";
import * as THREE from "three";

type ViewKind = ItemId | "fists" | "empty";

/**
 * Simple low-poly first-person viewmodel + muzzle flash.
 * Parent this group's `root` under the camera.
 */
export class Viewmodel {
  readonly root = new THREE.Group();
  private readonly hands: THREE.Group;
  private readonly muzzleLight: THREE.PointLight;
  private readonly muzzleFlash: THREE.Mesh;
  private current: ViewKind = "empty";
  private weaponGroup: THREE.Group | null = null;
  private kick = 0;
  private swing = 0;
  private muzzleT = 0;
  private bob = 0;

  constructor() {
    this.hands = new THREE.Group();
    this.hands.position.set(0.22, -0.28, -0.45);
    this.root.add(this.hands);

    const skin = new THREE.MeshStandardMaterial({ color: 0xc68642, roughness: 0.85 });
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.28), skin);
    arm.position.set(-0.06, 0.02, 0.12);
    this.hands.add(arm);
    const arm2 = arm.clone();
    arm2.position.set(0.1, 0.0, 0.06);
    this.hands.add(arm2);

    this.muzzleFlash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.18, 0.18),
      new THREE.MeshBasicMaterial({
        color: 0xffe08a,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.muzzleFlash.position.set(0.02, 0.06, -0.55);
    this.hands.add(this.muzzleFlash);

    this.muzzleLight = new THREE.PointLight(0xffcc66, 0, 4);
    this.muzzleLight.position.copy(this.muzzleFlash.position);
    this.hands.add(this.muzzleLight);

    this.setItem(null);
  }

  setItem(id: ItemId | null): void {
    const next: ViewKind = !id ? "empty" : ITEMS[id].kind === "resource" ? "empty" : id;
    if (next === this.current) return;
    this.current = next;
    if (this.weaponGroup) {
      this.hands.remove(this.weaponGroup);
      this.weaponGroup.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      this.weaponGroup = null;
    }
    this.weaponGroup = buildWeaponMesh(next);
    if (this.weaponGroup) this.hands.add(this.weaponGroup);
  }

  playShot(): void {
    if (this.current === "empty" || this.current === "fists") return;
    if (ITEMS[this.current as ItemId]?.kind !== "gun") return;
    this.kick = 1;
    this.muzzleT = 0.08;
  }

  playMelee(): void {
    this.swing = 1;
  }

  update(dt: number, moving: boolean): void {
    this.bob += dt * (moving ? 10 : 2);
    const bobX = Math.sin(this.bob) * (moving ? 0.012 : 0.004);
    const bobY = Math.abs(Math.cos(this.bob)) * (moving ? 0.01 : 0.003);

    if (this.kick > 0) this.kick = Math.max(0, this.kick - dt * 8);
    if (this.swing > 0) this.swing = Math.max(0, this.swing - dt * 5);
    if (this.muzzleT > 0) {
      this.muzzleT = Math.max(0, this.muzzleT - dt);
      const a = Math.min(1, this.muzzleT / 0.05);
      (this.muzzleFlash.material as THREE.MeshBasicMaterial).opacity = a;
      this.muzzleLight.intensity = a * 2.5;
      this.muzzleFlash.rotation.z = Math.random() * Math.PI;
      this.muzzleFlash.scale.setScalar(0.8 + Math.random() * 0.6);
    } else {
      (this.muzzleFlash.material as THREE.MeshBasicMaterial).opacity = 0;
      this.muzzleLight.intensity = 0;
    }

    const recoilZ = this.kick * 0.08;
    const recoilX = this.kick * 0.12;
    const swingY = Math.sin((1 - this.swing) * Math.PI) * this.swing * -1.1;
    const swingZ = Math.sin((1 - this.swing) * Math.PI) * this.swing * -0.4;

    this.hands.position.set(0.22 + bobX, -0.28 + bobY - recoilZ * 0.3, -0.45 + recoilZ);
    this.hands.rotation.set(recoilX + swingZ * 0.2, swingY, swingZ * 0.15);
  }

  setVisible(v: boolean): void {
    this.root.visible = v;
  }
}

function mat(color: number, metal = 0.35): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: metal });
}

function buildWeaponMesh(kind: ViewKind): THREE.Group | null {
  const g = new THREE.Group();
  g.position.set(0.02, 0.02, -0.05);

  if (kind === "empty" || kind === "fists") {
    return g;
  }

  const color = new THREE.Color(ITEMS[kind].color).getHex();

  if (kind === "pistol") {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.22), mat(color));
    body.position.set(0, 0.02, -0.1);
    g.add(body);
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.18), mat(0x3a3f46, 0.6));
    slide.position.set(0, 0.06, -0.12);
    g.add(slide);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.07), mat(0x2a2118, 0.1));
    grip.position.set(0, -0.06, 0.0);
    grip.rotation.x = 0.25;
    g.add(grip);
    return g;
  }

  if (kind === "smg") {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.32), mat(color));
    body.position.set(0, 0.03, -0.14);
    g.add(body);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.14, 6), mat(0x222));
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.04, -0.36);
    g.add(barrel);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.06), mat(0x333));
    mag.position.set(0, -0.08, -0.08);
    g.add(mag);
    return g;
  }

  if (kind === "ar") {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.4), mat(color));
    body.position.set(0, 0.03, -0.18);
    g.add(body);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.14), mat(0x3a3f46));
    stock.position.set(0, 0.02, 0.08);
    g.add(stock);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.22, 6), mat(0x222));
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.04, -0.46);
    g.add(barrel);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.12, 0.06), mat(0x2a2118, 0.1));
    grip.position.set(0, -0.07, -0.02);
    g.add(grip);
    return g;
  }

  if (kind === "knife") {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.018, 0.1, 6), mat(0x5c3a1e, 0.1));
    handle.rotation.x = Math.PI / 2;
    handle.position.set(0, 0, 0.02);
    g.add(handle);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.01, 0.22), mat(color, 0.7));
    blade.position.set(0, 0.01, -0.14);
    g.add(blade);
    return g;
  }

  if (kind === "sword") {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.018, 0.14, 6), mat(0x5c3a1e, 0.1));
    handle.rotation.x = Math.PI / 2;
    g.add(handle);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.03), mat(0xc4a35a, 0.5));
    guard.position.set(0, 0, -0.08);
    g.add(guard);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.42), mat(color, 0.75));
    blade.position.set(0, 0.01, -0.3);
    g.add(blade);
    return g;
  }

  if (kind === "axe") {
    const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.018, 0.36, 6), mat(0x5c3a1e, 0.1));
    haft.rotation.x = Math.PI / 2;
    haft.position.set(0, 0, -0.08);
    g.add(haft);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.1), mat(color, 0.55));
    head.position.set(0.04, 0.02, -0.24);
    g.add(head);
    return g;
  }

  return g;
}
