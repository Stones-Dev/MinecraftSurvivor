/** F3-style debug overlay (BRIEF Phase 1). */
import { ASCENT } from './font';
import { LINE_HEIGHT, drawText } from './panel';

export class FrameStats {
  fps = 60;
  ms = 16.7;
  private last = 0;

  tick(now: number): void {
    if (this.last > 0) {
      const d = Math.min(now - this.last, 250);
      this.ms += (d - this.ms) * 0.1;
      this.fps = 1000 / this.ms;
    }
    this.last = now;
  }
}

export function drawDebug(ctx: CanvasRenderingContext2D, lines: string[], x0 = 2, y0 = 2): void {
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x0, y0, 150, lines.length * LINE_HEIGHT + 3);
  lines.forEach((line, i) =>
    drawText(ctx, line, x0 + 2, y0 + 2 + ASCENT + i * LINE_HEIGHT, '#e6ffe6'),
  );
}
