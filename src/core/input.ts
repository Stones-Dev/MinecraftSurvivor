/** Gameplay talks to an InputSource, never to the DOM, so touch can be added later (BRIEF 2). */
export interface InputSource {
  moveVector(): { x: number; y: number };
  pausePressed(): boolean;
  confirmPressed(): boolean;
  cancelPressed(): boolean;
  /** Clear one-shot presses; call once per simulation step. */
  endStep(): void;
}

export class KeyboardInput implements InputSource {
  private down = new Set<string>();
  private pressed = new Set<string>();

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    target.addEventListener('keyup', (e) => this.down.delete(e.code));
    target.addEventListener('blur', () => this.down.clear());
  }

  moveVector(): { x: number; y: number } {
    const axis = (neg: string[], pos: string[]): number =>
      (pos.some((k) => this.down.has(k)) ? 1 : 0) - (neg.some((k) => this.down.has(k)) ? 1 : 0);
    const x = axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']);
    const y = axis(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']);
    const len = Math.hypot(x, y);
    return len > 0 ? { x: x / len, y: y / len } : { x: 0, y: 0 };
  }

  pausePressed(): boolean {
    return this.pressed.has('Escape') || this.pressed.has('KeyP');
  }

  confirmPressed(): boolean {
    return this.pressed.has('Enter') || this.pressed.has('Space');
  }

  cancelPressed(): boolean {
    return this.pressed.has('Escape');
  }

  endStep(): void {
    this.pressed.clear();
  }
}
