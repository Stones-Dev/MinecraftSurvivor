/**
 * Gamepad input (standard mapping): left stick or d-pad moves, the right stick aims in manual aim mode; by default A item, X / right bumper ability and
 * Start pause (rebindable in Settings > Controls, see `inputState.pad`). Menus keep A / Start = ok, B = back.
 */
import { stickAim } from './aim';
import { inputState, noteInputDevice, type InputSource } from './input';

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

/** Pure mapping of the right stick (standard axes 2 and 3) to a unit aim direction, null inside the dead zone. */
export function padAim(pad: PadLike): { x: number; y: number } | null {
  return stickAim(pad.axes[2] ?? 0, pad.axes[3] ?? 0);
}

/** The first connected gamepad, if any. */
export function firstPad(): PadLike | null {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
  for (const g of navigator.getGamepads()) if (g) return g;
  return null;
}

/** Highest button index a binding may use (standard mapping has 17 buttons), and the d-pad that is reserved. */
export const PAD_BUTTONS = 17;
const isDpad = (i: number): boolean => i >= 12 && i <= 15;

/**
 * Finds the next gamepad button the player presses, for rebinding. Buttons already held when it is created
 * (the A that opened the capture) are ignored until released; the d-pad is never reported (it moves).
 */
export class PadButtonCapture {
  private held = new Set<number>();

  constructor() {
    const pad = firstPad();
    pad?.buttons.forEach((b, i) => {
      if (b.pressed) this.held.add(i);
    });
  }

  /** The index of a newly pressed button this poll, or null. */
  poll(): number | null {
    const pad = firstPad();
    if (!pad) return null;
    let found: number | null = null;
    pad.buttons.forEach((b, i) => {
      if (!b.pressed) {
        this.held.delete(i);
      } else if (!this.held.has(i)) {
        this.held.add(i);
        if (found === null && !isDpad(i)) found = i;
      }
    });
    return found;
  }
}

export class GamepadInput implements InputSource {
  private prev = new Set<number>();
  private pressed = new Set<number>();
  /** True once any gamepad has been seen (used to show controller hints). */
  connected = false;

  private pad(): PadLike | null {
    return firstPad();
  }

  /** Poll once per simulation step: records which buttons went down since the last poll. */
  poll(): void {
    const pad = this.pad();
    if (!pad) {
      this.prev.clear();
      return;
    }
    this.connected = true;
    inputState.padConnected = true;
    inputState.padStyle = /054c|playstation|dualshock|dualsense|sony/i.test(
      (pad as { id?: string }).id ?? '',
    )
      ? 'playstation'
      : 'xbox';
    if (Math.hypot(pad.axes[0] ?? 0, pad.axes[1] ?? 0) > 0.5) noteInputDevice('pad');
    if (Math.hypot(pad.axes[2] ?? 0, pad.axes[3] ?? 0) > 0.5) noteInputDevice('pad');
    pad.buttons.forEach((btn, i) => {
      if (btn.pressed && !this.prev.has(i)) {
        this.pressed.add(i);
        noteInputDevice('pad');
      }
      if (btn.pressed) this.prev.add(i);
      else this.prev.delete(i);
    });
  }

  moveVector(): { x: number; y: number } {
    const pad = this.pad();
    return pad ? padMove(pad) : { x: 0, y: 0 };
  }
  aimVector(): { x: number; y: number } | null {
    const pad = this.pad();
    return pad ? padAim(pad) : null;
  }
  private any(buttons: readonly number[]): boolean {
    return buttons.some((i) => this.pressed.has(i));
  }

  pausePressed(): boolean {
    return this.any(inputState.pad.pause);
  }
  confirmPressed(): boolean {
    return this.pressed.has(0) || this.pressed.has(9);
  }
  cancelPressed(): boolean {
    return this.pressed.has(1);
  }
  activePressed(): boolean {
    return this.any(inputState.pad.item);
  }
  abilityPressed(): boolean {
    return this.any(inputState.pad.ability);
  }
  endStep(): void {
    this.pressed.clear();
  }
}
