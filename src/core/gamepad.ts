/** Gamepad input (standard mapping): left stick or d-pad moves, A item, X / right bumper ability, Start pause. */
import type { InputSource } from './input';

const DEADZONE = 0.22;

interface PadLike {
  axes: readonly number[];
  buttons: readonly { pressed: boolean }[];
}

/** Pure mapping of one pad state, used by GamepadInput and by tests. */
export function padMove(pad: PadLike): { x: number; y: number } {
  let x = pad.axes[0] ?? 0;
  let y = pad.axes[1] ?? 0;
  const d = Math.hypot(x, y);
  if (d < DEADZONE) {
    x = 0;
    y = 0;
  } else {
    const k = Math.min(1, (d - DEADZONE) / (1 - DEADZONE)) / d;
    x *= k;
    y *= k;
  }
  const b = (i: number): boolean => pad.buttons[i]?.pressed === true;
  if (b(14)) x -= 1;
  if (b(15)) x += 1;
  if (b(12)) y -= 1;
  if (b(13)) y += 1;
  const len = Math.hypot(x, y);
  return len > 1 ? { x: x / len, y: y / len } : { x, y };
}

export class GamepadInput implements InputSource {
  private prev = new Set<number>();
  private pressed = new Set<number>();
  /** True once any gamepad has been seen (used to show controller hints). */
  connected = false;

  private pad(): PadLike | null {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    for (const g of navigator.getGamepads()) if (g) return g;
    return null;
  }

  /** Poll once per simulation step: records which buttons went down since the last poll. */
  poll(): void {
    const pad = this.pad();
    if (!pad) {
      this.prev.clear();
      return;
    }
    this.connected = true;
    pad.buttons.forEach((btn, i) => {
      if (btn.pressed && !this.prev.has(i)) this.pressed.add(i);
      if (btn.pressed) this.prev.add(i);
      else this.prev.delete(i);
    });
  }

  moveVector(): { x: number; y: number } {
    const pad = this.pad();
    return pad ? padMove(pad) : { x: 0, y: 0 };
  }
  pausePressed(): boolean {
    return this.pressed.has(9);
  }
  confirmPressed(): boolean {
    return this.pressed.has(0) || this.pressed.has(9);
  }
  cancelPressed(): boolean {
    return this.pressed.has(1);
  }
  activePressed(): boolean {
    return this.pressed.has(0);
  }
  abilityPressed(): boolean {
    return this.pressed.has(2) || this.pressed.has(5);
  }
  endStep(): void {
    this.pressed.clear();
  }
}
