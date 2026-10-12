import { describe, expect, it } from 'vitest';
import {
  BIOME_MAP_COLOUR,
  CELL_PX,
  ExploredSet,
  PX_PER_CELL,
  REVEAL_RADIUS,
  WINDOW_CELLS,
  cellColour,
  cellOf,
  mapPoint,
  paintWindow,
} from '../src/ui/minimap';
import { BIOME_IDS } from '../src/world/biomes';
import { World } from '../src/world/world';

describe('explored set', () => {
  it('adds cells once and answers membership across chunk and sign boundaries', () => {
    const s = new ExploredSet();
    const cells: [number, number][] = [
      [0, 0],
      [31, 31],
      [32, 32],
      [-1, -1],
      [-32, -33],
      [1000, -2000],
      [-5, 40],
    ];
    for (const [x, y] of cells) {
      expect(s.has(x, y)).toBe(false);
      expect(s.add(x, y)).toBe(true);
      expect(s.has(x, y)).toBe(true);
      expect(s.add(x, y)).toBe(false);
    }
    expect(s.size).toBe(cells.length);
    // Neighbours stay unexplored (no bit bleeding between words or chunks).
    for (const [x, y] of cells) {
      expect(s.has(x + 1, y)).toBe(false);
      expect(s.has(x, y + 1)).toBe(false);
    }
    s.clear();
    expect(s.size).toBe(0);
    expect(s.has(0, 0)).toBe(false);
  });

  it('keeps the top bit of a word (column 31) separate', () => {
    const s = new ExploredSet();
    s.add(31, 0);
    expect(s.has(31, 0)).toBe(true);
    expect(s.has(30, 0)).toBe(false);
    expect(s.has(0, 0)).toBe(false);
    s.add(0, 0);
    expect(s.size).toBe(2);
  });

  it('reveals a disc around the hero and only counts new cells', () => {
    const s = new ExploredSet();
    const first = s.reveal(10, -4);
    // A disc of radius 4.5 cells around the hero's cell: 69 cells.
    expect(first).toBe(69);
    expect(s.size).toBe(69);
    expect(s.has(10, -4)).toBe(true);
    expect(s.has(10 + REVEAL_RADIUS, -4)).toBe(true);
    expect(s.has(10 + REVEAL_RADIUS, -4 + REVEAL_RADIUS)).toBe(false);
    expect(s.has(10 + REVEAL_RADIUS + 1, -4)).toBe(false);
    expect(s.reveal(10, -4)).toBe(0);
    // Walking one cell east reveals a fresh crescent only.
    const step = s.reveal(11, -4);
    expect(step).toBeGreaterThan(0);
    expect(step).toBeLessThan(20);
  });

  it('stays tiny after a long walk (a 128-byte chunk per 32x32 cells)', () => {
    const s = new ExploredSet();
    // A 4 km walk east along a wiggly line: ~31 cells long: a handful of chunks at most.
    for (let x = 0; x < 4000; x += 40) s.reveal(cellOf(x), cellOf(Math.sin(x / 300) * 300));
    expect(s.chunkCount).toBeLessThanOrEqual(6);
    expect(s.size).toBeLessThan(900);
  });

  it('maps pixels to cells with floor semantics (negative coordinates too)', () => {
    expect(cellOf(0)).toBe(0);
    expect(cellOf(CELL_PX - 0.1)).toBe(0);
    expect(cellOf(CELL_PX)).toBe(1);
    expect(cellOf(-0.1)).toBe(-1);
    expect(cellOf(-CELL_PX)).toBe(-1);
    expect(cellOf(-CELL_PX - 0.1)).toBe(-2);
  });
});

describe('minimap painting', () => {
  const side = WINDOW_CELLS * PX_PER_CELL;

  it('paints fog for unexplored cells and the colour function for explored ones', () => {
    const s = new ExploredSet();
    s.reveal(5, 5, 1);
    const out = new Uint32Array(side * side);
    const RED = 0xff0000ff;
    paintWindow(s, 5, 5, () => RED, out);
    const half = WINDOW_CELLS >> 1;
    const at = (cx: number, cy: number): number =>
      out[(cy - (5 - half)) * PX_PER_CELL * side + (cx - (5 - half)) * PX_PER_CELL] ?? 0;
    expect(at(5, 5)).toBe(RED);
    expect(at(6, 5)).toBe(RED);
    expect(at(5, 4)).toBe(RED);
    expect(at(8, 8)).not.toBe(RED);
    // Every painted pixel is opaque enough to read; fog is translucent.
    expect((at(8, 8) >>> 24) & 255).toBeLessThan(255);
    // A cell fills its PX_PER_CELL x PX_PER_CELL block.
    const base = (5 - (5 - half)) * PX_PER_CELL;
    for (let v = 0; v < PX_PER_CELL; v++)
      for (let u = 0; u < PX_PER_CELL; u++) expect(out[(base + v) * side + base + u]).toBe(RED);
  });

  it('colours cells with the biome ground colour, water and lava aside', () => {
    const w = new World(11);
    const seen = new Set<number>();
    for (let cy = -60; cy <= 60; cy += 3)
      for (let cx = -60; cx <= 60; cx += 3) seen.add(cellColour(w, cx, cy));
    // The meadow around the origin is plains-green.
    expect(cellColour(w, 0, 0)).toBe(BIOME_MAP_COLOUR.plains);
    expect(seen.size).toBeGreaterThan(2);
    const grounds = new Set(BIOME_IDS.map((b) => BIOME_MAP_COLOUR[b]));
    expect(grounds.size).toBe(BIOME_IDS.length);
  });

  it('places markers relative to the hero cell and flags points beyond the window', () => {
    const p = { x: 0, y: 0, inside: false };
    const half = WINDOW_CELLS >> 1;
    // The hero in the middle of its cell sits at the window centre (plus half a cell).
    mapPoint(CELL_PX * 0.5, CELL_PX * 0.5, CELL_PX * 0.5, CELL_PX * 0.5, p);
    expect(p.inside).toBe(true);
    expect(p.x).toBeCloseTo((half + 0.5) * PX_PER_CELL);
    expect(p.y).toBeCloseTo((half + 0.5) * PX_PER_CELL);
    // A marker two cells east is 2 cells * PX_PER_CELL further right.
    mapPoint(CELL_PX * 0.5, CELL_PX * 0.5, CELL_PX * 2.5, CELL_PX * 0.5, p);
    expect(p.x).toBeCloseTo((half + 2.5) * PX_PER_CELL);
    // Far away: clamped to the edge, flagged outside.
    mapPoint(0, 0, 100000, -100000, p);
    expect(p.inside).toBe(false);
    expect(p.x).toBe(WINDOW_CELLS * PX_PER_CELL - 2);
    expect(p.y).toBe(1);
  });

  it('paints the whole window in well under a millisecond-ish budget', () => {
    const w = new World(3);
    const s = new ExploredSet();
    s.reveal(0, 0, 9);
    const out = new Uint32Array(side * side);
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) paintWindow(s, i, 0, (cx, cy) => cellColour(w, cx, cy), out);
    const per = (performance.now() - t0) / 20;
    // Done once per cell crossing (every ~2 s), so even 5 ms would be invisible; this guards regressions.
    expect(per).toBeLessThan(10);
  });
});
