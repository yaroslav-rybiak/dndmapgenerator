// Pointy-top hex grid in "odd-r" offset coordinates: odd rows shift right by half a hex.
// Sizes are in CSS pixels. BASE_HEX_SIZE (the circumradius) was calibrated so a hex
// matches a 1-inch miniature base on a 40-inch 1080p TV.

export const SQRT3 = Math.sqrt(3);
export const BASE_HEX_SIZE = 44;
export const PAD = BASE_HEX_SIZE * 0.8;

/** Pick a hex size that fits the grid in the viewport (never larger than BASE_HEX_SIZE) and centre it. */
export function fitLayout(width, height, cols, rows) {
  const sizeW = (width - PAD * 2) / ((cols + 0.5) * SQRT3);
  const sizeH = (height - PAD * 2) / (rows * 1.5 + 0.5);
  const size = Math.max(4, Math.min(BASE_HEX_SIZE, sizeW, sizeH));
  const hexW = SQRT3 * size;
  const gridW = cols * hexW + (rows > 1 ? hexW / 2 : 0);
  const gridH = (rows - 1) * size * 1.5 + 2 * size;
  return {
    size,
    origin: { x: (width - gridW) / 2 + hexW / 2, y: (height - gridH) / 2 + size },
  };
}

export function hexCenter(layout, q, r) {
  const { size, origin } = layout;
  return {
    x: origin.x + q * SQRT3 * size + (r & 1) * (SQRT3 * size) / 2,
    y: origin.y + r * size * 1.5,
  };
}

export function hexCorners(cx, cy, size) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    pts.push([cx + size * Math.cos(a), cy + size * Math.sin(a)]);
  }
  return pts;
}

function cubeRound(qf, rf) {
  const sf = -qf - rf;
  let q = Math.round(qf), r = Math.round(rf), s = Math.round(sf);
  const dq = Math.abs(q - qf), dr = Math.abs(r - rf), ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return [q, r];
}

/** Pixel -> offset cell {q, r}, or null when outside the grid. */
export function pixelToHex(layout, x, y, cols, rows) {
  const px = x - layout.origin.x;
  const py = y - layout.origin.y;
  const qf = ((SQRT3 / 3) * px - py / 3) / layout.size;
  const rf = ((2 / 3) * py) / layout.size;
  const [aq, r] = cubeRound(qf, rf);
  const q = aq + (r - (r & 1)) / 2;
  if (r < 0 || r >= rows || q < 0 || q >= cols) return null;
  return { q, r };
}
