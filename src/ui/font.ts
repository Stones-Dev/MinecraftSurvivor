/**
 * Pixel-perfect text: a 1-bit glyph atlas of the bundled Tiny5 font.
 *
 * `fillText` antialiases a vector font, rounds advances to fractions of a pixel and (drawn twice for
 * the shadow) leaves soft, uneven letters on the art-resolution canvas. Instead, every glyph is
 * rasterized once at the font's native size (8 px: one font unit per art pixel), the alpha is
 * thresholded into a hard mask and the result is blitted with `drawImage` at integer positions with
 * integer advances. Strings are pre-rendered (text + 1 px black shadow) into small canvases kept in
 * an LRU cache, so a frame full of damage numbers costs one `drawImage` per number.
 */

export const FONT_FAMILY = 'Tiny5';
/** The size at which Tiny5's design grid lands exactly on art pixels (cap height 5, x-height 4). */
export const FONT_PX = 8;
const CSS_FONT = `${FONT_PX}px "${FONT_FAMILY}"`;
/** Pixels above the baseline that the font's line box uses. */
export const ASCENT = 7;
/** Pixels below the baseline that the font's line box uses (descenders). */
export const DESCENT = 2;
/** Baseline-to-baseline distance of single-spaced text. */
export const LINE_HEIGHT = ASCENT + DESCENT;
/** Advance used for missing glyphs and before the atlas exists (tests, no DOM). */
export const FALLBACK_ADVANCE = 5;

export type TextAlign = 'left' | 'center' | 'right';

interface Glyph {
  /** Cell position in the atlas. */
  sx: number;
  /** Cell width in the atlas (ink may overhang the advance). */
  w: number;
  /** Cell left edge relative to the pen position (negative = ink left of the origin). */
  ox: number;
  /** Integer advance of the pen. */
  adv: number;
}

/** Printable ASCII + Latin-1, plus a few punctuation marks the strings may use. */
function charset(): number[] {
  const codes: number[] = [];
  for (let c = 32; c <= 126; c++) codes.push(c);
  for (let c = 0xa0; c <= 0xff; c++) codes.push(c);
  codes.push(0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2026, 0x20ac, 0x2212);
  return codes;
}

/** Stand-ins for characters the font lacks (single glyphs, so widths stay predictable). */
const SUBSTITUTES: Record<number, number> = {
  0x2013: 0x2d, // en dash -> hyphen
  0x2014: 0x2d, // em dash -> hyphen
  0x2212: 0x2d, // minus sign -> hyphen
  0x2018: 0x27,
  0x2019: 0x27,
  0x201c: 0x22,
  0x201d: 0x22,
  0x2022: 0xb7, // bullet -> middle dot
  0x2026: 0x2e, // ellipsis -> period
};

/** Hard 1-bit mask in place: alpha >= cutoff becomes opaque white, the rest fully transparent. */
export function thresholdAlpha(data: Uint8ClampedArray, cutoff = 128): void {
  for (let i = 0; i < data.length; i += 4) {
    const on = (data[i + 3] ?? 0) >= cutoff;
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = on ? 255 : 0;
  }
}

/** Integer width of `s` given per-character advances (code unit -> px); astral chars count once. */
export function measureWith(s: string, advance: (code: number) => number, scale = 1): number {
  let w = 0;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code >= 0xdc00 && code <= 0xdfff) continue; // low surrogate: the pair was counted once
    w += advance(code);
  }
  return Math.round(w) * Math.max(1, Math.round(scale));
}

interface Atlas {
  mask: HTMLCanvasElement;
  glyphs: Map<number, Glyph>;
  missing: Glyph;
  /** Cell top relative to the baseline is `-cellAsc`. */
  cellAsc: number;
  cellH: number;
}

let atlas: Atlas | null = null;

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
}

function buildAtlas(): Atlas {
  const probe = makeCanvas(1, 1).getContext('2d');
  if (!probe) throw new Error('2D canvas is not available');
  const codes = charset();
  const present = (ch: string): boolean => {
    // A glyph the font lacks is drawn by the fallback family, so two different fallbacks disagree.
    probe.font = `${CSS_FONT}, monospace`;
    const a = probe.measureText(ch).width;
    probe.font = `${CSS_FONT}, serif`;
    return Math.abs(a - probe.measureText(ch).width) < 0.01;
  };

  interface Pending {
    code: number;
    ch: string;
    left: number;
    right: number;
    adv: number;
  }
  const pending: Pending[] = [];
  let cellAsc = ASCENT;
  let cellDesc = DESCENT;
  for (const code of codes) {
    const ch = String.fromCharCode(code);
    if (!present(ch)) continue;
    probe.font = CSS_FONT;
    const m = probe.measureText(ch);
    const adv = Math.round(m.width);
    const left = Math.max(0, Math.ceil(m.actualBoundingBoxLeft));
    const right = Math.max(adv, Math.ceil(m.actualBoundingBoxRight));
    cellAsc = Math.max(cellAsc, Math.ceil(m.actualBoundingBoxAscent));
    cellDesc = Math.max(cellDesc, Math.ceil(m.actualBoundingBoxDescent));
    pending.push({ code, ch, left, right, adv });
  }

  const cellH = cellAsc + cellDesc;
  const missingW = 4;
  const totalW = pending.reduce((sum, p) => sum + p.left + p.right + 1, 0) + missingW + 1;
  const mask = makeCanvas(totalW, cellH);
  const mctx = mask.getContext('2d', { willReadFrequently: true });
  if (!mctx) throw new Error('2D canvas is not available');
  mctx.font = CSS_FONT;
  mctx.fillStyle = '#fff';
  mctx.textAlign = 'left';
  mctx.textBaseline = 'alphabetic';

  const glyphs = new Map<number, Glyph>();
  let x = 0;
  for (const p of pending) {
    mctx.fillText(p.ch, x + p.left, cellAsc);
    const w = p.left + p.right;
    glyphs.set(p.code, { sx: x, w, ox: -p.left, adv: p.adv });
    x += w + 1;
  }
  // Missing-glyph placeholder: a hollow box of cap height.
  mctx.fillRect(x, cellAsc - 5, missingW - 1, 1);
  mctx.fillRect(x, cellAsc - 1, missingW - 1, 1);
  mctx.fillRect(x, cellAsc - 5, 1, 5);
  mctx.fillRect(x + missingW - 2, cellAsc - 5, 1, 5);
  const missing: Glyph = { sx: x, w: missingW, ox: 0, adv: FALLBACK_ADVANCE };

  const img = mctx.getImageData(0, 0, mask.width, mask.height);
  thresholdAlpha(img.data);
  mctx.putImageData(img, 0, 0);

  for (const [from, to] of Object.entries(SUBSTITUTES)) {
    const code = Number(from);
    const sub = glyphs.get(to);
    if (!glyphs.has(code) && sub) glyphs.set(code, sub);
  }
  return { mask, glyphs, missing, cellAsc, cellH };
}

function getAtlas(): Atlas {
  atlas ??= buildAtlas();
  return atlas;
}

/** Loads the font (if the page has not already) and builds the glyph atlas. Call before drawing. */
export async function initFont(): Promise<void> {
  await document.fonts.load(CSS_FONT).catch(() => undefined);
  atlas = buildAtlas();
  textCache.clear();
  tinted.clear();
}

function glyphFor(a: Atlas, code: number): Glyph {
  return a.glyphs.get(code) ?? a.missing;
}

function advanceOf(code: number): number {
  if (typeof document === 'undefined' && !atlas) return FALLBACK_ADVANCE;
  return glyphFor(getAtlas(), code).adv;
}

/** Width in art pixels of `s` drawn at `scale` (always an integer; the shadow is not included). */
export function textWidth(s: string, scale = 1): number {
  return measureWith(s, advanceOf, scale);
}

// ---- Tinted atlases: one recoloured copy of the mask per CSS colour. ----

const MAX_TINTS = 48;
const tinted = new Map<string, HTMLCanvasElement>();

function tintedAtlas(a: Atlas, color: string): HTMLCanvasElement {
  const hit = tinted.get(color);
  if (hit) return hit;
  if (tinted.size >= MAX_TINTS) tinted.clear();
  const c = makeCanvas(a.mask.width, a.mask.height);
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.drawImage(a.mask, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, c.width, c.height);
  }
  tinted.set(color, c);
  return c;
}

// ---- Pre-rendered strings (text + shadow), LRU by insertion order of a Map. ----

interface TextImage {
  canvas: HTMLCanvasElement;
  /** Advance width of the string. */
  w: number;
  /** Canvas left edge relative to the pen start. */
  ox: number;
}

const MAX_CACHED = 600;
const textCache = new Map<string, TextImage>();

function renderString(s: string, color: string, shadow: boolean): TextImage {
  const a = getAtlas();
  let minX = 0;
  let maxX = 0;
  let pen = 0;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code >= 0xdc00 && code <= 0xdfff) continue;
    const g = glyphFor(a, code);
    minX = Math.min(minX, pen + g.ox);
    maxX = Math.max(maxX, pen + g.ox + g.w);
    pen += g.adv;
  }
  const extra = shadow ? 1 : 0;
  const canvas = makeCanvas(maxX - minX + extra, a.cellH + extra);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const layers: [HTMLCanvasElement, number][] = shadow
      ? [
          [tintedAtlas(a, '#000'), 1],
          [tintedAtlas(a, color), 0],
        ]
      : [[tintedAtlas(a, color), 0]];
    for (const [src, off] of layers) {
      let x = -minX + off;
      for (let i = 0; i < s.length; i++) {
        const code = s.charCodeAt(i);
        if (code >= 0xdc00 && code <= 0xdfff) continue;
        const g = glyphFor(a, code);
        if (g.w > 0 && code !== 32) {
          ctx.drawImage(src, g.sx, 0, g.w, a.cellH, x + g.ox, off, g.w, a.cellH);
        }
        x += g.adv;
      }
    }
  }
  return { canvas, w: pen, ox: minX };
}

function textImage(s: string, color: string, shadow: boolean): TextImage {
  const key = `${shadow ? 's' : 'n'}${color}\u0000${s}`;
  const hit = textCache.get(key);
  if (hit) {
    // Refresh recency: re-insert at the end of the Map's iteration order.
    textCache.delete(key);
    textCache.set(key, hit);
    return hit;
  }
  const img = renderString(s, color, shadow);
  textCache.set(key, img);
  if (textCache.size > MAX_CACHED) {
    const oldest = textCache.keys().next().value;
    if (oldest !== undefined) textCache.delete(oldest);
  }
  return img;
}

/** Left pen position for a string of width `w` drawn at `x` with `align`. */
export function alignedX(x: number, w: number, align: TextAlign | CanvasTextAlign): number {
  if (align === 'center') return Math.round(x - w / 2);
  if (align === 'right' || align === 'end') return Math.round(x) - w;
  return Math.round(x);
}

/**
 * Draws `s` with its baseline at `y`, `scale` times the native size (integer), with a 1-font-pixel
 * black shadow down-right unless `shadow` is false.
 */
export function drawGlyphs(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  color: string,
  align: TextAlign | CanvasTextAlign,
  scale = 1,
  shadow = true,
): void {
  if (!s) return;
  const k = Math.max(1, Math.round(scale));
  const img = textImage(s, color, shadow);
  const a = getAtlas();
  const left = alignedX(x, img.w * k, align) + img.ox * k;
  const top = Math.round(y) - a.cellAsc * k;
  if (k === 1) {
    ctx.drawImage(img.canvas, left, top);
    return;
  }
  const smoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img.canvas, left, top, img.canvas.width * k, img.canvas.height * k);
  ctx.imageSmoothingEnabled = smoothing;
}
