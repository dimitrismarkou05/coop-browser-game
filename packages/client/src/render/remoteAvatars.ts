import { ITEMS, PLAYER, type ItemId, type PlayerSnapshot } from "@coop/shared";
import * as THREE from "three";

function makeNameSprite(name: string, color: number, downed: boolean): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(16, 12, 224, 40);
  ctx.font = "bold 26px Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = downed ? "#f85149" : `#${color.toString(16).padStart(6, "0")}`;
  ctx.fillText(downed ? `${name} [DOWN]` : name.slice(0, 16), 128, 34);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.8, 0.45, 1);
  sprite.position.y = PLAYER.height + 0.25;
  return sprite;
}

function buildHeldWeapon(id: ItemId | null): THREE.Group | null {
  if (!id) return null;
  const kind = ITEMS[id].kind;
  if (kind === "resource") return null;

  const g = new THREE.Group();
  const color = new THREE.Color(ITEMS[id].color).getHex();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.35 });

  if (kind === "gun") {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.35), mat);
    body.position.set(0.28, 0.95, -0.35);
    body.rotation.y = -0.15;
    g.add(body);
  } else if (id === "axe") {
    const haft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.025, 0.55, 5),
      new THREE.MeshStandardMaterial({ color: 0x5c3a1e }),
    );
    haft.position.set(0.32, 1.0, -0.2);
    haft.rotation.z = 0.5;
    g.add(haft);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.12), mat);
    head.position.set(0.45, 1.2, -0.25);
    g.add(head);
  } else {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, id === "sword" ? 0.55 : 0.28), mat);
    blade.position.set(0.3, 1.0, -0.25);
    blade.rotation.y = -0.2;
    g.add(blade);
  }
  return g;
}

type RemoteVisual = {
  root: THREE.Group;
  body: THREE.Mesh;
  head: THREE.Mesh;
  weapon: THREE.Group | null;
  weaponId: ItemId | null;
  label: THREE.Sprite;
  downed: boolean;
  name: string;
  color: number;
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

      if (remote.downed !== player.downed || remote.name !== player.name) {
        remote.root.remove(remote.label);
        const map = remote.label.material.map;
        remote.label.material.dispose();
        map?.dispose();
        remote.label = makeNameSprite(player.name, player.color, player.downed);
        remote.root.add(remote.label);
        remote.downed = player.downed;
        remote.name = player.name;
      }

      const held = player.hotbar[player.selectedSlot];
      const heldId = held && ITEMS[held.id].kind !== "resource" ? held.id : null;
      if (heldId !== remote.weaponId) {
        if (remote.weapon) {
          remote.root.remove(remote.weapon);
          remote.weapon.traverse((o) => {
            if (o instanceof THREE.Mesh) {
              o.geometry.dispose();
              (o.material as THREE.Material).dispose();
            }
          });
        }
        remote.weapon = buildHeldWeapon(heldId);
        remote.weaponId = heldId;
        if (remote.weapon) remote.root.add(remote.weapon);
      }

      remote.target.x = player.x;
      remote.target.y = player.y;
      remote.target.z = player.z;
      remote.target.yaw = player.yaw;
      (remote.body.material as THREE.MeshStandardMaterial).color.setHex(player.color);
      (remote.head.material as THREE.MeshStandardMaterial).color.setHex(player.color);
      remote.body.rotation.x = player.downed ? Math.PI / 2 : 0;
      remote.body.position.y = player.downed ? PLAYER.radius : PLAYER.height / 2 - 0.1;
      remote.head.visible = !player.downed;
      if (remote.weapon) remote.weapon.visible = !player.downed;
      remote.label.position.y = player.downed ? 1.1 : PLAYER.height + 0.25;
    }

    for (const [id, remote] of this.remotes) {
      if (!seen.has(id)) {
        this.scene.remove(remote.root);
        remote.body.geometry.dispose();
        (remote.body.material as THREE.Material).dispose();
        remote.head.geometry.dispose();
        (remote.head.material as THREE.Material).dispose();
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
      new THREE.CapsuleGeometry(PLAYER.radius * 0.95, PLAYER.height - PLAYER.radius * 2.4, 4, 8),
      new THREE.MeshStandardMaterial({ color: player.color, roughness: 0.7 }),
    );
    body.position.y = player.downed ? PLAYER.radius : PLAYER.height / 2 - 0.1;
    body.rotation.x = player.downed ? Math.PI / 2 : 0;
    root.add(body);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 10, 8),
      new THREE.MeshStandardMaterial({ color: player.color, roughness: 0.65 }),
    );
    head.position.y = PLAYER.height - 0.15;
    root.add(head);

    const held = player.hotbar[player.selectedSlot];
    const heldId = held && ITEMS[held.id].kind !== "resource" ? held.id : null;
    const weapon = buildHeldWeapon(heldId);
    if (weapon) root.add(weapon);

    const label = makeNameSprite(player.name, player.color, player.downed);
    if (player.downed) label.position.y = 1.1;
    root.add(label);

    return {
      root,
      body,
      head,
      weapon,
      weaponId: heldId,
      label,
      downed: player.downed,
      name: player.name,
      color: player.color,
      target: { x: player.x, y: player.y, z: player.z, yaw: player.yaw },
    };
  }
}
