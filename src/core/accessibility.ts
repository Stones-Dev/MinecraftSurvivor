/**
 * Accessibility state shared by the renderers (Settings > Accessibility).
 *
 * `applyAccessibility(settings)` is called from `app.applySettings()`; draw code then asks:
 *   cb(color)        a colour-blind-safe replacement for the few critical colour-coded cues
 *   reduceFlash()    true -> no full-screen flashes, hit-flash silhouettes or strobing blinks
 *   cameraLead()     camera look-ahead on/off
 *   textScale()      1 or 2 (only the HUD scales; see DECISIONS)
 *
 * Only a short list of cue colours is remapped (enemy telegraphs, boss bar, low-HP vignette and
 * rarity colours); everything else passes through unchanged so the art keeps its look. The safe
 * palettes were chosen with the Machado et al. (2009) colour-vision-deficiency simulation below, and
 * `tests/accessibility.test.ts` checks that the cues stay distinguishable under it.
 */
import type { ColorblindMode, SaveData, TouchControlsMode } from './save';

export type Settings = SaveData['settings'];

interface State {
  colorblind: ColorblindMode;
  reduceFlash: boolean;
  cameraLead: boolean;
  textScale: 1 | 2;
}

const state: State = { colorblind: 'off', reduceFlash: false, cameraLead: true, textScale: 1 };

export function applyAccessibility(settings: Settings): void {
  state.colorblind = settings.accessibility.colorblind;
  state.reduceFlash = settings.accessibility.reduceFlash;
  state.textScale = settings.accessibility.textScale;
  state.cameraLead = settings.cameraLead;
}

export const colorblindMode = (): ColorblindMode => state.colorblind;
export const reduceFlash = (): boolean => state.reduceFlash;
export const cameraLead = (): boolean => state.cameraLead;
export const textScale = (): 1 | 2 => state.textScale;

// ---------- palette remapping ----------

/** Source colour (lower-case #rrggbb) -> replacement, per mode. Colours not listed are unchanged. */
type Remap = Record<string, string>;

/**
 * Rarity colours: one palette that stays apart under protanopia, deuteranopia and tritanopia
 * (a green/blue/purple/gold ladder collapses into two or three hues for red-green deficiencies).
 */
const RARITY: Remap = {
  '#a8a8b4': '#a8a8b4', // common (grey)
  '#5fd068': '#28ffa0', // uncommon
  '#4aa0ff': '#a028ff', // rare
  '#b06bff': '#f078ff', // epic
  '#ffc83a': '#ff7828', // legendary
  // Level-up card borders (overlays.ts).
  '#3b78d8': '#a028ff',
  '#a24ad8': '#f078ff',
  '#e8b923': '#ff7828',
};

/** Red "danger" cues become violet for red-green deficiencies (red melts into the green terrain). */
const DANGER_RG: Remap = {
  '#ff3b3b': '#c030ff', // hostile telegraph
  '#e04040': '#c030ff', // boss bar fill
  '#5a1a1a': '#3a1060', // boss bar background
  '#ffd0d0': '#ecc8ff', // boss name
  '#a00000': '#6010a0', // low-HP vignette
};

const TABLES: Record<Exclude<ColorblindMode, 'off'>, Remap> = {
  protanopia: { ...RARITY, ...DANGER_RG },
  deuteranopia: { ...RARITY, ...DANGER_RG },
  // Red stays readable for tritanopes; only the rarity ladder needs separating.
  tritanopia: { ...RARITY },
};

/** `color` as the current colour-blind mode wants it (identity when the mode is off). */
export function cbFor(mode: ColorblindMode, color: string): string {
  if (mode === 'off') return color;
  return TABLES[mode][color.toLowerCase()] ?? color;
}

/** Colour-blind-safe version of a critical cue colour (`#rrggbb`), for the current setting. */
export function cb(color: string): string {
  return cbFor(state.colorblind, color);
}

/** `cb(hex)` with an alpha, as an `rgba()` string (gradients and translucent overlays). */
export function cbAlpha(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(cb(hex));
  return `rgba(${r},${g},${b},${alpha})`;
}

// ---------- touch controls ----------

/** Whether the on-screen touch controls are shown: 'on' always, 'off' never, 'auto' on coarse pointers or after a touch. */
export function touchEnabled(
  mode: TouchControlsMode,
  coarsePointer: boolean,
  touchedYet: boolean,
): boolean {
  return mode === 'on' || (mode === 'auto' && (coarsePointer || touchedYet));
}

/** `(pointer: coarse)` media query (false where unsupported). */
export function coarsePointer(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

// ---------- colour-vision-deficiency simulation (tests and tooling) ----------

type Mat = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
];

/** Machado, Oliveira & Fernandes (2009), severity 1.0, applied in linear RGB. */
const CVD: Record<Exclude<ColorblindMode, 'off'>, Mat> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

export function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toLinear = (c: number): number => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

/** CIE Lab of a colour as seen with `mode` ('off' = normal vision). */
export function labOf(mode: ColorblindMode, hex: string): [number, number, number] {
  let [r, g, b] = parseHex(hex).map(toLinear) as [number, number, number];
  if (mode !== 'off') {
    const m = CVD[mode];
    const clamp = (v: number): number => Math.max(0, Math.min(1, v));
    [r, g, b] = [
      clamp(m[0][0] * r + m[0][1] * g + m[0][2] * b),
      clamp(m[1][0] * r + m[1][1] * g + m[1][2] * b),
      clamp(m[2][0] * r + m[2][1] * g + m[2][2] * b),
    ];
  }
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** Perceptual distance (CIE76 delta E) between two colours as seen with `mode`. */
export function colorDistance(mode: ColorblindMode, a: string, b: string): number {
  const la = labOf(mode, a);
  const lb = labOf(mode, b);
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
}
