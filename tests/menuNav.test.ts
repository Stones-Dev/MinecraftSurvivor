import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TouchInput } from '../src/core/touch';
import { FocusTracker, type FocusItem } from '../src/ui/hubModel';
import { HitList } from '../src/ui/metaWidgets';
import { CHIP_SIDE, MAP_SIDE, TOUCH_MIN_HEIGHT, minimapSlot, slotHit } from '../src/ui/minimap';
import { spawnerLayout } from '../src/ui/spawnerLayout';
import { PadNav } from '../src/ui/widgets';

type R = { x: number; y: number; w: number; h: number };
const overlap = (a: R, b: R): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const item = (id: string, x: number, y: number, enabled = true): FocusItem => ({
  id,
  x,
  y,
  w: 10,
  h: 10,
  enabled,
});

describe('FocusTracker', () => {
  const grid = [item('a', 0, 0), item('b', 20, 0), item('c', 0, 20), item('d', 20, 20, false)];

  it('stays hidden until the first press, which only shows the ring', () => {
    const f = new FocusTracker();
    expect(f.focusedId).toBeNull();
    expect(f.move(grid, 'down')).toBe(0);
    expect(f.focusedId).toBe('a');
    expect(f.move(grid, 'right')).toBe(1);
    expect(f.move(grid, 'down')).toBe(2); // 'd' is disabled
    expect(f.focusedId).toBe('c');
  });

  it('prefers the requested id and skips disabled ones', () => {
    const f = new FocusTracker();
    expect(f.focusFirst(grid, 'b')).toBe(1);
    expect(f.focusFirst(grid, 'd')).toBe(0); // disabled: falls back to the first enabled
  });

  it('hands the ring to the nearest target when its own vanishes', () => {
    const f = new FocusTracker();
    f.focusFirst(grid, 'c');
    const without = [item('a', 0, 0), item('b', 20, 0), item('e', 0, 30)];
    expect(f.sync(without)).toBe(2); // 'e' is the closest to where 'c' was
    expect(f.focusedId).toBe('e');
    expect(f.sync([])).toBe(-1);
  });

  it('release hides the ring and sync stays idle', () => {
    const f = new FocusTracker();
    f.focusFirst(grid);
    f.release();
    expect(f.focusedId).toBeNull();
    expect(f.sync(grid)).toBe(-1);
  });
});

describe('HitList focus', () => {
  const build = (): { hits: HitList; log: string[] } => {
    const log: string[] = [];
    const hits = new HitList();
    hits.begin();
    // A tab strip (invisible but focusable), two card buttons in a column and Back.
    hits.add({ x: 0, y: 0, w: 60, h: 10 }, 'Tab', () => log.push('tab'), {
      invisible: true,
      focusable: true,
      key: 'tab:0',
    });
    hits.add({ x: 0, y: 14, w: 60, h: 20 }, '', () => log.push('card'), { invisible: true });
    hits.add({ x: 40, y: 16, w: 18, h: 8 }, 'Claim', () => log.push('claim1'), {
      key: 'claim:1',
      onFocus: () => log.push('focus:1'),
    });
    hits.add({ x: 40, y: 40, w: 18, h: 8 }, 'Claim', () => log.push('claim2'), {
      key: 'claim:2',
      onFocus: () => log.push('focus:2'),
    });
    hits.add({ x: 40, y: 60, w: 18, h: 8 }, 'Back', () => log.push('back'));
    return { hits, log };
  };

  it('shows the ring on the first OK, then presses what is focused', () => {
    const { hits, log } = build();
    expect(hits.handleNav('ok')).toBe(true);
    expect(hits.keyboardActive).toBe(true);
    expect(log).toEqual([]); // nothing fired yet
    expect(hits.focusedIs('tab:0')).toBe(true);
    hits.handleNav('ok');
    expect(log).toEqual(['tab']);
  });

  it('walks the buttons with the arrows and skips click-only hits', () => {
    const { hits, log } = build();
    hits.handleNav('down'); // shows the ring on the tab
    hits.handleNav('down');
    expect(hits.focusedIs('claim:1')).toBe(true);
    hits.handleNav('down');
    expect(hits.focusedIs('claim:2')).toBe(true);
    hits.handleNav('down');
    expect(hits.focusedIs('Back')).toBe(true);
    hits.handleNav('up');
    hits.handleNav('ok');
    expect(log).toEqual(['focus:1', 'focus:2', 'focus:2', 'claim2']);
  });

  it('mouse input takes the ring away and hover returns', () => {
    const { hits } = build();
    hits.handleNav('down');
    expect(hits.keyboardActive).toBe(true);
    hits.move(5, 5);
    expect(hits.keyboardActive).toBe(false);
    expect(hits.focusedId).toBeNull();
  });

  it('ignores disabled hits and wraps around', () => {
    const hits = new HitList();
    hits.begin();
    hits.add({ x: 0, y: 0, w: 10, h: 10 }, 'One', () => undefined);
    hits.add({ x: 0, y: 20, w: 10, h: 10 }, 'Two', () => undefined, { disabled: true });
    hits.handleNav('down');
    expect(hits.focusedIs('One')).toBe(true);
    hits.handleNav('down'); // nothing else enabled: stays
    expect(hits.focusedIs('One')).toBe(true);
  });

  it('re-targets the ring when a focused button disappears next frame', () => {
    const { hits } = build();
    hits.focusOn('claim:1');
    expect(hits.focusedIs('claim:1')).toBe(true);
    hits.begin(); // settles the finished frame
    hits.add({ x: 0, y: 0, w: 60, h: 10 }, 'Tab', () => undefined, {
      invisible: true,
      focusable: true,
      key: 'tab:0',
    });
    hits.add({ x: 40, y: 40, w: 18, h: 8 }, 'Claim', () => undefined, { key: 'claim:2' });
    hits.handleNav('down'); // sync happens against the new list
    expect(hits.focusedIs('claim:2') || hits.focusedIs('tab:0')).toBe(true);
  });
});

describe('PadNav', () => {
  afterEach(() => vi.unstubAllGlobals());
  const padWith = (pressed: number[]): unknown => ({
    axes: [0, 0],
    buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: pressed.includes(i) })),
  });

  it('does not count a button held when polling starts as a new press', () => {
    let now = 1000;
    vi.stubGlobal('performance', { now: () => now });
    let held: number[] = [0, 1];
    vi.stubGlobal('navigator', { getGamepads: () => [padWith(held)] });
    const nav = new PadNav();
    expect(nav.poll(0.016)).toEqual([]); // A and B were already down
    now += 16;
    held = [];
    expect(nav.poll(0.016)).toEqual([]);
    now += 16;
    held = [0];
    expect(nav.poll(0.016)).toEqual(['ok']);
    now += 16;
    expect(nav.poll(0.016)).toEqual([]); // still held
    now += 16;
    held = [1, 4, 5];
    expect(nav.poll(0.016).sort()).toEqual(['back', 'next', 'prev']);
  });

  it('treats a button still held after a long gap (a screen was on top) as old', () => {
    let now = 1000;
    vi.stubGlobal('performance', { now: () => now });
    let held: number[] = [];
    vi.stubGlobal('navigator', { getGamepads: () => [padWith(held)] });
    const nav = new PadNav();
    nav.poll(0.016);
    now += 2000; // another screen was polling meanwhile
    held = [1];
    expect(nav.poll(0.016)).toEqual([]);
    now += 16;
    held = [];
    nav.poll(0.016);
    now += 16;
    held = [1];
    expect(nav.poll(0.016)).toEqual(['back']);
  });

  it('repeats a held d-pad direction', () => {
    let now = 1000;
    vi.stubGlobal('performance', { now: () => now });
    vi.stubGlobal('navigator', { getGamepads: () => [padWith([13])] });
    const nav = new PadNav();
    expect(nav.poll(0.016)).toEqual(['down']);
    let n = 0;
    for (let i = 0; i < 60; i++) {
      now += 16;
      n += nav.poll(0.016).length;
    }
    expect(n).toBeGreaterThanOrEqual(5);
  });
});

describe('spawner layout', () => {
  const sizes: [number, number][] = [
    [213, 120],
    [240, 135],
    [256, 144],
    [320, 180],
    [426, 240],
    [480, 270],
    [640, 360],
  ];
  for (const [w, h] of sizes) {
    it(`${w}x${h}: nothing overlaps and everything is on screen`, () => {
      const L = spawnerLayout(w, h);
      const hdrBottom = L.rowY + L.rowH;
      const B = L.buttons;
      expect(L.compact).toBe(h < 150);
      // Buttons: four, on screen, below everything else.
      expect(B.x0).toBeGreaterThanOrEqual(0);
      expect(B.x0 + 4 * B.w + 3 * B.gap).toBeLessThanOrEqual(w);
      expect(B.y + B.h).toBeLessThanOrEqual(h);
      expect(B.w).toBeGreaterThanOrEqual(40);
      // The cage and its flames sit between the header row and the message / hint line.
      const c = L.cage;
      expect(c.y - c.flame).toBeGreaterThanOrEqual(hdrBottom);
      expect(c.y + c.h + 8).toBeLessThanOrEqual(B.y - 12);
      expect(c.h).toBeGreaterThanOrEqual(24);
      // Torches stay on screen.
      expect(c.cx - (c.w / 2 + 28) - 12).toBeGreaterThanOrEqual(0);
      if (L.hintY !== null) expect(L.hintY).toBeLessThan(B.y);
      expect(L.msgY).toBeLessThan(B.y);
      // Reveal card and portrait.
      const R = L.reveal;
      expect(R.box.y).toBeGreaterThanOrEqual(L.top);
      expect(R.box.y + R.box.h).toBeLessThanOrEqual(B.y);
      expect(R.box.x).toBeGreaterThanOrEqual(0);
      expect(R.box.x + R.box.w).toBeLessThanOrEqual(w);
      expect(R.feetY).toBeLessThanOrEqual(R.box.y + R.box.h);
      expect(R.feetY - R.fit).toBeGreaterThanOrEqual(L.top - 1);
      if (L.compact)
        expect(R.cx + 20).toBeLessThanOrEqual(R.box.x + 4); // portrait beside the card
      else expect(R.feetY).toBeLessThanOrEqual(R.box.y); // portrait above it
      const lastLine = R.box.y + (R.lines[4] ?? 0);
      expect(lastLine).toBeLessThanOrEqual(R.box.y + R.box.h - 2);
      // Rates panel.
      const P = L.rates;
      expect(P.y + P.h).toBeLessThanOrEqual(B.y);
      expect(P.x).toBeGreaterThanOrEqual(0);
      expect(P.x + P.w).toBeLessThanOrEqual(w);
      expect(P.h).toBeGreaterThanOrEqual(L.compact ? 70 : 90);
      // Tray: ten cells and the continue line fit between the header and the buttons.
      const T = L.tray;
      const trayBottom = T.y + 2 * (T.ch + 2);
      expect(T.y).toBeGreaterThanOrEqual(L.top);
      expect(T.x).toBeGreaterThanOrEqual(0);
      expect(T.x + 5 * T.cw).toBeLessThanOrEqual(w);
      expect(trayBottom).toBeLessThanOrEqual(T.textY - 6);
      expect(T.textY).toBeLessThanOrEqual(B.y - 2);
      // The reveal card never covers the buttons.
      const btnRect = { x: B.x0, y: B.y, w: 4 * B.w + 3 * B.gap, h: B.h };
      expect(overlap(R.box, btnRect)).toBe(false);
      expect(overlap({ x: T.x, y: T.y, w: 5 * T.cw, h: trayBottom - T.y }, btnRect)).toBe(false);
    });
  }
});

describe('minimap touch toggle', () => {
  it('non-touch: the map or nothing (the M key and a click toggle it)', () => {
    expect(minimapSlot(426, 56, 240, false, true).map).not.toBeNull();
    expect(minimapSlot(426, 56, 240, false, true).chip).toBeNull();
    const hidden = minimapSlot(426, 56, 240, false, false);
    expect(hidden.map).toBeNull();
    expect(hidden.chip).toBeNull();
  });

  it('touch: a hidden map leaves a chip in the same corner so a tap brings it back', () => {
    const shown = minimapSlot(426, 56, 240, true, true);
    const hidden = minimapSlot(426, 56, 240, true, false);
    expect(shown.map).not.toBeNull();
    expect(hidden.map).toBeNull();
    expect(hidden.chip).not.toBeNull();
    expect(hidden.chip?.w).toBe(CHIP_SIDE);
    // Both end at the same right edge, so the toggle does not jump around.
    const m = shown.map as R;
    const c = hidden.chip as R;
    expect(Math.abs(m.x + m.w + 3 - (c.x + c.w + 1))).toBeLessThanOrEqual(2);
    expect(slotHit(hidden, c.x + 2, c.y + 2)).toBe(true);
    expect(slotHit(hidden, 5, 5)).toBe(false);
    expect(slotHit(shown, m.x + 5, m.y + 5)).toBe(true);
  });

  it('touch: too short a view draws neither, and the rift (arena) never does', () => {
    expect(minimapSlot(300, 56, TOUCH_MIN_HEIGHT - 1, true, true)).toEqual({
      map: null,
      chip: null,
    });
    expect(minimapSlot(300, 56, TOUCH_MIN_HEIGHT - 1, true, false)).toEqual({
      map: null,
      chip: null,
    });
    expect(minimapSlot(426, 56, 240, true, true, true)).toEqual({ map: null, chip: null });
  });

  it('never covers the on-screen touch buttons (map frame, chip) at supported sizes', () => {
    const sizes: [number, number][] = [
      [320, 180],
      [333, 187],
      [400, 180],
      [426, 240],
      [480, 270],
      [195, 422],
      [284, 150],
    ];
    const touch = new TouchInput();
    for (const [w, h] of sizes) {
      for (const top of [56, 74]) {
        for (const visible of [true, false]) {
          const slot = minimapSlot(w, top, h, true, visible);
          const r: R | null = slot.map
            ? { x: slot.map.x - 2, y: slot.map.y - 2, w: MAP_SIDE + 4, h: MAP_SIDE + 4 }
            : slot.chip;
          if (!r) continue;
          for (const b of touch.buttons(w, h)) {
            // Distance from the button centre to the nearest point of the rect against its radius.
            const nx = Math.max(r.x, Math.min(b.x, r.x + r.w));
            const ny = Math.max(r.y, Math.min(b.y, r.y + r.h));
            expect(Math.hypot(b.x - nx, b.y - ny)).toBeGreaterThan(b.r);
          }
        }
      }
    }
  });

  it('touch button hit test (taps on a button never toggle the map)', () => {
    const touch = new TouchInput();
    const b = touch.buttons(426, 240)[0];
    expect(b).toBeDefined();
    if (b) {
      expect(touch.buttonAt(b.x, b.y, 426, 240)).toBe(true);
      expect(touch.buttonAt(1, 1, 426, 240)).toBe(false);
    }
  });
});

describe('rarity colours', () => {
  it('only widgets.ts reads RARITY_COLOR, so the colour-blind remap cannot be skipped', () => {
    const dir = new URL('../src/ui/', import.meta.url);
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith('.ts') && f !== 'widgets.ts')
      .filter((f) => /\bRARITY_COLOR\b/.test(readFileSync(new URL(f, dir), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
