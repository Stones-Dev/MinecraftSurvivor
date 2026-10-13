/** Pure HUD numbers (no canvas): the low-HP vignette, the text plate and its contrast. */
import { parseHex } from '../core/accessibility';

/** The vignette shows below this share of max HP. */
export const LOW_HP_FRACTION = 0.3;

/** Steady alpha of the low-HP vignette edge (also used for the whole effect when flashing is reduced). */
export const VIGNETTE_BASE = 0.36;
/** Breathing amplitude and rate: +-0.05 alpha at 0.5 Hz, far from anything that reads as a flash (WCAG 2.3.1). */
export const VIGNETTE_AMP = 0.05;
export const VIGNETTE_HZ = 0.5;

/** Alpha of the red edge vignette at game time `time`: a static frame with "reduce flashing", else a slow soft swell. */
export function lowHpVignetteAlpha(time: number, reduceFlash: boolean): number {
  if (reduceFlash) return VIGNETTE_BASE;
  return VIGNETTE_BASE + VIGNETTE_AMP * Math.sin(2 * Math.PI * VIGNETTE_HZ * time);
}

/** Opacity of the dark plate drawn behind HUD text (rgb 8, 8, 14). */
export const HUD_PLATE_ALPHA = 0.78;
export const HUD_PLATE_RGB: readonly [number, number, number] = [8, 8, 14];

/** The HUD text colours that sit directly on the world (no panel behind them). */
export const HUD_TEXT = {
  level: '#d8ffc0',
  hunger: '#e6d27a',
  slow: '#8fc4ff',
  timer: '#ffffff',
  kills: '#ffffff',
  emeralds: '#7dff9a',
  rift: '#ff9a3a',
  golden: '#ffd84a',
  abilityKey: '#8ee8ff',
  itemKey: '#ffe27a',
  boss: '#ffd0d0',
} as const;

const lin = (c: number): number => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance of an `[r, g, b]` colour (0..255). */
export function luminance(rgb: readonly [number, number, number]): number {
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}

/** WCAG contrast ratio between two luminances (1..21). */
export function contrast(l1: number, l2: number): number {
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

/** Contrast of `textHex` on `bgRgb` seen through the HUD plate (the plate is composited over the background). */
export function plateContrast(textHex: string, bgRgb: readonly [number, number, number]): number {
  const a = HUD_PLATE_ALPHA;
  const bg = [0, 1, 2].map((i) =>
    Math.round((bgRgb[i] ?? 0) * (1 - a) + (HUD_PLATE_RGB[i] ?? 0) * a),
  ) as [number, number, number];
  return contrast(luminance(parseHex(textHex)), luminance(bg));
}
