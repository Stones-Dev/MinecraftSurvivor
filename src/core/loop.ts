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

  /** Frames left to skip logging after an error, so a persistent fault does not flood the console. */
  private quietFrames = 0;

  /**
   * `onError` receives anything thrown by update or render. The loop keeps running either way, so one bad frame
   * cannot freeze the game for good. The default logs with console.error, throttled to about once a second.
   */
  constructor(
    private readonly handlers: LoopHandlers,
    private readonly onError: (err: unknown) => void = (err) => this.logError(err),
  ) {}

  private logError(err: unknown): void {
    if (this.quietFrames > 0) return;
    this.quietFrames = 60;
    console.error(err);
  }

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
    // Schedule the next frame first: an exception below must never end the rAF chain.
    this.raf = requestAnimationFrame(this.frame);
    if (this.quietFrames > 0) this.quietFrames--;
    this.acc += Math.min((now - this.last) / 1000, 0.25) * this.timeScale;
    this.last = now;
    let steps = 0;
    try {
      while (this.acc >= STEP && steps < MAX_STEPS_PER_FRAME) {
        this.acc -= STEP;
        steps++;
        this.handlers.update(STEP);
      }
    } catch (err) {
      this.acc = 0; // do not let a faulting update pile up a backlog
      this.onError(err);
    }
    if (steps === MAX_STEPS_PER_FRAME) this.acc = 0;
    try {
      this.handlers.render(this.acc / STEP);
    } catch (err) {
      this.onError(err);
    }
  };
}
