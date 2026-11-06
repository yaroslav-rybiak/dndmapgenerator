// Canvas renderer. Each (sprite, hex size) pair is rasterised once into an offscreen
// canvas, so a frame is one drawImage per layer per cell instead of clipping a 512px
// texture 336 times on every mouse move.
import { allSprites, spriteKey } from "./tiles.js";
import { hexCenter, hexCorners } from "./hex.js";

const GRID_STROKE = "#2d2d2d";
const HOVER_STROKE = "#6aa9ff";

function tracePath(g, cx, cy, size) {
  const pts = hexCorners(cx, cy, size);
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext("2d");
  const defs = allSprites();
  const images = {};
  const cache = new Map();
  let dpr = 1;

  const ready = Promise.all(
    Object.entries(defs).map(
      ([key, def]) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => { images[key] = img; resolve(); };
          img.onerror = () => { images[key] = null; resolve(); };
          img.src = def.image;
        }),
    ),
  );

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cache.clear();
    return r;
  }

  function sprite(key, size) {
    const id = `${key}@${size.toFixed(2)}`;
    let s = cache.get(id);
    if (s) return s;
    const css = size * 2 + 4;
    const c = document.createElement("canvas");
    c.width = c.height = Math.ceil(css * dpr);
    const g = c.getContext("2d");
    g.scale(dpr, dpr);
    const mid = css / 2;
    tracePath(g, mid, mid, size - 1);
    g.save();
    g.clip();
    const img = images[key];
    if (img) g.drawImage(img, mid - size, mid - size, size * 2, size * 2);
    else { g.fillStyle = defs[key]?.color || "#f0f"; g.fill(); }
    g.restore();
    tracePath(g, mid, mid, size - 1);
    g.strokeStyle = GRID_STROKE;
    g.lineWidth = 1.5;
    g.stroke();
    s = { canvas: c, css };
    cache.set(id, s);
    return s;
  }

  function blit(key, size, cx, cy) {
    const s = sprite(key, size);
    ctx.drawImage(s.canvas, cx - s.css / 2, cy - s.css / 2, s.css, s.css);
  }

  function render({ map, layout, hover }) {
    const r = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);
    if (!map || !layout) return;
    const { size } = layout;
    for (let row = 0; row < map.rows; row++) {
      for (let q = 0; q < map.cols; q++) {
        const cell = map.cells[row * map.cols + q];
        const { x, y } = hexCenter(layout, q, row);
        blit(spriteKey(cell.terrain), size, x, y);
        if (cell.object) blit(spriteKey(cell.object.type, cell.object.state), size, x, y);
        if (cell.token) blit(spriteKey(cell.token.type, cell.token.state), size, x, y);
      }
    }
    if (hover) {
      const { x, y } = hexCenter(layout, hover.q, hover.r);
      tracePath(ctx, x, y, size - 1);
      ctx.strokeStyle = HOVER_STROKE;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  return { ready, resize, render };
}
