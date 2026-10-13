import { afterEach, describe, expect, it } from 'vitest';
import { applyAccessibility } from '../src/core/accessibility';
import { defaultSave } from '../src/core/save';
import { MIN_TOUCH_CSS, TouchInput } from '../src/core/touch';
import { MAP_SIDE, minimapSlot } from '../src/ui/minimap';

/** Art-pixel view sizes: phones in both orientations at zoom 2, small windows, desktop at zoom 3. */
const VIEWS: { w: number; h: number; zoom: number }[] = [
  { w: 320, h: 180, zoom: 2 },
  { w: 333, h: 187, zoom: 2 },
  { w: 400, h: 180, zoom: 2 },
  { w: 422, h: 195, zoom: 2 },
  { w: 426, h: 240, zoom: 2 },
  { w: 195, h: 422, zoom: 2 },
  { w: 284, h: 150, zoom: 2 },
  { w: 480, h: 270, zoom: 3 },
  { w: 640, h: 360, zoom: 3 },
];

const circlesApart = (
  a: { x: number; y: number; hit: number },
  b: { x: number; y: number; hit: number },
): boolean => Math.hypot(a.x - b.x, a.y - b.y) > a.hit + b.hit;

afterEach(() => {
  const s = defaultSave(1).settings;
  s.accessibility.textScale = 1;
  applyAccessibility(s);
});

describe('touch button layout', () => {
  it('every button reacts to a finger within a 44 CSS px target', () => {
    const touch = new TouchInput();
    for (const v of VIEWS) {
      for (const b of touch.buttons(v.w, v.h, v.zoom)) {
        expect(b.hit * 2 * v.zoom, `${b.id} at ${v.w}x${v.h}`).toBeGreaterThanOrEqual(
          MIN_TOUCH_CSS,
        );
        expect(b.hit).toBeGreaterThanOrEqual(b.r);
      }
    }
  });

  it('the pause button is drawn at least 44 CSS px wide on phones (zoom 2)', () => {
    const touch = new TouchInput();
    for (const v of VIEWS.filter((x) => x.zoom === 2)) {
      const p = touch.buttons(v.w, v.h, v.zoom).find((b) => b.id === 'pause');
      expect(p?.r).toBeDefined();
      expect((p?.r ?? 0) * 2 * v.zoom).toBeGreaterThanOrEqual(MIN_TOUCH_CSS);
    }
  });

  it('pause is out of the stick zone (left 60% of the screen)', () => {
    const touch = new TouchInput();
    for (const v of VIEWS) {
      const p = touch.buttons(v.w, v.h, v.zoom).find((b) => b.id === 'pause');
      if (!p) throw new Error('no pause button');
      expect(p.x - p.hit, `${v.w}x${v.h}`).toBeGreaterThanOrEqual(v.w * 0.6);
    }
  });

  it('pause stays on screen and clear of the ability and item buttons, with normal and large text', () => {
    const touch = new TouchInput();
    for (const textScale of [1, 2] as const) {
      const s = defaultSave(1).settings;
      s.accessibility.textScale = textScale;
      applyAccessibility(s);
      for (const v of VIEWS) {
        const bs = touch.buttons(v.w, v.h, v.zoom);
        const p = bs.find((b) => b.id === 'pause');
        if (!p) throw new Error('no pause button');
        expect(p.x - p.hit).toBeGreaterThanOrEqual(0);
        expect(p.x + p.hit).toBeLessThanOrEqual(v.w);
        expect(p.y - p.hit).toBeGreaterThanOrEqual(0);
        expect(p.y + p.hit).toBeLessThanOrEqual(v.h);
        for (const o of bs.filter((b) => b.id !== 'pause')) {
          expect(circlesApart(p, o), `${o.id} at ${v.w}x${v.h} text x${textScale}`).toBe(true);
        }
      }
    }
  });

  it('pause never overlaps the minimap frame or its chip', () => {
    const touch = new TouchInput();
    for (const v of VIEWS) {
      for (const top of [56, 74]) {
        for (const visible of [true, false]) {
          const slot = minimapSlot(v.w, top, v.h, true, visible);
          const r = slot.map
            ? { x: slot.map.x - 2, y: slot.map.y - 2, w: MAP_SIDE + 4, h: MAP_SIDE + 4 }
            : slot.chip;
          if (!r) continue;
          const p = touch.buttons(v.w, v.h, v.zoom).find((b) => b.id === 'pause');
          if (!p) throw new Error('no pause button');
          const nx = Math.max(r.x, Math.min(p.x, r.x + r.w));
          const ny = Math.max(r.y, Math.min(p.y, r.y + r.h));
          expect(Math.hypot(p.x - nx, p.y - ny), `${v.w}x${v.h} top ${top}`).toBeGreaterThan(p.hit);
        }
      }
    }
  });

  it('a tap on the pause button pauses; a tap where it used to be (left edge) starts the stick instead', () => {
    const t = new TouchInput();
    const [w, h, zoom] = [426, 240, 2];
    const p = t.buttons(w, h, zoom).find((b) => b.id === 'pause');
    if (!p) throw new Error('no pause button');
    expect(t.pointerDown(1, 14, h / 2 - 20, w, h, zoom)).toBe(true);
    expect(t.pausePressed()).toBe(false);
    expect(t.stick()).not.toBeNull();
    t.pointerUp(1);
    // The edge of the finger area counts, one pixel outside does not.
    expect(t.pointerDown(2, p.x + p.hit - 0.5, p.y, w, h, zoom)).toBe(true);
    expect(t.pausePressed()).toBe(true);
    t.endStep();
    t.pointerUp(2);
    expect(t.buttonAt(p.x, p.y, w, h)).toBe(true);
    expect(t.buttonAt(p.x - p.hit - 1, p.y, w, h)).toBe(false);
  });

  it('the zoom learnt from a touch sizes the buttons for later hit tests', () => {
    const t = new TouchInput();
    t.pointerDown(1, 5, 5, 480, 270, 3);
    t.pointerUp(1);
    const learnt = t.buttons(480, 270);
    const explicit = t.buttons(480, 270, 3);
    expect(learnt).toEqual(explicit);
  });
});
