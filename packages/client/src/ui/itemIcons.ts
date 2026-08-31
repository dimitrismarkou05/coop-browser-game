import { ITEMS, type ItemId } from "@coop/shared";

const cache = new Map<ItemId, string>();

/** Simple canvas icons for inventory / hotbar slots. */
export function itemIconUrl(id: ItemId): string {
  const hit = cache.get(id);
  if (hit) return hit;

  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);

  const accent = ITEMS[id].color;
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.roundRect(4, 4, 56, 56, 8);
  ctx.fill();

  switch (id) {
    case "food":
      drawFood(ctx, accent);
      break;
    case "scrap":
      drawScrap(ctx, accent);
      break;
    case "wood":
      drawWood(ctx, accent);
      break;
    case "ammo":
      drawAmmo(ctx, accent);
      break;
    case "medkit":
      drawMedkit(ctx, accent);
      break;
    case "pistol":
      drawPistol(ctx, accent);
      break;
    case "smg":
      drawSmg(ctx, accent);
      break;
    case "ar":
      drawAr(ctx, accent);
      break;
    case "shotgun":
      drawShotgun(ctx, accent);
      break;
    case "knife":
      drawKnife(ctx, accent);
      break;
    case "sword":
      drawSword(ctx, accent);
      break;
    case "axe":
      drawAxe(ctx, accent);
      break;
  }

  const url = canvas.toDataURL("image/png");
  cache.set(id, url);
  return url;
}

function drawFood(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(32, 36, 16, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3d9a5f";
  ctx.fillRect(28, 14, 8, 14);
  ctx.beginPath();
  ctx.ellipse(38, 16, 8, 5, 0.4, 0, Math.PI * 2);
  ctx.fill();
}

function drawScrap(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(16, 44);
  ctx.lineTo(28, 18);
  ctx.lineTo(40, 28);
  ctx.lineTo(48, 16);
  ctx.lineTo(52, 46);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#e6edf3";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawWood(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(18, 14, 12, 38);
  ctx.fillRect(34, 18, 12, 34);
  ctx.strokeStyle = "#5c3a1e";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(24, 20);
  ctx.lineTo(24, 46);
  ctx.moveTo(40, 24);
  ctx.lineTo(40, 48);
  ctx.stroke();
}

function drawAmmo(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.fillStyle = color;
  for (const x of [20, 32, 44]) {
    ctx.beginPath();
    ctx.moveTo(x, 14);
    ctx.lineTo(x + 6, 14);
    ctx.lineTo(x + 5, 48);
    ctx.lineTo(x + 1, 48);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#e6edf3";
    ctx.fillRect(x + 1, 14, 4, 6);
    ctx.fillStyle = color;
  }
}

function drawMedkit(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.fillStyle = "#e6edf3";
  ctx.fillRect(14, 18, 36, 30);
  ctx.fillStyle = color;
  ctx.fillRect(28, 22, 8, 22);
  ctx.fillRect(20, 29, 24, 8);
}

function drawPistol(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(14, 28, 34, 10);
  ctx.fillRect(40, 22, 10, 8);
  ctx.fillRect(18, 38, 10, 14);
  ctx.fillStyle = "#21262d";
  ctx.fillRect(44, 24, 8, 4);
}

function drawSmg(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(12, 26, 40, 10);
  ctx.fillRect(44, 22, 12, 8);
  ctx.fillRect(20, 36, 8, 14);
  ctx.fillRect(28, 36, 18, 5);
  ctx.fillStyle = "#21262d";
  ctx.fillRect(48, 24, 10, 4);
}

function drawAr(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(8, 28, 44, 9);
  ctx.fillRect(46, 24, 14, 7);
  ctx.fillRect(16, 37, 9, 14);
  ctx.fillRect(28, 22, 14, 6);
  ctx.fillStyle = "#21262d";
  ctx.fillRect(52, 25, 10, 4);
}

function drawShotgun(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(6, 26, 48, 12);
  ctx.fillRect(48, 22, 12, 10);
  ctx.fillRect(14, 38, 12, 14);
  ctx.fillRect(30, 20, 16, 8);
  ctx.fillStyle = "#5c3a1e";
  ctx.fillRect(4, 28, 10, 8);
  ctx.fillStyle = "#21262d";
  ctx.fillRect(52, 24, 10, 5);
}

function drawKnife(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.fillStyle = "#8b5a2b";
  ctx.fillRect(14, 30, 16, 8);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(28, 28);
  ctx.lineTo(52, 32);
  ctx.lineTo(28, 40);
  ctx.closePath();
  ctx.fill();
}

function drawSword(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.fillStyle = "#8b5a2b";
  ctx.fillRect(14, 30, 12, 8);
  ctx.fillStyle = "#c4a35a";
  ctx.fillRect(24, 26, 6, 16);
  ctx.fillStyle = color;
  ctx.fillRect(30, 30, 26, 6);
  ctx.beginPath();
  ctx.moveTo(56, 30);
  ctx.lineTo(62, 33);
  ctx.lineTo(56, 36);
  ctx.closePath();
  ctx.fill();
}

function drawAxe(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.fillStyle = "#8b5a2b";
  ctx.fillRect(18, 16, 8, 36);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(24, 18);
  ctx.lineTo(48, 12);
  ctx.lineTo(48, 34);
  ctx.lineTo(24, 28);
  ctx.closePath();
  ctx.fill();
}
