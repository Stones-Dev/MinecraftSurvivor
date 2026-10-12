/**
 * The MINESURVIVE title logo, drawn in code: chunky 5x7 block letters made of stone blocks with bevels,
 * an extruded 3D side, a black outline and a grass strip on top. Rendered once per block size to an
 * offscreen canvas; a light sweep runs across it every few seconds.
 */
import { noise2, shade } from './panel';

/** 5x7 letter bitmaps ('X' = a block). Widths differ (I is 3 wide, E 4). */
export const LOGO_GLYPHS: Record<string, readonly string[]> = {
  M: ['X...X', 'XX.XX', 'X.X.X', 'X.X.X', 'X...X', 'X...X', 'X...X'],
  I: ['XXX', '.X.', '.X.', '.X.', '.X.', '.X.', 'XXX'],
  N: ['X...X', 'XX..X', 'XX..X', 'X.X.X', 'X..XX', 'X..XX', 'X...X'],
  E: ['XXXX', 'X...', 'X...', 'XXX.', 'X...', 'X...', 'XXXX'],
  S: ['.XXXX', 'X....', 'X....', '.XXX.', '....X', '....X', 'XXXX.'],
  U: ['X...X', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'],
  R: ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X.X..', 'X..X.', 'X...X'],
  V: ['X...X', 'X...X', 'X...X', 'X...X', '.X.X.', '.X.X.', '..X..'],
};

export const LOGO_TEXT = 'MINESURVIVE';
export const LOGO_ROWS = 7;

export interface LogoCell {
  /** Column and row on the logo grid. */
  cx: number;
  cy: number;
  /** Index of the letter the block belongs to. */
  letter: number;
}

/** Every block of the logo on a grid (letters separated by one empty column). */
export function logoCells(text: string = LOGO_TEXT): { cells: LogoCell[]; cols: number } {
  const cells: LogoCell[] = [];
  let x = 0;
  [...text].forEach((ch, letter) => {
    const g = LOGO_GLYPHS[ch];
    if (!g) return;
    g.forEach((row, cy) =>
      [...row].forEach((c, i) => {
        if (c === 'X') cells.push({ cx: x + i, cy, letter });
      }),
    );
    x += (g[0]?.length ?? 0) + 1;
  });
  return { cells, cols: Math.max(0, x - 1) };
}

/** Block size in px for a screen `width` wide: as big as fits with a margin, between 2 and 9. */
export function logoBlock(width: number): number {
  const { cols } = logoCells();
  return Math.max(2, Math.min(9, Math.floor((width - 24) / cols)));
}

const STONE = ['#a4a4ac', '#9a9aa2', '#aeaeb6', '#94949c', '#a0a0a8'];
const GRASS = ['#6cc04a', '#5fb040', '#53a038', '#68b846'];

interface LogoImages {
  face: HTMLCanvasElement;
  mask: HTMLCanvasElement;
  w: number;
  h: number;
}

const cache = new Map<number, LogoImages>();

function paintLogo(b: number): LogoImages {
  const { cells, cols } = logoCells();
  const depth = Math.max(1, Math.round(b * 0.45));
  const pad = 2;
  const w = cols * b + depth + pad * 2;
  const h = LOGO_ROWS * b + depth + pad * 2 + Math.max(2, Math.round(b * 0.5));
  const mk = (): [HTMLCanvasElement, CanvasRenderingContext2D | null] => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return [c, c.getContext('2d')];
  };
  const [face, g] = mk();
  const [mask, m] = mk();
  if (!g || !m) return { face, mask, w, h };
  const top = pad + Math.max(2, Math.round(b * 0.5));
  const has = new Set(cells.map((c) => c.cy * 100 + c.cx));
  const at = (cx: number, cy: number): boolean => has.has(cy * 100 + cx);
  const px = (c: LogoCell): number => pad + c.cx * b;
  const py = (c: LogoCell): number => top + c.cy * b;

  // Outline: every block (and its extrusion) grown by one pixel in black.
  g.fillStyle = '#0c0c10';
  for (const c of cells) {
    for (let k = 0; k <= depth; k++) g.fillRect(px(c) + k - 1, py(c) + k - 1, b + 2, b + 2);
  }
  // Extrusion: from the far end towards the face, getting lighter, so the side reads as a lit wall.
  for (let k = depth; k >= 1; k--) {
    g.fillStyle = shade('#2c2c38', (depth - k) * 0.05);
    for (const c of cells) g.fillRect(px(c) + k, py(c) + k, b, b);
  }
  // Faces: noisy stone, bevel on exposed edges and a thin seam between neighbouring blocks.
  for (const c of cells) {
    const x = px(c);
    const y = py(c);
    const base = STONE[Math.floor(noise2(c.cx, c.cy, 7) * STONE.length)] ?? '#a0a0a8';
    g.fillStyle = base;
    g.fillRect(x, y, b, b);
    m.fillStyle = '#ffffff';
    m.fillRect(x, y, b, b);
    // Speckles.
    if (b >= 4) {
      g.fillStyle = shade(base, -0.12);
      const n = Math.max(1, Math.floor(b / 3));
      for (let i = 0; i < n; i++) {
        g.fillRect(
          x + 1 + Math.floor(noise2(c.cx * 7 + i, c.cy, 3) * (b - 2)),
          y + 1 + Math.floor(noise2(c.cx, c.cy * 7 + i, 5) * (b - 2)),
          1,
          1,
        );
      }
    }
    const lit = !at(c.cx, c.cy - 1);
    const litL = !at(c.cx - 1, c.cy);
    g.fillStyle = shade(base, lit ? 0.38 : 0.1);
    g.fillRect(x, y, b, 1);
    g.fillStyle = shade(base, litL ? 0.3 : 0.08);
    g.fillRect(x, y, 1, b);
    g.fillStyle = shade(base, !at(c.cx, c.cy + 1) ? -0.4 : -0.2);
    g.fillRect(x, y + b - 1, b, 1);
    g.fillStyle = shade(base, !at(c.cx + 1, c.cy) ? -0.4 : -0.2);
    g.fillRect(x + b - 1, y, 1, b);
  }
  // Grass on every block that has open air above it, with a few drips.
  const gh = Math.max(1, Math.round(b * 0.4));
  for (const c of cells) {
    if (at(c.cx, c.cy - 1)) continue;
    const x = px(c);
    const y = py(c);
    for (let i = 0; i < b; i++) {
      const drip = noise2(c.cx * 11 + i, c.cy, 9) > 0.62 ? 1 + (b >= 6 ? 1 : 0) : 0;
      const depthPx = gh + drip;
      g.fillStyle = GRASS[Math.floor(noise2(x + i, y, 2) * GRASS.length)] ?? '#5fb040';
      g.fillRect(x + i, y - 1, 1, depthPx + 1);
      if (i === 0 || i === b - 1) {
        g.fillStyle = '#2f6a22';
        g.fillRect(x + i, y + depthPx - 1, 1, 1);
      }
    }
    g.fillStyle = '#9ae070';
    g.fillRect(x + 1, y - 1, Math.max(1, b - 2), 1);
  }
  return { face, mask, w, h };
}

/** Pixel size of the logo drawn with block size `b`. */
export function logoSize(b: number): { w: number; h: number } {
  const { cols } = logoCells();
  const depth = Math.max(1, Math.round(b * 0.45));
  return {
    w: cols * b + depth + 4,
    h: LOGO_ROWS * b + depth + 4 + Math.max(2, Math.round(b * 0.5)),
  };
}

/**
 * Draw the logo centred on `cx` with its top at `y`; `t` seconds drives the light sweep (one pass every
 * 5 s). Returns the bottom edge of the drawn logo.
 */
export function drawLogo(
  ctx: CanvasRenderingContext2D,
  cx: number,
  y: number,
  block: number,
  t: number,
): number {
  let img = cache.get(block);
  if (!img) {
    img = paintLogo(block);
    cache.set(block, img);
  }
  const x = Math.round(cx - img.w / 2);
  const yy = Math.round(y);
  ctx.drawImage(img.face, x, yy);
  const phase = (t % 5) / 1.4;
  if (phase < 1) {
    const bandW = Math.max(6, block * 2);
    const bx = Math.round(x - bandW + phase * (img.w + bandW * 2));
    ctx.save();
    ctx.beginPath();
    ctx.rect(bx, yy, bandW, img.h);
    ctx.clip();
    ctx.globalAlpha = 0.42;
    ctx.drawImage(img.mask, x, yy);
    ctx.restore();
  }
  return yy + img.h;
}
