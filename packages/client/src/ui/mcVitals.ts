/** Minecraft-style heart / drumstick icons for the vitals HUD. */

export type PipFill = "full" | "half" | "empty";

const cache = new Map<string, string>();

function canvasIcon(key: string, draw: (ctx: CanvasRenderingContext2D, s: number) => void): string {
  const hit = cache.get(key);
  if (hit) return hit;
  const s = 36;
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

function heartPath(ctx: CanvasRenderingContext2D, s: number): void {
  const x = s * 0.5;
  const y = s * 0.58;
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.28);
  ctx.bezierCurveTo(x - s * 0.45, y - s * 0.05, x - s * 0.4, y - s * 0.42, x, y - s * 0.18);
  ctx.bezierCurveTo(x + s * 0.4, y - s * 0.42, x + s * 0.45, y - s * 0.05, x, y + s * 0.28);
  ctx.closePath();
}

export function heartIconUrl(fill: PipFill): string {
  return canvasIcon(`heart-${fill}`, (ctx, s) => {
    // Container outline (empty heart)
    ctx.fillStyle = "#2a0a0a";
    heartPath(ctx, s);
    ctx.fill();
    ctx.strokeStyle = "#1a0505";
    ctx.lineWidth = 2;
    ctx.stroke();

    if (fill === "empty") return;

    ctx.save();
    if (fill === "half") {
      ctx.beginPath();
      ctx.rect(0, 0, s * 0.5, s);
      ctx.clip();
    }
    ctx.fillStyle = "#e3242b";
    heartPath(ctx, s);
    ctx.fill();
    // Highlight
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.ellipse(s * 0.36, s * 0.32, s * 0.08, s * 0.06, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

export function foodIconUrl(fill: PipFill): string {
  return canvasIcon(`food-${fill}`, (ctx, s) => {
    // Empty plate / bone outline
    ctx.fillStyle = "#2a2118";
    ctx.beginPath();
    ctx.ellipse(s * 0.5, s * 0.55, s * 0.32, s * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();

    if (fill === "empty") {
      ctx.strokeStyle = "#5c4030";
      ctx.lineWidth = 2;
      ctx.stroke();
      return;
    }

    ctx.save();
    if (fill === "half") {
      ctx.beginPath();
      ctx.rect(s * 0.5, 0, s * 0.5, s);
      ctx.clip();
    }

    // Drumstick / chop meat
    ctx.fillStyle = "#c45c2a";
    ctx.beginPath();
    ctx.ellipse(s * 0.48, s * 0.52, s * 0.26, s * 0.2, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e8a87c";
    ctx.beginPath();
    ctx.ellipse(s * 0.72, s * 0.38, s * 0.1, s * 0.08, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f0d0b0";
    ctx.fillRect(s * 0.68, s * 0.22, s * 0.08, s * 0.18);
    // Highlight
    ctx.fillStyle = "rgba(255,220,160,0.45)";
    ctx.beginPath();
    ctx.ellipse(s * 0.4, s * 0.45, s * 0.08, s * 0.05, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

/** Map 0–maxValue onto 10 pips (full / half / empty), Minecraft-style. */
export function valueToPips(value: number, maxValue: number, count = 10): PipFill[] {
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
