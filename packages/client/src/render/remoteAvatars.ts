import type { PlayerSnapshot } from "@coop/shared";
import { PLAYER } from "@coop/shared";
import * as THREE from "three";

function makeNameSprite(name: string, color: number): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(16, 12, 224, 40);
  ctx.font = "bold 28px Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
  ctx.fillText(name.slice(0, 16), 128, 34);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.6, 0.4, 1);
  sprite.position.y = PLAYER.height + 0.25;
  return sprite;
}

type RemoteVisual = {
  root: THREE.Group;
  body: THREE.Mesh;
  label: THREE.Sprite;
  target: { x: number; y: number; z: number; yaw: number };
};

export class RemotePlayers {
  private readonly remotes = new Map<string, RemoteVisual>();

  constructor(private readonly scene: THREE.Scene) {}

  sync(players: PlayerSnapshot[], localId: string): void {
    const seen = new Set<string>();

    for (const player of players) {
      if (player.id === localId) continue;
      seen.add(player.id);

      let remote = this.remotes.get(player.id);
      if (!remote) {
        remote = this.createRemote(player);
        this.remotes.set(player.id, remote);
        this.scene.add(remote.root);
      }

      remote.target.x = player.x;
      remote.target.y = player.y;
      remote.target.z = player.z;
      remote.target.yaw = player.yaw;
      (remote.body.material as THREE.MeshStandardMaterial).color.setHex(player.color);
    }

    for (const [id, remote] of this.remotes) {
      if (!seen.has(id)) {
        this.scene.remove(remote.root);
        remote.body.geometry.dispose();
        (remote.body.material as THREE.Material).dispose();
        const map = remote.label.material.map;
        remote.label.material.dispose();
        map?.dispose();
        this.remotes.delete(id);
      }
    }
  }

  update(dt: number): void {
    const t = 1 - Math.exp(-12 * dt);
    for (const remote of this.remotes.values()) {
      remote.root.position.x += (remote.target.x - remote.root.position.x) * t;
      remote.root.position.y += (remote.target.y - remote.root.position.y) * t;
      remote.root.position.z += (remote.target.z - remote.root.position.z) * t;
      remote.root.rotation.y = remote.target.yaw;
    }
  }

  private createRemote(player: PlayerSnapshot): RemoteVisual {
    const root = new THREE.Group();
    root.position.set(player.x, player.y, player.z);
    root.rotation.y = player.yaw;

    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(PLAYER.radius, PLAYER.height - PLAYER.radius * 2, 4, 8),
      new THREE.MeshStandardMaterial({ color: player.color, roughness: 0.7 }),
    );
    body.position.y = PLAYER.height / 2;
    root.add(body);

    const label = makeNameSprite(player.name, player.color);
    root.add(label);

    return {
      root,
      body,
      label,
      target: { x: player.x, y: player.y, z: player.z, yaw: player.yaw },
    };
  }
}
