import { afterEach, describe, expect, it } from 'vitest';
import { applyAccessibility, cb } from '../src/core/accessibility';
import { defaultSave } from '../src/core/save';
import type { Telegraph } from '../src/game';
import { drawTelegraph, telegraphPulse, TELEGRAPH_STRIP } from '../src/render/entities';

afterEach(() => applyAccessibility(defaultSave(1).settings));

/** A recording 2D context: alpha and fill/stroke colours at each fill/stroke, path points seen. */
function rec() {
  const log = {
    fills: [] as { alpha: number; color: string }[],
    strokes: [] as { alpha: number; color: string }[],
    pts: [] as [number, number][],
    arcs: [] as number[],
  };
  const st = { globalAlpha: 1, fillStyle: '', strokeStyle: '' } as Record<string, unknown>;
  const ctx = new Proxy(st, {
    get(t, k) {
      if (k in t) return t[k as string];
      if (k === 'fill')
        return () =>
          log.fills.push({ alpha: st.globalAlpha as number, color: String(st.fillStyle) });
      if (k === 'stroke')
        return () =>
          log.strokes.push({ alpha: st.globalAlpha as number, color: String(st.strokeStyle) });
      if (k === 'moveTo' || k === 'lineTo') return (x: number, y: number) => log.pts.push([x, y]);
      if (k === 'arc') return (_x: number, _y: number, r: number) => log.arcs.push(r);
      if (k === 'fillRect')
        return () =>
          log.fills.push({ alpha: st.globalAlpha as number, color: String(st.fillStyle) });
      return () => undefined;
    },
    set(t, k, v) {
      t[k as string] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, log, st };
}

const line = (t: number): Telegraph => ({
  kind: 'line',
  x: 10,
  y: 20,
  x2: 60,
  y2: 20,
  r: 0,
  t,
  dur: 1,
});
const circle = (t: number): Telegraph => ({
  kind: 'circle',
  x: 30,
  y: 30,
  x2: 0,
  y2: 0,
  r: 20,
  t,
  dur: 1,
});

describe('telegraphs', () => {
  it('draws a line as a 6 px strip with a translucent fill and a brighter edge', () => {
    const { ctx, log } = rec();
    drawTelegraph(ctx, line(0.5), 0, 0);
    // The corners are 3 px either side of the axis.
    const ys = log.pts.map((p) => p[1]);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(TELEGRAPH_STRIP, 6);
    expect(log.fills).toHaveLength(1);
    expect(log.fills[0]?.alpha).toBeGreaterThan(0.2);
    expect(log.fills[0]?.alpha).toBeLessThan(0.5);
    expect(log.strokes[0]?.alpha).toBeGreaterThan(log.fills[0]?.alpha ?? 1);
    expect(log.fills[0]?.color).toBe(cb('#ff3b3b'));
  });

  it('draws a circle as a filled disc plus a charge disc that grows to the edge', () => {
    const radii: number[] = [];
    for (const t of [0.1, 0.5, 0.95]) {
      const { ctx, log } = rec();
      drawTelegraph(ctx, circle(t), 0, 0);
      expect(log.arcs[0]).toBe(20); // the full area is always shaded
      radii.push(log.arcs[1] ?? 0);
    }
    expect(radii[0]).toBeLessThan(radii[1] ?? 0);
    expect(radii[1]).toBeLessThan(radii[2] ?? 0);
    expect(radii[2]).toBeLessThanOrEqual(20);
  });

  it('goes through the colour-blind remap', () => {
    const s = defaultSave(1).settings;
    s.accessibility.colorblind = 'deuteranopia';
    applyAccessibility(s);
    const { ctx, log } = rec();
    drawTelegraph(ctx, line(0.3), 0, 0);
    expect(log.fills[0]?.color).toBe(cb('#ff3b3b'));
    expect(cb('#ff3b3b')).not.toBe('#ff3b3b');
    const friendly = rec();
    drawTelegraph(friendly.ctx, { ...line(0.3), friendly: true }, 0, 0);
    expect(friendly.log.fills[0]?.color).toBe(cb('#7dd0ff'));
  });

  it('is steady with reduce flashing and only pulses slowly otherwise', () => {
    const s = defaultSave(1).settings;
    s.accessibility.reduceFlash = true;
    applyAccessibility(s);
    const alphas = new Set<number>();
    for (let i = 0; i < 40; i++) {
      const { ctx, log } = rec();
      drawTelegraph(ctx, line(0.5), 0, 0); // same progress, different wall time would not matter
      alphas.add(log.fills[0]?.alpha ?? 0);
      expect(telegraphPulse(i * 0.05, true)).toBe(1);
    }
    expect(alphas.size).toBe(1);
    // Pulse on: bounded to +-15% and well below the 3 Hz photosensitivity limit (period > 1 s).
    let min = 9;
    let max = 0;
    let crossings = 0;
    let prev = telegraphPulse(0, false) - 1;
    for (let i = 1; i <= 600; i++) {
      const v = telegraphPulse(i / 60, false);
      min = Math.min(min, v);
      max = Math.max(max, v);
      if (Math.sign(v - 1) !== Math.sign(prev) && prev !== 0) crossings++;
      prev = v - 1;
    }
    expect(min).toBeGreaterThanOrEqual(0.85 - 1e-9);
    expect(max).toBeLessThanOrEqual(1.15 + 1e-9);
    expect(crossings / 2 / 10).toBeLessThan(1.5); // cycles per second
  });
});
