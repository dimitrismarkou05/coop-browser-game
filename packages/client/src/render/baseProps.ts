import {
  BASE,
  BASE_LAYOUT,
  WALL_IDS,
  type BaseSnapshot,
  type WallId,
} from "@coop/shared";
import * as THREE from "three";

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

type WallVisual = {
  left: THREE.Mesh;
  right: THREE.Mesh;
  door: THREE.Mesh;
  doorPivot: THREE.Group;
  horizontal: boolean;
};

/** Barricade walls (with player doors), core, workbench, generator. */
export class BaseProps {
  private readonly group = new THREE.Group();
  private readonly walls = new Map<WallId, WallVisual>();
  private readonly core: THREE.Mesh;
  private readonly workbench: THREE.Mesh;
  private readonly generator: THREE.Mesh;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);

    for (const id of WALL_IDS) {
      this.walls.set(id, this.buildWall(id));
    }

    const core = BASE_LAYOUT.core;
    this.core = new THREE.Mesh(
      new THREE.CylinderGeometry(core.radius * 0.55, core.radius * 0.7, 2.4, 10),
      new THREE.MeshStandardMaterial({
        color: 0x58a6ff,
        roughness: 0.35,
        metalness: 0.45,
        emissive: 0x0a2040,
        emissiveIntensity: 0.35,
      }),
    );
    this.core.position.set(core.x, 1.2, core.z);
    this.group.add(this.core);

    const wb = BASE_LAYOUT.workbench;
    this.workbench = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.95, 0.9),
      new THREE.MeshStandardMaterial({ color: 0x6e5638, roughness: 0.7, metalness: 0.15 }),
    );
    this.workbench.position.set(wb.x, 0.48, wb.z);
    this.group.add(this.workbench);
    const wbTop = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.1, 1.0),
      new THREE.MeshStandardMaterial({ color: 0x8b7348, roughness: 0.65 }),
    );
    wbTop.position.set(0, 0.52, 0);
    this.workbench.add(wbTop);

    const gen = BASE_LAYOUT.generator;
    this.generator = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 1.15, 0.95),
      new THREE.MeshStandardMaterial({ color: 0x3a4250, roughness: 0.55, metalness: 0.4 }),
    );
    this.generator.position.set(gen.x, 0.58, gen.z);
    this.group.add(this.generator);
    const vent = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.22, 0.35, 8),
      new THREE.MeshStandardMaterial({ color: 0xd29922, roughness: 0.5, metalness: 0.5 }),
    );
    vent.position.set(0, 0.75, 0);
    this.generator.add(vent);
  }

  private buildWall(id: WallId): WallVisual {
    const layout = BASE_LAYOUT.walls[id];
    const doorW = BASE.doorWidth;
    const horizontal = layout.sx >= layout.sz;
    const mat = () =>
      new THREE.MeshStandardMaterial({
        color: 0x3d9a5f,
        roughness: 0.8,
        metalness: 0.05,
      });
    const doorMat = new THREE.MeshStandardMaterial({
      color: 0x8b5a2b,
      roughness: 0.7,
      metalness: 0.1,
    });

    let left: THREE.Mesh;
    let right: THREE.Mesh;
    let door: THREE.Mesh;
    const doorPivot = new THREE.Group();

    if (horizontal) {
      const side = (layout.sx - doorW) / 2;
      left = new THREE.Mesh(new THREE.BoxGeometry(side, layout.sy, layout.sz), mat());
      right = new THREE.Mesh(new THREE.BoxGeometry(side, layout.sy, layout.sz), mat());
      left.position.set(layout.x - layout.sx / 2 + side / 2, layout.sy / 2, layout.z);
      right.position.set(layout.x + layout.sx / 2 - side / 2, layout.sy / 2, layout.z);

      door = new THREE.Mesh(new THREE.BoxGeometry(doorW, layout.sy * 0.92, layout.sz * 0.85), doorMat);
      // Hinge on west edge of door opening
      doorPivot.position.set(layout.x - doorW / 2, 0, layout.z);
      door.position.set(doorW / 2, layout.sy / 2, 0);
      doorPivot.add(door);
    } else {
      const side = (layout.sz - doorW) / 2;
      left = new THREE.Mesh(new THREE.BoxGeometry(layout.sx, layout.sy, side), mat());
      right = new THREE.Mesh(new THREE.BoxGeometry(layout.sx, layout.sy, side), mat());
      left.position.set(layout.x, layout.sy / 2, layout.z - layout.sz / 2 + side / 2);
      right.position.set(layout.x, layout.sy / 2, layout.z + layout.sz / 2 - side / 2);

      door = new THREE.Mesh(new THREE.BoxGeometry(layout.sx * 0.85, layout.sy * 0.92, doorW), doorMat);
      doorPivot.position.set(layout.x, 0, layout.z - doorW / 2);
      door.position.set(0, layout.sy / 2, doorW / 2);
      doorPivot.add(door);
    }

    this.group.add(left, right, doorPivot);
    return { left, right, door, doorPivot, horizontal };
  }

  sync(base: BaseSnapshot): void {
    for (const wall of base.walls) {
      const visual = this.walls.get(wall.id);
      if (!visual) continue;
      const broken = wall.broken || wall.hp <= 0;
      visual.left.visible = !broken;
      visual.right.visible = !broken;
      visual.doorPivot.visible = !broken;

      if (broken) continue;

      const ratio = wall.maxHp > 0 ? Math.max(0, Math.min(1, wall.hp / wall.maxHp)) : 0;
      const color = lerpColor(0xf85149, 0x3d9a5f, ratio);
      for (const mesh of [visual.left, visual.right]) {
        const m = mesh.material as THREE.MeshStandardMaterial;
        m.color.setHex(color);
        m.opacity = 0.55 + ratio * 0.45;
        m.transparent = m.opacity < 1;
      }
      const dm = visual.door.material as THREE.MeshStandardMaterial;
      dm.color.setHex(wall.doorOpen ? 0xa67c52 : 0x8b5a2b);

      // Swing open ~95° (outward-ish)
      const openAngle = visual.horizontal ? -Math.PI * 0.55 : Math.PI * 0.55;
      visual.doorPivot.rotation.y = wall.doorOpen ? openAngle : 0;
    }

    const coreRatio =
      base.coreMaxHp > 0 ? Math.max(0, Math.min(1, base.coreHp / base.coreMaxHp)) : 0;
    const coreMat = this.core.material as THREE.MeshStandardMaterial;
    coreMat.color.setHex(lerpColor(0xf85149, 0x58a6ff, coreRatio));
    coreMat.emissiveIntensity = 0.2 + coreRatio * 0.45;
    this.core.visible = base.coreHp > 0;
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const mat = obj.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    });
  }
}
