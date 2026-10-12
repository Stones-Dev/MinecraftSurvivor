/** Fixed 60 Hz simulation with a variable-rate render (docs/PLAN.md 2.3). */
export const STEP = 1 / 60;
const MAX_STEPS_PER_FRAME = 5;

export interface LoopHandlers {
  update(dt: number): void;
  /** `alpha` is how far (0..1) the clock is into the next fixed step: blend previous and current state with it. */
  render(alpha: number): void;
}

export class Loop {
  timeScale = 1;
  private acc = 0;
  private last = 0;
  private raf = 0;
  private running = false;

  constructor(private readonly handlers: LoopHandlers) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    this.acc += Math.min((now - this.last) / 1000, 0.25) * this.timeScale;
    this.last = now;
    let steps = 0;
    while (this.acc >= STEP && steps < MAX_STEPS_PER_FRAME) {
      this.handlers.update(STEP);
      this.acc -= STEP;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.acc = 0;
    this.handlers.render(this.acc / STEP);
    this.raf = requestAnimationFrame(this.frame);
  };
}
