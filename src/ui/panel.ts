/** Canvas UI primitives: stone-style panels, grey buttons, pixel text (original look, not Minecraft textures). */
export const UI_FONT = '8px "Pixelify Sans", monospace';

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

export function drawText(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  color = '#fff',
  align: CanvasTextAlign = 'left',
): void {
  ctx.font = UI_FONT;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#000';
  ctx.fillText(s, Math.round(x) + 1, Math.round(y) + 1);
  ctx.fillStyle = color;
  ctx.fillText(s, Math.round(x), Math.round(y));
}

/** Greedy word wrap using the UI font. */
export function wrap(ctx: CanvasRenderingContext2D, s: string, maxW: number): string[] {
  ctx.font = UI_FONT;
  const lines: string[] = [];
  let line = '';
  for (const word of s.split(' ')) {
    const trial = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(trial).width > maxW) {
      lines.push(line);
      line = word;
    } else {
      line = trial;
    }
  }
  if (line) lines.push(line);
  return lines;
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
