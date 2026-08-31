/** Minecraft-style heart / drumstick icons for the vitals HUD. */

export type PipFill = "full" | "half" | "empty";

/** 5 hearts / 5 food icons — each pip is a clearer chunk of the bar. */
export const VITAL_PIP_COUNT = 5;

const cache = new Map<string, string>();

function canvasIcon(key: string, draw: (ctx: CanvasRenderingContext2D, s: number) => void): string {
  const hit = cache.get(key);
  if (hit) return hit;
  const s = 64;
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, s, s);
  draw(ctx, s);
  const url = c.toDataURL("image/png");
  cache.set(key, url);
  return url;
}

/** Blocky MC heart — fills the tile cleanly. */
function drawHeartShape(ctx: CanvasRenderingContext2D, s: number, color: string): void {
  const u = s / 8;
  ctx.fillStyle = color;
  // Two top bumps
  ctx.fillRect(u * 1, u * 1, u * 2, u * 2);
  ctx.fillRect(u * 5, u * 1, u * 2, u * 2);
  // Mid body
  ctx.fillRect(u * 0.5, u * 2.5, u * 7, u * 2.5);
  // Point
  ctx.fillRect(u * 1.5, u * 5, u * 5, u * 1.5);
  ctx.fillRect(u * 2.5, u * 6.5, u * 3, u * 1);
  ctx.fillRect(u * 3.25, u * 7.25, u * 1.5, u * 0.5);
}

export function heartIconUrl(fill: PipFill): string {
  return canvasIcon(`heart-v3-${fill}`, (ctx, s) => {
    drawHeartShape(ctx, s, "#2a0c0c");
    if (fill === "empty") {
      // outline only
      return;
    }
    ctx.save();
    if (fill === "half") {
      ctx.beginPath();
      ctx.rect(0, 0, s * 0.5, s);
      ctx.clip();
    }
    drawHeartShape(ctx, s, "#e3242b");
    // Highlight pixels
    const u = s / 8;
    ctx.fillStyle = "#ff6b6b";
    ctx.fillRect(u * 1.5, u * 1.5, u, u);
    ctx.fillStyle = "#a01018";
    ctx.fillRect(u * 3.25, u * 5.5, u * 1.5, u);
    ctx.restore();
  });
}

export function foodIconUrl(fill: PipFill): string {
  return canvasIcon(`food-v3-${fill}`, (ctx, s) => {
    const u = s / 8;
    // Empty silhouette
    ctx.fillStyle = "#1a140e";
    ctx.fillRect(u * 1, u * 3, u * 5, u * 3.5);
    ctx.fillRect(u * 5.5, u * 1.5, u * 1.5, u * 2.5);
    ctx.fillRect(u * 5.2, u * 0.8, u * 2, u * 1.2);

    if (fill === "empty") return;

    ctx.save();
    if (fill === "half") {
      ctx.beginPath();
      ctx.rect(s * 0.5, 0, s * 0.5, s);
      ctx.clip();
    }
    // Meat
    ctx.fillStyle = "#c45c28";
    ctx.fillRect(u * 1.1, u * 3.1, u * 4.8, u * 3.3);
    ctx.fillStyle = "#8a3418";
    ctx.fillRect(u * 2, u * 4.5, u * 3, u * 1.5);
    // Bone
    ctx.fillStyle = "#f0d8b0";
    ctx.fillRect(u * 5.5, u * 1.6, u * 1.4, u * 2.3);
    ctx.fillRect(u * 5.2, u * 0.9, u * 2, u * 1.1);
    ctx.fillStyle = "#e8c898";
    ctx.fillRect(u * 5.7, u * 1.1, u * 1, u * 0.6);
    // Shine
    ctx.fillStyle = "#e89050";
    ctx.fillRect(u * 1.5, u * 3.4, u * 1.5, u * 0.8);
    ctx.restore();
  });
}

/** Map 0–maxValue onto `count` pips (full / half / empty). */
export function valueToPips(
  value: number,
  maxValue: number,
  count = VITAL_PIP_COUNT,
): PipFill[] {
  const units = Math.max(0, Math.min(count * 2, Math.round((value / maxValue) * count * 2)));
  const pips: PipFill[] = [];
  for (let i = 0; i < count; i++) {
    const u = units - i * 2;
    if (u >= 2) pips.push("full");
    else if (u === 1) pips.push("half");
    else pips.push("empty");
  }
  return pips;
}

export function renderPipRow(
  container: HTMLElement,
  pips: PipFill[],
  kind: "heart" | "food",
): void {
  const urlFn = kind === "heart" ? heartIconUrl : foodIconUrl;
  if (container.childElementCount !== pips.length) {
    container.innerHTML = "";
    for (let i = 0; i < pips.length; i++) {
      const img = document.createElement("img");
      img.className = "mc-pip";
      img.alt = "";
      img.draggable = false;
      container.appendChild(img);
    }
  }
  const imgs = container.querySelectorAll("img");
  pips.forEach((fill, i) => {
    const img = imgs[i];
    if (img) img.src = urlFn(fill);
  });
}
