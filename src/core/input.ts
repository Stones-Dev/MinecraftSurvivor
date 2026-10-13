/** Gameplay talks to an InputSource, never to the DOM, so touch can be added later (BRIEF 2). */
export interface InputSource {
  moveVector(): { x: number; y: number };
  pausePressed(): boolean;
  confirmPressed(): boolean;
  cancelPressed(): boolean;
  /** Use the equipped item (Space). */
  activePressed(): boolean;
  /** Cast the hero ability (Q / Shift). Optional so simple test inputs need not implement it. */
  abilityPressed?(): boolean;
  /**
   * Manual aim stick (gamepad right stick, touch aim stick): a unit direction while deflected past its dead zone,
   * null otherwise. Optional; only read when Settings > Controls > Aim is Manual.
   */
  aimVector?(): { x: number; y: number } | null;
  /** Clear one-shot presses; call once per simulation step. */
  endStep(): void;
}

export type Action = 'up' | 'down' | 'left' | 'right' | 'pause' | 'item' | 'ability';

export type Bindings = Record<Action, string[]>;

export const DEFAULT_BINDINGS: Bindings = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  pause: ['Escape', 'KeyP'],
  item: ['Space'],
  ability: ['KeyQ', 'ShiftLeft'],
};

export const ACTIONS: Action[] = ['up', 'down', 'left', 'right', 'pause', 'item', 'ability'];

// ---------------------------------------------------------------------------------------------------
// Which device the player used last, and the bindings in force (read by the HUD for its prompts).

export type InputDevice = 'keyboard' | 'pad' | 'touch';

/** Actions a gamepad button can be bound to (movement stays on the stick and d-pad). */
export type PadAction = 'pause' | 'item' | 'ability';
export type PadBindings = Record<PadAction, number[]>;
export const PAD_ACTIONS: readonly PadAction[] = ['pause', 'item', 'ability'];

/** Standard-mapping buttons: A item, X / RB ability, Start pause (see gamepad.ts). */
export const DEFAULT_PAD_BINDINGS: PadBindings = { pause: [9], item: [0], ability: [2, 5] };

/** Key under which a gamepad binding is stored in `settings.controls` (the save keeps any string list there). */
export const padControlKey = (a: PadAction): string => `pad.${a}`;

/** A button index as stored in the save ("Pad2"). */
export const encodePadButton = (i: number): string => `Pad${i}`;

/** Parse stored gamepad bindings out of `settings.controls`; missing or invalid entries keep their defaults. */
export function parsePadBindings(
  controls: Readonly<Record<string, readonly string[] | undefined>>,
): PadBindings {
  const out: PadBindings = structuredClone(DEFAULT_PAD_BINDINGS);
  for (const a of PAD_ACTIONS) {
    const raw = controls[padControlKey(a)];
    if (!Array.isArray(raw)) continue;
    const nums = raw
      .map((k) => /^Pad(\d{1,2})$/.exec(String(k))?.[1])
      .filter((v): v is string => v !== undefined)
      .map(Number)
      .filter((n) => n >= 0 && n < 17);
    if (nums.length > 0) out[a] = nums;
  }
  return out;
}

/** Shared, mutable view of the input state: filled by the input classes, read by the HUD and Settings. */
export const inputState: {
  device: InputDevice;
  /** A gamepad has been seen this session. */
  padConnected: boolean;
  /** Button naming of the connected pad. */
  padStyle: 'xbox' | 'playstation';
  keys: Bindings;
  pad: PadBindings;
} = {
  device: 'keyboard',
  padConnected: false,
  padStyle: 'xbox',
  keys: structuredClone(DEFAULT_BINDINGS),
  pad: structuredClone(DEFAULT_PAD_BINDINGS),
};

/** Record the device that produced the latest input. */
export function noteInputDevice(d: InputDevice): void {
  inputState.device = d;
}

/** Back to the defaults (tests). */
export function resetInputState(): void {
  inputState.device = 'keyboard';
  inputState.padConnected = false;
  inputState.padStyle = 'xbox';
  inputState.keys = structuredClone(DEFAULT_BINDINGS);
  inputState.pad = structuredClone(DEFAULT_PAD_BINDINGS);
}

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
    inputState.keys = structuredClone(next);
    // Gamepad bindings travel in the same settings.controls object under `pad.<action>` keys, so the one
    // applySettings call reaches both devices.
    inputState.pad = parsePadBindings(b as Record<string, readonly string[] | undefined>);
  }

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      noteInputDevice('keyboard');
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

  abilityPressed(): boolean {
    return this.bindings.ability.some((k) => this.pressed.has(k));
  }

  endStep(): void {
    this.pressed.clear();
  }
}

/** Combines several input sources (keyboard, gamepad, touch): movement is summed and clamped, presses are ORed. */
export class MergedInput implements InputSource {
  constructor(private readonly sources: InputSource[]) {}

  moveVector(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    for (const s of this.sources) {
      const v = s.moveVector();
      x += v.x;
      y += v.y;
    }
    const len = Math.hypot(x, y);
    return len > 1 ? { x: x / len, y: y / len } : { x, y };
  }
  pausePressed(): boolean {
    return this.sources.some((s) => s.pausePressed());
  }
  confirmPressed(): boolean {
    return this.sources.some((s) => s.confirmPressed());
  }
  cancelPressed(): boolean {
    return this.sources.some((s) => s.cancelPressed());
  }
  activePressed(): boolean {
    return this.sources.some((s) => s.activePressed());
  }
  abilityPressed(): boolean {
    return this.sources.some((s) => s.abilityPressed?.() === true);
  }
  /** The first source with a deflected aim stick (touch and pad are rarely used together). */
  aimVector(): { x: number; y: number } | null {
    for (const s of this.sources) {
      const v = s.aimVector?.();
      if (v) return v;
    }
    return null;
  }
  endStep(): void {
    for (const s of this.sources) s.endStep();
  }
}
