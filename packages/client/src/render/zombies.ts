import { ZOMBIE_DEFS, type ZombieSnapshot } from "@coop/shared";
import * as THREE from "three";
import { createZombieModel, disposeObject3D } from "./characterModels";

type ZombieVisual = {
  root: THREE.Group;
  body: THREE.Group;
  hpBar: THREE.Sprite;
  hpCanvas: HTMLCanvasElement;
  target: { x: number; y: number; z: number; yaw: number; hp: number };
  walkPhase: number;
};

const HP_BAR_W = 64;
const HP_BAR_H = 10;

function createHpBarSprite(): {
  sprite: THREE.Sprite;
  canvas: HTMLCanvasElement;
} {
  const canvas = document.createElement("canvas");
  canvas.width = HP_BAR_W;
  canvas.height = HP_BAR_H;
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.85, 0.1, 1);
  sprite.position.y = 2.05;
  sprite.renderOrder = 5;
  return { sprite, canvas };
}

function drawHpBar(canvas: HTMLCanvasElement, hp: number, maxHp: number): void {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;

  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const pad = 2;
  const barW = canvas.width - pad * 2;
  const barH = canvas.height - pad * 2;
  ctx.fillStyle = "#2a1515";
  ctx.fillRect(pad, pad, barW, barH);

  if (ratio > 0) {
    ctx.fillStyle = ratio > 0.55 ? "#3fb950" : ratio > 0.28 ? "#d29922" : "#f85149";
    ctx.fillRect(pad, pad, barW * ratio, barH);
  }
}

function disposeHpBar(sprite: THREE.Sprite): void {
  const mat = sprite.material as THREE.SpriteMaterial;
  mat.map?.dispose();
  mat.dispose();
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
      if (visual.target.hp !== zombie.hp) {
        visual.target.hp = zombie.hp;
        const maxHp = ZOMBIE_DEFS[zombie.kind].maxHp;
        drawHpBar(visual.hpCanvas, zombie.hp, maxHp);
        (visual.hpBar.material as THREE.SpriteMaterial).map!.needsUpdate = true;
      }
    }

    for (const [id, visual] of this.visuals) {
      if (!seen.has(id)) {
        this.scene.remove(visual.root);
        disposeHpBar(visual.hpBar);
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
    }
  }

  private create(zombie: ZombieSnapshot): ZombieVisual {
    const def = ZOMBIE_DEFS[zombie.kind];
    const model = createZombieModel(def.color);
    const scale = zombie.kind === "bruiser" ? 1.15 : zombie.kind === "runner" ? 0.92 : 1;
    model.root.scale.setScalar(scale);
    model.root.position.set(zombie.x, zombie.y, zombie.z);
    model.root.rotation.y = zombie.yaw;

    const { sprite: hpBar, canvas: hpCanvas } = createHpBarSprite();
    drawHpBar(hpCanvas, zombie.hp, def.maxHp);
    (hpBar.material as THREE.SpriteMaterial).map!.needsUpdate = true;
    model.root.add(hpBar);

    return {
      root: model.root,
      body: model.body,
      hpBar,
      hpCanvas,
      target: { x: zombie.x, y: zombie.y, z: zombie.z, yaw: zombie.yaw, hp: zombie.hp },
      walkPhase: Math.random() * Math.PI * 2,
    };
  }
}
