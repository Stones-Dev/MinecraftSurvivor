/** Canvas UI primitives: stone-style panels, grey buttons, pixel text (original look, not Minecraft textures). */
import { drawGlyphs, textWidth, type TextAlign } from './font';

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

export function drawPanel(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  hot = false,
  accent: string | null = null,
): void {
  const { x, y, w, h } = r;
  ctx.fillStyle = accent ?? '#101014';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = hot ? '#3a4a5e' : '#2c2c34';
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = hot ? '#7fa3d1' : '#585863';
  ctx.fillRect(x + 1, y + 1, w - 2, 1);
  ctx.fillRect(x + 1, y + 1, 1, h - 2);
  ctx.fillStyle = '#18181d';
  ctx.fillRect(x + 1, y + h - 2, w - 2, 1);
  ctx.fillRect(x + w - 2, y + 1, 1, h - 2);
}

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

export function drawButton(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  label: string,
  hover: boolean,
  disabled = false,
): void {
  ctx.fillStyle = '#101014';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = disabled ? '#3b3b40' : hover ? '#7a8aa0' : '#6b6b73';
  ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  ctx.fillStyle = disabled ? '#4a4a50' : hover ? '#a9bdd6' : '#9a9aa4';
  ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, 1);
  ctx.fillStyle = '#3a3a42';
  ctx.fillRect(r.x + 1, r.y + r.h - 2, r.w - 2, 1);
  drawText(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + 3, disabled ? '#888' : '#fff', 'center');
}
