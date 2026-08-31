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
  ctx.clearRect(0, 0, s, s);
  draw(ctx, s);
  const url = c.toDataURL("image/png");
  cache.set(key, url);
  return url;
}

/** Classic MC heart — fills most of the tile so it reads clearly at HUD size. */
function heartPath(ctx: CanvasRenderingContext2D, s: number): void {
  const x = s * 0.5;
  const top = s * 0.18;
  const bottom = s * 0.92;
  const midY = s * 0.42;
  ctx.beginPath();
  ctx.moveTo(x, bottom);
  ctx.bezierCurveTo(s * 0.02, midY + s * 0.08, s * 0.02, top, x, midY);
  ctx.bezierCurveTo(s * 0.98, top, s * 0.98, midY + s * 0.08, x, bottom);
  ctx.closePath();
}

export function heartIconUrl(fill: PipFill): string {
  return canvasIcon(`heart-v2-${fill}`, (ctx, s) => {
    // Dark container (empty shell)
    ctx.fillStyle = "#1a0808";
    heartPath(ctx, s);
    ctx.fill();
    ctx.strokeStyle = "#0d0404";
    ctx.lineWidth = Math.max(2, s * 0.04);
    ctx.stroke();

    if (fill === "empty") return;

    ctx.save();
    if (fill === "half") {
      ctx.beginPath();
      ctx.rect(0, 0, s * 0.5, s);
      ctx.clip();
    }
    // Solid MC-red fill
    ctx.fillStyle = "#ff1a1a";
    heartPath(ctx, s);
    ctx.fill();
    // Inner shade for depth
    ctx.fillStyle = "#c41010";
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.88);
    ctx.bezierCurveTo(s * 0.18, s * 0.55, s * 0.22, s * 0.38, s * 0.5, s * 0.48);
    ctx.bezierCurveTo(s * 0.55, s * 0.55, s * 0.62, s * 0.7, s * 0.5, s * 0.88);
    ctx.fill();
    // Highlight
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.beginPath();
    ctx.ellipse(s * 0.34, s * 0.34, s * 0.1, s * 0.08, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

export function foodIconUrl(fill: PipFill): string {
  return canvasIcon(`food-v2-${fill}`, (ctx, s) => {
    // Empty chop silhouette
    ctx.fillStyle = "#1a140e";
    ctx.beginPath();
    ctx.ellipse(s * 0.48, s * 0.58, s * 0.38, s * 0.28, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2a2118";
    ctx.beginPath();
    ctx.ellipse(s * 0.78, s * 0.32, s * 0.14, s * 0.11, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(s * 0.72, s * 0.14, s * 0.12, s * 0.22);

    if (fill === "empty") {
      ctx.strokeStyle = "#5c4030";
      ctx.lineWidth = Math.max(2, s * 0.04);
      ctx.beginPath();
      ctx.ellipse(s * 0.48, s * 0.58, s * 0.38, s * 0.28, -0.25, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }

    ctx.save();
    if (fill === "half") {
      ctx.beginPath();
      ctx.rect(s * 0.5, 0, s * 0.5, s);
      ctx.clip();
    }

    // Full porkchop / drumstick
    ctx.fillStyle = "#d45a28";
    ctx.beginPath();
    ctx.ellipse(s * 0.48, s * 0.58, s * 0.36, s * 0.26, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#a83818";
    ctx.beginPath();
    ctx.ellipse(s * 0.52, s * 0.62, s * 0.22, s * 0.16, -0.25, 0, Math.PI * 2);
    ctx.fill();
    // Bone
    ctx.fillStyle = "#f0d8b8";
    ctx.beginPath();
    ctx.ellipse(s * 0.78, s * 0.32, s * 0.13, s * 0.1, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(s * 0.72, s * 0.16, s * 0.11, s * 0.2);
    ctx.fillStyle = "#e8c8a0";
    ctx.beginPath();
    ctx.ellipse(s * 0.82, s * 0.28, s * 0.07, s * 0.055, 0.4, 0, Math.PI * 2);
    ctx.fill();
    // Highlight
    ctx.fillStyle = "rgba(255,220,160,0.5)";
    ctx.beginPath();
    ctx.ellipse(s * 0.36, s * 0.48, s * 0.1, s * 0.07, -0.3, 0, Math.PI * 2);
    ctx.fill();
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
