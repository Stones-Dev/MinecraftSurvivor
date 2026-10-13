/**
 * Names of keys and gamepad buttons for on-screen prompts (HUD hints, Settings > Controls). Pure: the HUD
 * asks `actionPrompt` which text to show for the device the player used last.
 */
import { inputState, type InputDevice, type PadBindings, type Bindings } from '../core/input';

/** Short, upper-case name of a `KeyboardEvent.code` ("KeyQ" -> "Q", "Space" -> "SPACE", "ShiftLeft" -> "SHIFT"). */
export function keyLabel(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return `NUM${code.slice(6)}`;
  if (/^F\d{1,2}$/.test(code)) return code;
  const named: Record<string, string> = {
    Space: 'SPACE',
    ShiftLeft: 'SHIFT',
    ShiftRight: 'SHIFT',
    ControlLeft: 'CTRL',
    ControlRight: 'CTRL',
    AltLeft: 'ALT',
    AltRight: 'ALT',
    Enter: 'ENTER',
    NumpadEnter: 'ENTER',
    Tab: 'TAB',
    Escape: 'ESC',
    Backspace: 'BKSP',
    ArrowUp: 'UP',
    ArrowDown: 'DOWN',
    ArrowLeft: 'LEFT',
    ArrowRight: 'RIGHT',
    Comma: ',',
    Period: '.',
    Slash: '/',
    Semicolon: ';',
    Quote: "'",
    Minus: '-',
    Equal: '=',
    Backquote: '`',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
  };
  return named[code] ?? code.toUpperCase();
}

const XBOX = [
  'A',
  'B',
  'X',
  'Y',
  'LB',
  'RB',
  'LT',
  'RT',
  'VIEW',
  'MENU',
  'L3',
  'R3',
  'UP',
  'DOWN',
  'LEFT',
  'RIGHT',
];
const PLAYSTATION = [
  'X',
  'O',
  'SQR',
  'TRI',
  'L1',
  'R1',
  'L2',
  'R2',
  'SHR',
  'OPT',
  'L3',
  'R3',
  'UP',
  'DOWN',
  'LEFT',
  'RIGHT',
];

/** Name of standard-mapping button `i` ("A", "RB", "MENU"; "X", "O", "SQR", "TRI" on a PlayStation pad). */
export function padButtonLabel(i: number, style: 'xbox' | 'playstation' = 'xbox'): string {
  return (style === 'playstation' ? PLAYSTATION : XBOX)[i] ?? `BTN${i}`;
}

export interface PromptSources {
  keys: Bindings;
  pad: PadBindings;
  padStyle: 'xbox' | 'playstation';
}

/**
 * The hint to print next to the ability or item button: the first bound key, the first bound pad button when
 * a pad was used last, or "TAP" on touch (the on-screen button is the icon there).
 */
export function actionPrompt(
  action: 'ability' | 'item',
  device: InputDevice = inputState.device,
  src: PromptSources = inputState,
): string {
  if (device === 'touch') return 'TAP';
  if (device === 'pad') return padButtonLabel(src.pad[action][0] ?? -1, src.padStyle);
  return keyLabel(src.keys[action][0] ?? '');
}

/** Settings > Controls label of an aim mode. */
export function aimModeLabel(mode: 'auto' | 'manual'): string {
  return mode === 'manual' ? 'Manual' : 'Auto';
}

/**
 * Short hint on how to aim in manual mode for the device used last (tutorial line, Settings hint): the mouse, the
 * right stick of a pad, or a drag on the right of the screen.
 */
export function aimHint(device: InputDevice = inputState.device): string {
  if (device === 'touch') return 'Drag on the right to aim';
  if (device === 'pad') return 'Aim with the right stick';
  return 'Aim with the mouse';
}
