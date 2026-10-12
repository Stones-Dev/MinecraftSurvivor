import type { View } from '../core/canvas';

export interface Screen {
  enter?(): void;
  exit?(): void;
  update(dt: number): void;
  render(view: View, alpha?: number): void;
  onClick?(x: number, y: number): void;
  onMove?(x: number, y: number): void;
  onKey?(code: string): void;
  /** Mouse wheel / trackpad scroll (`dy` > 0 = down), for scrollable lists. */
  onWheel?(dy: number): void;
}

/** Screen stack: push for overlays (pause, level-up), replace for flow changes. */
export class Router {
  private stack: Screen[] = [];

  get top(): Screen | undefined {
    return this.stack[this.stack.length - 1];
  }

  push(screen: Screen): void {
    screen.enter?.();
    this.stack.push(screen);
  }

  pop(): void {
    this.stack.pop()?.exit?.();
  }

  /** Drop the whole stack and start from `screen`. */
  reset(screen: Screen): void {
    while (this.stack.length > 0) this.stack.pop()?.exit?.();
    this.push(screen);
  }

  replace(screen: Screen): void {
    this.pop();
    this.push(screen);
  }

  update(dt: number): void {
    this.top?.update(dt);
  }

  render(view: View, alpha = 1): void {
    for (const s of this.stack) s.render(view, alpha);
  }
}
