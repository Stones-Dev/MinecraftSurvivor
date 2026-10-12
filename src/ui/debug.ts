/** F3-style debug overlay (BRIEF Phase 1). */
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

export function drawDebug(ctx: CanvasRenderingContext2D, lines: string[]): void {
  ctx.font = '8px "Pixelify Sans", monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(2, 2, 150, lines.length * 9 + 3);
  ctx.fillStyle = '#e6ffe6';
  lines.forEach((line, i) => ctx.fillText(line, 4, 4 + i * 9));
  ctx.textBaseline = 'alphabetic';
}
