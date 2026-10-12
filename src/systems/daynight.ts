/** Day/night cycle: 5-minute period, roughly 3 minutes of day and 2 of night (BRIEF section 7). */
export const DAY_PERIOD = 300;

function smooth(t: number): number {
  const k = Math.max(0, Math.min(1, t));
  return k * k * (3 - 2 * k);
}

/** 0 = full day, 1 = full night. */
export function nightFactor(t: number): number {
  const p = ((t % DAY_PERIOD) + DAY_PERIOD) % DAY_PERIOD;
  if (p < 160) return 0;
  if (p < 190) return smooth((p - 160) / 30);
  if (p < 280) return 1;
  return 1 - smooth((p - 280) / 20);
}

export function drawNight(ctx: CanvasRenderingContext2D, w: number, h: number, f: number): void {
  if (f <= 0.01) return;
  ctx.fillStyle = `rgba(12,18,56,${(0.55 * f).toFixed(3)})`;
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.3,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.65,
  );
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,8,${(0.5 * f).toFixed(3)})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}
