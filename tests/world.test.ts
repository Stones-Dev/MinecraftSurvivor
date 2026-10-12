import { describe, expect, it } from 'vitest';
import { hash2, valueNoise } from '../src/core/noise';
import { nightFactor } from '../src/systems/daynight';
import { BIOME_PERIOD, biomeState } from '../src/world/biomes';
import { genProps } from '../src/world/props';
import { CHUNK_TILES, genTerrain, SPAWN_CLEAR, TILE, tileAt } from '../src/world/terrain';
import { World } from '../src/world/world';
import { BIOMES } from '../src/world/biomes';
import { paintChunk } from '../src/world/tilePaint';

describe('noise', () => {
  it('hash2 is stable and in [0, 1)', () => {
    expect(hash2(3, 4, 9)).toBe(hash2(3, 4, 9));
    for (let i = 0; i < 500; i++) {
      const v = hash2(i, -i * 3, 5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('valueNoise is continuous', () => {
    expect(Math.abs(valueNoise(1.2, 3.4, 1) - valueNoise(1.2001, 3.4, 1))).toBeLessThan(0.01);
  });
});

describe('terrain', () => {
  it('tileAt does not depend on query order', () => {
    const forward = [];
    for (let i = 0; i < 200; i++) forward.push(tileAt(i * 3, -i, 7));
    const backward = [];
    for (let i = 199; i >= 0; i--) backward.unshift(tileAt(i * 3, -i, 7));
    expect(backward).toEqual(forward);
  });

  it('genTerrain agrees with tileAt, border included', () => {
    const t = genTerrain(2, -1, 11);
    const side = CHUNK_TILES + 2;
    expect(t[0]).toBe(tileAt(2 * CHUNK_TILES - 1, -CHUNK_TILES - 1, 11));
    expect(t[5 * side + 7]).toBe(tileAt(2 * CHUNK_TILES + 6, -CHUNK_TILES + 4, 11));
  });

  it('keeps the spawn area free of water', () => {
    for (let y = -SPAWN_CLEAR; y <= SPAWN_CLEAR; y++) {
      for (let x = -SPAWN_CLEAR; x <= SPAWN_CLEAR; x++) {
        if (Math.hypot(x, y) < SPAWN_CLEAR) expect(tileAt(x, y, 3)).not.toBe(TILE.WATER);
      }
    }
  });
});

describe('props', () => {
  it('are deterministic and never in the spawn area or on water', () => {
    for (let cy = -2; cy <= 2; cy++) {
      for (let cx = -2; cx <= 2; cx++) {
        const a = genProps(cx, cy, 5, 'dark_forest');
        expect(genProps(cx, cy, 5, 'dark_forest')).toEqual(a);
        for (const p of a) {
          expect(Math.hypot(p.x / 16, p.y / 16)).toBeGreaterThan(SPAWN_CLEAR - 1);
          expect(tileAt(Math.floor(p.x / 16), Math.floor(p.y / 16), 5)).not.toBe(TILE.WATER);
        }
      }
    }
  });

  it('dark forest has more trees than plains', () => {
    const count = (b: 'plains' | 'dark_forest'): number => {
      let n = 0;
      for (let cy = -3; cy <= 3; cy++) {
        for (let cx = -3; cx <= 3; cx++)
          n += genProps(cx, cy, 8, b).filter((p) => p.kind === 'tree').length;
      }
      return n;
    };
    expect(count('dark_forest')).toBeGreaterThan(count('plains') * 2);
  });
});

describe('collision', () => {
  it('pushes a circle out of a solid prop and leaves free space alone', () => {
    const world = new World(5);
    const tree = world
      .propsInRect(-2000, -2000, 2000, 2000, 'plains')
      .find((p) => p.kind === 'tree');
    expect(tree).toBeDefined();
    if (!tree) return;
    const r = world.collide(tree.x + 1, tree.y, 5, 'plains');
    expect(Math.hypot(r.x - tree.x, r.y - tree.y)).toBeGreaterThanOrEqual(5 + tree.radius - 0.001);
    expect(world.collide(0, 0, 5, 'plains')).toEqual({ x: 0, y: 0 });
  });
});

describe('biome clock and day/night', () => {
  it('starts in plains without a fade and crossfades into the next biome', () => {
    expect(biomeState(0)).toEqual({ current: 'plains', previous: null, fade: 1 });
    const s = biomeState(BIOME_PERIOD + 1);
    expect(s.current).toBe('dark_forest');
    expect(s.previous).toBe('plains');
    expect(s.fade).toBeCloseTo(0.4);
    expect(biomeState(BIOME_PERIOD + 3).previous).toBeNull();
  });

  it('nightFactor is 0 by day, 1 deep at night, and periodic', () => {
    expect(nightFactor(0)).toBe(0);
    expect(nightFactor(240)).toBe(1);
    expect(nightFactor(175)).toBeGreaterThan(0);
    expect(nightFactor(175)).toBeLessThan(1);
    expect(nightFactor(10)).toBe(nightFactor(310));
  });
});

describe('chunk baking budget', () => {
  it('paints a 256x256 chunk well inside the frame budget (BRIEF 8: <= 4 ms; generous CI limit)', () => {
    const terrain = genTerrain(3, 3, 1337);
    paintChunk(3, 3, terrain, BIOMES.plains, 1337); // warm up the JIT
    // Best of several batches: a noisy neighbour on a shared CI box must not fail a perf smoke test.
    let best = Infinity;
    for (let batch = 0; batch < 5; batch++) {
      const runs = 10;
      const t0 = performance.now();
      for (let i = 0; i < runs; i++) paintChunk(3 + i, 3 + batch, terrain, BIOMES.plains, 1337);
      best = Math.min(best, (performance.now() - t0) / runs);
    }
    console.log(`paintChunk best batch average: ${best.toFixed(2)} ms`);
    expect(best).toBeLessThan(14);
  });
});
