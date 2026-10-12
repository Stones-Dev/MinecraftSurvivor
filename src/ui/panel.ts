/**
 * Canvas UI primitives in a Minecraft inventory style: stone / oak panels with bevels, inventory slots,
 * five-state buttons (normal, hover, pressed, disabled, focused), tooltips and toasts. Everything is drawn
 * with whole-pixel rectangles (no gradients except the backdrop vignette) so it stays crisp at any zoom;
 * textures are tiny code-made tiles used as repeating patterns (one fillRect per panel).
 */
import { drawGlyphs, textWidth, type TextAlign } from './font';
import { drawIcon, type IconName } from './icons';
import { toastAlpha, toastSlide } from './hubModel';

export { LINE_HEIGHT, textWidth } from './font';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
}

/** Shared colours (text roles and surfaces) so the screens agree with each other. */
export const UI = {
  ink: '#101014',
  text: '#ffffff',
  soft: '#cfcfd8',
  dim: '#9a9aa8',
  faint: '#6a6a76',
  gold: '#ffd84a',
  green: '#7dff9a',
  red: '#ff8a8a',
  blue: '#7fa3d1',
} as const;

// ---------------------------------------------------------------------------------------------------
// Tiny deterministic noise and tile textures.

/** Hash of a pixel to [0, 1). */
export function noise2(x: number, y: number, seed = 0): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Colour `c` (#rrggbb) moved towards white (k > 0) or black (k < 0) by |k| (0..1). */
export function shade(c: string, k: number): string {
  const n = parseInt(c.slice(1), 16);
  const f = (v: number): number =>
    Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

type TileName = 'stone' | 'oak' | 'dirt' | 'slate';

const TILE_SIZE = 16;
const TILE_PALETTE: Record<TileName, readonly string[]> = {
  stone: ['#2d2d36', '#30303a', '#2a2a32', '#34343e', '#28282f'],
  slate: ['#23232b', '#26262f', '#202027', '#2a2a33', '#1d1d24'],
  oak: ['#a07a48', '#98703f', '#a98351', '#92693b', '#a07a48'],
  dirt: ['#47372a', '#3f3126', '#503d2e', '#392c22', '#4a3a2c'],
};

function paintTile(name: TileName): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = TILE_SIZE;
  c.height = TILE_SIZE;
  const g = c.getContext('2d');
  if (!g) return c;
  const pal = TILE_PALETTE[name];
  const seed = name.length * 97;
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      let color = pal[Math.floor(noise2(x, y, seed) * pal.length)] ?? '#000';
      if (name === 'oak') {
        // Four 4 px planks per tile, seams staggered; the seam rows and ends are darker.
        const row = Math.floor(y / 4);
        const seamX = (row % 2) * 8 + 3;
        if (y % 4 === 3) color = '#6a4c28';
        else if (x === seamX) color = '#7c5a30';
        else if (y % 4 === 0) color = shade(color, 0.08);
      }
      g.fillStyle = color;
      g.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

const tiles = new Map<TileName, HTMLCanvasElement>();
const patterns = new WeakMap<CanvasRenderingContext2D, Map<TileName, CanvasPattern | null>>();

/** Repeating pattern of a tile for this context (null when patterns are unavailable). */
function pattern(ctx: CanvasRenderingContext2D, name: TileName): CanvasPattern | null {
  let m = patterns.get(ctx);
  if (!m) {
    m = new Map();
    patterns.set(ctx, m);
  }
  const hit = m.get(name);
  if (hit !== undefined) return hit;
  let tile = tiles.get(name);
  if (!tile) {
    tile = paintTile(name);
    tiles.set(name, tile);
  }
  const p = ctx.createPattern(tile, 'repeat');
  m.set(name, p);
  return p;
}

const FALLBACK_FILL: Record<TileName, string> = {
  stone: '#2d2d36',
  slate: '#23232b',
  oak: '#a07a48',
  dirt: '#47372a',
};

function fillTile(ctx: CanvasRenderingContext2D, name: TileName, r: Rect): void {
  ctx.fillStyle = pattern(ctx, name) ?? FALLBACK_FILL[name];
  ctx.fillRect(r.x, r.y, r.w, r.h);
}

/** Full-screen menu backdrop: dim dirt tiles with a soft vignette (the options-screen look). */
export function drawBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  fillTile(ctx, 'dirt', { x: 0, y: 0, w, h });
  ctx.fillStyle = 'rgba(10,8,18,0.55)';
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.35,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.75,
  );
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,6,0.5)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

// ---------------------------------------------------------------------------------------------------
// Panels and slots.

export type PanelStyle = 'stone' | 'oak' | 'slate';

/**
 * A framed panel: 1 px outline (`accent` colours it, e.g. a rarity), tiled fill, light top/left bevel and
 * dark bottom/right bevel. `hot` brightens it with a blue rim (hover / selection).
 */
export function drawPanel(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  hot = false,
  accent: string | null = null,
  style: PanelStyle = 'stone',
): void {
  const { x, y, w, h } = r;
  if (w < 3 || h < 3) return;
  ctx.fillStyle = accent ?? UI.ink;
  ctx.fillRect(x, y, w, h);
  const inner = { x: x + 1, y: y + 1, w: w - 2, h: h - 2 };
  fillTile(ctx, style, inner);
  if (hot) {
    ctx.fillStyle = 'rgba(127,163,209,0.16)';
    ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
  }
  const light = style === 'oak' ? '#d0a468' : hot ? UI.blue : '#585863';
  const dark = style === 'oak' ? '#5a3f20' : '#16161c';
  ctx.fillStyle = light;
  ctx.fillRect(x + 1, y + 1, w - 2, 1);
  ctx.fillRect(x + 1, y + 1, 1, h - 2);
  ctx.fillStyle = dark;
  ctx.fillRect(x + 1, y + h - 2, w - 2, 1);
  ctx.fillRect(x + w - 2, y + 1, 1, h - 2);
  if (accent) {
    // A second, softer rim in the accent colour so rarity frames read at a glance.
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = accent;
    ctx.fillRect(x + 2, y + 2, w - 4, 1);
    ctx.fillRect(x + 2, y + 2, 1, h - 4);
    ctx.globalAlpha = 1;
  }
}

export interface SlotStyle {
  /** Frame colour (rarity). */
  color?: string | null;
  selected?: boolean;
  hover?: boolean;
  /** Dim the content (locked) with a veil. */
  locked?: boolean;
}

/** An inventory slot: dark inset with a dark top/left and a light bottom/right edge, optional coloured frame. */
export function drawSlot(ctx: CanvasRenderingContext2D, r: Rect, s: SlotStyle = {}): void {
  const { x, y, w, h } = r;
  if (w < 3 || h < 3) return;
  const frame = s.color ?? null;
  ctx.fillStyle = frame ?? '#0a0a0e';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = s.hover ? '#262a36' : '#16161d';
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  if (frame) {
    // Soft glow from the top-left corner in the frame colour.
    ctx.globalAlpha = s.locked ? 0.06 : 0.16;
    ctx.fillStyle = frame;
    ctx.fillRect(x + 1, y + 1, w - 2, Math.max(1, Math.floor((h - 2) / 2)));
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = frame ? shade(frame, -0.45) : '#06060a';
  ctx.fillRect(x + 1, y + 1, w - 2, 1);
  ctx.fillRect(x + 1, y + 1, 1, h - 2);
  ctx.fillStyle = frame ? shade(frame, 0.2) : '#4c4c58';
  ctx.globalAlpha = frame ? 0.55 : 1;
  ctx.fillRect(x + 1, y + h - 2, w - 2, 1);
  ctx.fillRect(x + w - 2, y + 1, 1, h - 2);
  ctx.globalAlpha = 1;
  if (s.selected) {
    ctx.fillStyle = UI.gold;
    ctx.fillRect(x - 1, y - 1, w + 2, 1);
    ctx.fillRect(x - 1, y + h, w + 2, 1);
    ctx.fillRect(x - 1, y, 1, h);
    ctx.fillRect(x + w, y, 1, h);
  }
}

/** Progress bar: dark trough, coloured fill with a light top line. */
export function drawBar(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  frac: number,
  color: string,
): void {
  ctx.fillStyle = '#06060a';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = '#23232c';
  ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  const fw = Math.round((r.w - 2) * Math.max(0, Math.min(1, frac)));
  if (fw <= 0) return;
  ctx.fillStyle = color;
  ctx.fillRect(r.x + 1, r.y + 1, fw, r.h - 2);
  if (r.h >= 5) {
    ctx.fillStyle = shade(color, 0.35);
    ctx.fillRect(r.x + 1, r.y + 1, fw, 1);
  }
}

/** 1 px engraved divider line (dark over light). */
export function drawDivider(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
  ctx.fillStyle = '#0a0a0e';
  ctx.fillRect(x, y, w, 1);
  ctx.fillStyle = '#4a4a56';
  ctx.fillRect(x, y + 1, w, 1);
}

// ---------------------------------------------------------------------------------------------------
// Text.

/** Pixel text with a 1 px black shadow; `y` is the baseline. Glyphs land on whole art pixels. */
export function drawText(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  color = '#fff',
  align: CanvasTextAlign = 'left',
): void {
  drawGlyphs(ctx, s, x, y, color, align);
}

/** Like `drawText`, `scale` times bigger (integer) for titles; the shadow scales with the glyphs. */
export function drawTextScaled(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  color = '#fff',
  align: TextAlign = 'left',
  scale = 2,
): void {
  drawGlyphs(ctx, s, x, y, color, align, scale);
}

/**
 * Greedy word wrap (pure): breaks at spaces and at `\n`, and splits a single word wider than
 * `maxW` across lines. An empty string gives no lines.
 */
export function wrapText(s: string, maxW: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  for (const para of s.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const trial = line ? `${line} ${word}` : word;
      if (!line || measure(trial) <= maxW) {
        line = trial;
      } else {
        lines.push(line);
        line = word;
      }
      // A word that cannot fit on a line of its own is cut at the last character that fits.
      while (measure(line) > maxW && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && measure(line.slice(0, cut)) > maxW) cut--;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    if (line || para === '') lines.push(line);
  }
  return s === '' ? [] : lines;
}

/** Greedy word wrap using the UI font (`ctx` is unused; kept for existing callers). */
export function wrap(_ctx: CanvasRenderingContext2D, s: string, maxW: number): string[] {
  return wrapText(s, maxW, (t) => textWidth(t));
}

/** `s` unchanged if it fits in `maxW`, else cut and suffixed with "..". */
export function fitText(
  s: string,
  maxW: number,
  measure: (s: string) => number = (t) => textWidth(t),
): string {
  if (measure(s) <= maxW) return s;
  let t = s;
  while (t.length > 1 && measure(`${t}..`) > maxW) t = t.slice(0, -1);
  return `${t.trimEnd()}..`;
}

/** Word-wrap `s` into at most maxLines lines; the last visible line ends in '..' when text is cut. */
export function clipText(s: string, maxW: number, maxLines: number): string[] {
  const lines = wrapText(s, maxW, (t) => textWidth(t));
  if (lines.length <= maxLines) return lines;
  const cut = lines.slice(0, Math.max(0, maxLines));
  if (cut.length > 0) cut[cut.length - 1] = fitText(lines.slice(cut.length - 1).join(' '), maxW);
  return cut;
}

// ---------------------------------------------------------------------------------------------------
// Buttons.

export type ButtonVariant = 'normal' | 'primary' | 'gold' | 'danger';

interface Palette {
  face: string;
  hover: string;
  hi: string;
  hoverHi: string;
  lo: string;
  pressed: string;
}

const PALETTES: Record<ButtonVariant, Palette> = {
  normal: {
    face: '#6b6b73',
    hover: '#7a8aa0',
    hi: '#9a9aa4',
    hoverHi: '#a9bdd6',
    lo: '#3a3a42',
    pressed: '#55555d',
  },
  primary: {
    face: '#4a9a3a',
    hover: '#5cb447',
    hi: '#86d860',
    hoverHi: '#aef585',
    lo: '#27631f',
    pressed: '#3c8030',
  },
  gold: {
    face: '#b8892a',
    hover: '#d0a03a',
    hi: '#f2c860',
    hoverHi: '#ffe48a',
    lo: '#6e4c12',
    pressed: '#9a7220',
  },
  danger: {
    face: '#a8403a',
    hover: '#c4524a',
    hi: '#e0807a',
    hoverHi: '#f2a29c',
    lo: '#5a1c18',
    pressed: '#8a322c',
  },
};

export interface ButtonStyle {
  variant?: ButtonVariant;
  /** Button was just activated (drawn pushed in). */
  pressed?: boolean;
  /** Keyboard / gamepad focus ring. */
  focused?: boolean;
  /** Seconds, drives the focus ring pulse. */
  tick?: number;
  icon?: IconName;
  /** Small red badge on the corner ("!" or a count). */
  badge?: string | null;
  /** 'left' puts icon and label against the left padding (menu lists); default centred. */
  align?: 'center' | 'left';
  /** Draw only the icon (the label is then a tooltip / accessible name). */
  iconOnly?: boolean;
  /** Text colour override. */
  color?: string;
}

/** Button with all states; `label` is drawn centred (with an optional icon in front of it). */
export function drawButton(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  label: string,
  hover: boolean,
  disabled = false,
  style: ButtonStyle = {},
): void {
  const { x, y, w, h } = r;
  if (w < 4 || h < 4) return;
  const pal = PALETTES[style.variant ?? 'normal'];
  const pressed = !!style.pressed && !disabled;
  const lit = hover && !disabled;
  ctx.fillStyle = UI.ink;
  ctx.fillRect(x, y, w, h);
  const face = disabled ? '#3b3b40' : pressed ? pal.pressed : lit ? pal.hover : pal.face;
  ctx.fillStyle = face;
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  if (!disabled) {
    // Faint horizontal grain so big buttons are not flat.
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(x + 1, y + 1, w - 2, Math.max(1, Math.floor((h - 2) / 2)));
  }
  if (disabled) {
    ctx.fillStyle = '#4a4a50';
    ctx.fillRect(x + 1, y + 1, w - 2, 1);
  } else if (pressed) {
    ctx.fillStyle = pal.lo;
    ctx.fillRect(x + 1, y + 1, w - 2, 2);
    ctx.fillRect(x + 1, y + 1, 1, h - 2);
  } else {
    ctx.fillStyle = lit ? pal.hoverHi : pal.hi;
    ctx.fillRect(x + 1, y + 1, w - 2, 1);
    ctx.fillRect(x + 1, y + 1, 1, h - 2);
    ctx.fillStyle = pal.lo;
    ctx.fillRect(x + 1, y + h - 3, w - 2, 2);
    ctx.fillRect(x + w - 2, y + 1, 1, h - 2);
  }
  if (lit && !pressed) {
    // Hover rim: a bright 1 px outline like the vanilla button.
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(x, y, w, 1);
    ctx.fillRect(x, y + h - 1, w, 1);
    ctx.fillRect(x, y, 1, h);
    ctx.fillRect(x + w - 1, y, 1, h);
  }
  // Content: [icon] label, centred (or left aligned).
  const dy = pressed ? 1 : 0;
  const textColor = style.color ?? (disabled ? '#888' : '#fff');
  const iconW = style.icon ? 12 : 0;
  const gap = style.icon && !style.iconOnly && label ? 3 : 0;
  const pad = 4;
  const room = w - pad * 2 - iconW - gap;
  const text = style.iconOnly ? '' : fitText(label, Math.max(8, room));
  const tw = text ? textWidth(text) : 0;
  const total = iconW + gap + tw;
  const left = style.align === 'left' ? x + pad + 1 : x + Math.floor((w - total) / 2);
  const base = y + Math.floor(h / 2) + 3 + dy;
  if (style.icon) {
    if (disabled) ctx.globalAlpha = 0.45;
    drawIcon(ctx, style.icon, left, y + Math.floor((h - 12) / 2) + dy);
    ctx.globalAlpha = 1;
  }
  if (text) drawText(ctx, text, left + iconW + gap, base, textColor);
  if (style.badge) drawBadge(ctx, x + w - 5, y - 3, style.badge);
  if (style.focused && !disabled) {
    const pulse = Math.floor((style.tick ?? 0) * 3) % 2 === 0;
    ctx.fillStyle = pulse ? UI.gold : '#fff3a8';
    ctx.fillRect(x - 1, y - 1, w + 2, 1);
    ctx.fillRect(x - 1, y + h, w + 2, 1);
    ctx.fillRect(x - 1, y, 1, h);
    ctx.fillRect(x + w, y, 1, h);
  }
}

/** Red notification badge centred on (cx, cy + 4): "!" or a short count. */
export function drawBadge(ctx: CanvasRenderingContext2D, cx: number, cy: number, text: string): void {
  const tw = textWidth(text);
  const w = Math.max(9, tw + 5);
  const x = Math.round(cx - w / 2);
  ctx.fillStyle = UI.ink;
  ctx.fillRect(x, cy, w, 9);
  ctx.fillStyle = '#d63a30';
  ctx.fillRect(x + 1, cy + 1, w - 2, 7);
  ctx.fillStyle = '#ff7a6a';
  ctx.fillRect(x + 1, cy + 1, w - 2, 1);
  drawText(ctx, text, x + w / 2, cy + 7, '#fff', 'center');
}

// ---------------------------------------------------------------------------------------------------
// Tooltips and toasts.

/** Lines of a tooltip no wider than `maxW` (the first line is the heading when `title` is given). */
export function tooltipLines(text: string, maxW = 130): string[] {
  return wrapText(text, maxW, (t) => textWidth(t));
}

/** Tooltip box next to (x, y), kept inside the w x h screen. `accent` tints the rim (a rarity colour). */
export function drawTooltip(
  ctx: CanvasRenderingContext2D,
  lines: readonly string[],
  x: number,
  y: number,
  w: number,
  h: number,
  accent: string | null = null,
  title: string | null = null,
): void {
  const all = title ? [title, ...lines] : [...lines];
  if (all.length === 0) return;
  const tw = Math.max(...all.map((l) => textWidth(l)));
  const bw = tw + 8;
  const bh = all.length * 9 + 4;
  let bx = x + 8;
  let by = y + 10;
  if (bx + bw > w - 2) bx = Math.max(2, x - bw - 4);
  if (by + bh > h - 2) by = Math.max(2, y - bh - 4);
  bx = Math.max(2, Math.min(bx, w - bw - 2));
  ctx.fillStyle = accent ?? '#2a1250';
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = '#0c0614';
  ctx.fillRect(bx + 1, by + 1, bw - 2, bh - 2);
  ctx.fillStyle = 'rgba(70,30,140,0.35)';
  ctx.fillRect(bx + 1, by + 1, bw - 2, 1);
  all.forEach((l, i) =>
    drawText(ctx, l, bx + 4, by + 9 + i * 9, i === 0 && title ? (accent ?? UI.gold) : '#e8e0f8'),
  );
}

export interface ToastStyle {
  /** Seconds since the toast appeared (drives the slide and fade). */
  age?: number;
  life?: number;
  color?: string;
  icon?: IconName;
  /** Top of the resting position (default 6). */
  y?: number;
}

/** A banner toast centred at the top of a `w` px wide screen (slides in, fades out). */
export function drawToast(
  ctx: CanvasRenderingContext2D,
  w: number,
  text: string,
  style: ToastStyle = {},
): void {
  const age = style.age ?? 0.3;
  const life = style.life ?? 3;
  const alpha = toastAlpha(age, life);
  if (alpha <= 0) return;
  const iconW = style.icon ? 14 : 0;
  const tw = textWidth(text);
  const bw = Math.min(w - 8, tw + iconW + 14);
  const bx = Math.floor((w - bw) / 2);
  const by = (style.y ?? 6) + toastSlide(age);
  ctx.globalAlpha = alpha;
  drawPanel(ctx, { x: bx, y: by, w: bw, h: 16 }, false, style.color ?? UI.gold, 'oak');
  const left = bx + Math.floor((bw - tw - iconW) / 2);
  if (style.icon) drawIcon(ctx, style.icon, left, by + 2);
  drawText(ctx, fitText(text, bw - iconW - 10), left + iconW, by + 11, '#fff');
  ctx.globalAlpha = 1;
}
