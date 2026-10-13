import { describe, expect, it } from 'vitest';
import { BIOME_IDS, BIOMES } from '../src/world/biomes';
import {
  HUD_PLATE_ALPHA,
  HUD_TEXT,
  VIGNETTE_AMP,
  VIGNETTE_BASE,
  VIGNETTE_HZ,
  lowHpVignetteAlpha,
  plateContrast,
} from '../src/ui/hudModel';
import { fitText, textPlateRect, textWidth } from '../src/ui/panel';
import { layoutStatusTags } from '../src/ui/hud';

describe('low-HP vignette alpha', () => {
  it('is a static frame with reduce flashing: the same alpha at every time', () => {
    const a = lowHpVignetteAlpha(0, true);
    for (let t = 0; t < 10; t += 0.0137) expect(lowHpVignetteAlpha(t, true)).toBe(a);
    expect(a).toBe(VIGNETTE_BASE);
  });

  it('otherwise breathes softly: low amplitude, never above 1 Hz', () => {
    expect(VIGNETTE_HZ).toBeLessThanOrEqual(1);
    expect(VIGNETTE_AMP).toBeLessThanOrEqual(0.08);
    let lo = Infinity;
    let hi = -Infinity;
    let crossings = 0;
    let prev = lowHpVignetteAlpha(0, false) - VIGNETTE_BASE;
    for (let t = 0.001; t < 10; t += 0.001) {
      const a = lowHpVignetteAlpha(t, false);
      lo = Math.min(lo, a);
      hi = Math.max(hi, a);
      const d = a - VIGNETTE_BASE;
      if (prev < 0 && d >= 0) crossings++;
      prev = d;
    }
    expect(hi - lo).toBeLessThanOrEqual(0.12); // peak to peak well under a visible flash
    expect(lo).toBeGreaterThan(0.2); // never fades out and back in
    expect(hi).toBeLessThan(0.5);
    expect(crossings / 10).toBeLessThanOrEqual(1); // cycles per second
  });
});

describe('HUD text plate', () => {
  /** Every colour the terrain painter can put under the HUD, plus pure white as the worst case. */
  const backgrounds: [string, readonly [number, number, number]][] = [['white', [255, 255, 255]]];
  for (const id of BIOME_IDS) {
    const b = BIOMES[id];
    for (const [i, c] of [...b.grass, ...b.dirt, ...b.sand, ...b.water].entries())
      backgrounds.push([`${id}#${i}`, c]);
  }

  it('keeps every HUD text colour at 4.5:1 or better over any biome colour', () => {
    expect(HUD_PLATE_ALPHA).toBeGreaterThan(0.6);
    for (const [name, color] of Object.entries(HUD_TEXT)) {
      for (const [bg, rgb] of backgrounds) {
        expect(plateContrast(color, rgb), `${name} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('a bare label would not have: Hunger over desert sand is about 1.2:1 without the plate', () => {
    const sand = BIOMES.desert.sand[0];
    const lum = (c: readonly number[]): number => {
      const l = c.map((v) => {
        const x = v / 255;
        return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * (l[0] ?? 0) + 0.7152 * (l[1] ?? 0) + 0.0722 * (l[2] ?? 0);
    };
    const hunger = [0xe6, 0xd2, 0x7a];
    const ratio = (lum(hunger) + 0.05) / (lum(sand) + 0.05);
    expect(ratio).toBeLessThan(1.6);
  });

  it('textPlateRect pads the text and follows the alignment and scale', () => {
    const left = textPlateRect(10, 20, 30, 'left');
    const center = textPlateRect(10, 20, 30, 'center');
    const right = textPlateRect(10, 20, 30, 'right');
    expect(left.x).toBeLessThan(10);
    expect(left.w).toBeGreaterThan(30);
    expect(center.x).toBeLessThan(left.x);
    expect(right.x).toBeLessThan(center.x);
    const big = textPlateRect(10, 20, 60, 'left', 2);
    expect(big.h).toBeGreaterThan(left.h);
    // The plate covers the baseline row of the glyphs.
    expect(left.y).toBeLessThan(20);
    expect(left.y + left.h).toBeGreaterThan(20);
  });
});

describe('status tag layout', () => {
  it('keeps tags on one row while they fit and wraps the rest under the hearts', () => {
    // Bad Omen, Regen and Hero chips after Hunger and Slow at 320 px: the third would reach the counters.
    const widths = [72, 56, 50];
    const spots = layoutStatusTags(widths, 189, 320 - 58);
    expect(spots[0]).toEqual({ x: 189, row: 0 });
    expect(spots[1]).toEqual({ x: 4, row: 1 });
    expect(spots[2]).toEqual({ x: 4 + 56 + 6, row: 1 });
    for (const [i, w] of widths.entries()) {
      const s = spots[i];
      expect((s?.x ?? 0) + w).toBeLessThanOrEqual(320 - 58);
    }
    // Plenty of room: a single row, spaced by the gap.
    expect(layoutStatusTags([40, 40], 100, 262)).toEqual([
      { x: 100, row: 0 },
      { x: 146, row: 0 },
    ]);
    // The first tag always stays where it is, even when it alone is too wide (the caller cuts it).
    expect(layoutStatusTags([300], 189, 262)[0]).toEqual({ x: 189, row: 0 });
    expect(layoutStatusTags([], 189, 262)).toEqual([]);
  });

  it('fits every v1.4 banner and boss-bar line on a 320 px screen', () => {
    const lines = [
      'Pillager Outpost freed: it follows you for this run',
      'Pillager Outpost is free and leaves you a Spawn Egg',
      'Crystals 6/6 - perched: melee, arrows bounce',
      'Crystal overload! The dragon is grounded!',
      'HERO OF THE VILLAGE! Half-price services',
      'The End: mind the void, break the crystals',
    ];
    for (const l of lines) expect(textWidth(fitText(l, 320 - 12))).toBeLessThanOrEqual(308);
    for (const l of lines) expect(textWidth(l) + 4).toBeLessThanOrEqual(320 - 8);
  });
});
