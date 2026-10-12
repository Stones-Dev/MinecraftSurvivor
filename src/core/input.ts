/** Gameplay talks to an InputSource, never to the DOM, so touch can be added later (BRIEF 2). */
export interface InputSource {
  moveVector(): { x: number; y: number };
  pausePressed(): boolean;
  confirmPressed(): boolean;
  cancelPressed(): boolean;
  /** Use the equipped item (Space). */
  activePressed(): boolean;
  /** Clear one-shot presses; call once per simulation step. */
  endStep(): void;
}

export type Action = 'up' | 'down' | 'left' | 'right' | 'pause' | 'item';

export type Bindings = Record<Action, string[]>;

export const DEFAULT_BINDINGS: Bindings = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  pause: ['Escape', 'KeyP'],
  item: ['Space'],
};

export const ACTIONS: Action[] = ['up', 'down', 'left', 'right', 'pause', 'item'];

export class KeyboardInput implements InputSource {
  private down = new Set<string>();
  private pressed = new Set<string>();
  bindings: Bindings = structuredClone(DEFAULT_BINDINGS);

  /** Replace the key map (from Settings > Controls); missing actions keep their defaults. */
  setBindings(b: Partial<Bindings>): void {
    const next = structuredClone(DEFAULT_BINDINGS);
    for (const a of ACTIONS) {
      const keys = b[a];
      if (Array.isArray(keys) && keys.length > 0)
        next[a] = keys.filter((k) => typeof k === 'string');
    }
    this.bindings = next;
  }

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
    const b = this.bindings;
    const x = axis(b.left, b.right);
    const y = axis(b.up, b.down);
    const len = Math.hypot(x, y);
    return len > 0 ? { x: x / len, y: y / len } : { x: 0, y: 0 };
  }

  pausePressed(): boolean {
    return this.bindings.pause.some((k) => this.pressed.has(k));
  }

  confirmPressed(): boolean {
    return this.pressed.has('Enter') || this.pressed.has('Space');
  }

  cancelPressed(): boolean {
    return this.pressed.has('Escape');
  }

  activePressed(): boolean {
    return this.bindings.item.some((k) => this.pressed.has(k));
  }

  endStep(): void {
    this.pressed.clear();
  }
}
