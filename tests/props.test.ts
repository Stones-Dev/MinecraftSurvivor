import { describe, expect, it } from 'vitest';
import { BIOME_IDS, type BiomeId } from '../src/world/biomes';
import { PROP_GALLERY, PROP_STYLES, propPixels, propSpriteStats } from '../src/world/propSprites';
import { genProps, type Prop, type PropKind, propStyleFor } from '../src/world/props';
import { TILE, TILE_PX, tileAt } from '../src/world/terrain';

/** Every prop kind (the Record makes the compiler flag a kind missing here). */
const KINDS = Object.keys({
  tree: 1,
  boulder: 1,
  ore: 1,
  chest: 1,
  locked_chest: 1,
  tallgrass: 1,
  flower: 1,
  cactus: 1,
  melon: 1,
  pumpkin: 1,
  beacon: 1,
  campfire: 1,
  anvil: 1,
  enchant_table: 1,
  tnt_trap: 1,
  cobweb: 1,
  magma: 1,
  bamboo: 1,
} satisfies Record<PropKind, 1>) as PropKind[];

const OVERWORLD = BIOME_IDS.filter((b) => b !== 'nether');

function variants(): number[] {
  const out: number[] = [];
  for (let shape = 0; shape < 4; shape++)
    for (let type = 0; type < 6; type++) out.push(type + 8 * shape);
  return out;
}

function opaque(data: Uint32Array): number {
  let n = 0;
  for (const p of data) if (p >>> 24 !== 0) n++;
  return n;
}

function propsOf(biome: BiomeId, seed = 8, r = 4): Prop[] {
  const out: Prop[] = [];
  for (let cy = -r; cy <= r; cy++)
    for (let cx = -r; cx <= r; cx++) out.push(...genProps(cx, cy, seed, biome));
  return out;
}

describe('prop sprites', () => {
  it('every kind x biome x variant paints a sane sprite with its feet inside it', () => {
    const before = propSpriteStats.fallbacks;
    for (const kind of KINDS) {
      for (const biome of BIOME_IDS) {
        for (const v of variants()) {
          const p = propPixels(kind, biome, v);
          const label = `${kind}/${biome}/${v} (${p.style})`;
          expect(p.buf.w, label).toBeGreaterThanOrEqual(6);
          expect(p.buf.h, label).toBeGreaterThanOrEqual(6);
          expect(p.buf.w, label).toBeLessThanOrEqual(48);
          expect(p.buf.h, label).toBeLessThanOrEqual(72);
          expect(opaque(p.buf.data), label).toBeGreaterThan(12);
          expect(p.ox, label).toBeGreaterThanOrEqual(0);
          expect(p.ox, label).toBeLessThan(p.buf.w);
          expect(p.oy, label).toBeGreaterThanOrEqual(0);
          expect(p.oy, label).toBeLessThan(p.buf.h);
        }
      }
    }
    expect(propSpriteStats.fallbacks).toBe(before);
  });

  it('every style propStyleFor can return has its own painter', () => {
    const handled = new Set<string>(PROP_STYLES);
    const used = new Set<string>();
    for (const kind of KINDS)
      for (const biome of BIOME_IDS)
        for (const v of variants()) used.add(propStyleFor(biome, kind, v));
    for (const s of used) expect(handled.has(s), s).toBe(true);
    // And no painter is dead code.
    for (const s of handled) expect(used.has(s), s).toBe(true);
  });

  it('biomes get their own art', () => {
    expect(propStyleFor('cherry_grove', 'tree')).toBe('cherry_tree');
    expect(propStyleFor('jungle', 'tree', 2)).toBe('jungle_tree');
    expect(propStyleFor('swamp', 'tree')).toBe('swamp_oak');
    expect(propStyleFor('mushroom_fields', 'boulder')).toBe('huge_mushroom');
    expect(propStyleFor('badlands', 'boulder')).toBe('terracotta_rock');
    expect(propStyleFor('desert', 'boulder')).toBe('sandstone_rock');
    expect(propStyleFor('forest', 'boulder')).toBe('mossy_boulder');
    expect(propStyleFor('desert', 'tallgrass')).toBe('dead_bush');
    expect(propStyleFor('snowy_taiga', 'tallgrass', 24)).toBe('sweet_berry_bush');
    expect(propStyleFor('cherry_grove', 'flower')).toBe('pink_petals');
    expect(propStyleFor('plains', 'flower', 3)).toBe('oxeye_daisy');
  });

  it('snowy spruces carry snow and jungle trees are taller than oaks', () => {
    const white = (biome: BiomeId): number => {
      const p = propPixels('tree', biome, 3);
      let n = 0;
      for (const px of p.buf.data) if ((px & 255) > 235 && ((px >>> 16) & 255) > 235) n++;
      return n;
    };
    expect(white('snowy_taiga')).toBeGreaterThan(30);
    expect(white('plains')).toBe(0);
    expect(propPixels('tree', 'jungle', 2).oy).toBeGreaterThan(propPixels('tree', 'plains', 0).oy);
  });

  it('a whole biome of sprites builds in a few milliseconds', () => {
    const t0 = performance.now();
    for (const kind of KINDS)
      for (let shape = 0; shape < 4; shape++) propPixels(kind, 'jungle', 2 + 8 * shape);
    expect(performance.now() - t0).toBeLessThan(250);
  });

  it('gallery pages only list real kinds', () => {
    expect(PROP_GALLERY.length).toBeGreaterThan(1);
    for (const page of PROP_GALLERY) for (const [kind] of page) expect(KINDS).toContain(kind);
  });
});

describe('prop generation', () => {
  it('is deterministic per biome', () => {
    for (const b of OVERWORLD) expect(propsOf(b, 21, 1)).toEqual(propsOf(b, 21, 1));
  });

  it('solid props collide and decorations do not', () => {
    for (const b of OVERWORLD) {
      for (const p of propsOf(b, 8, 2)) {
        expect(p.solid).toBe(p.radius > 0);
        if (['tree', 'boulder', 'ore', 'cactus', 'bamboo', 'chest'].includes(p.kind))
          expect(p.radius, p.kind).toBeGreaterThan(0);
        if (p.kind === 'tallgrass' || p.kind === 'flower') expect(p.solid).toBe(false);
      }
    }
  });

  it('new kinds and styles grow in their biomes only', () => {
    const count = (b: BiomeId, f: (p: Prop) => boolean): number => propsOf(b).filter(f).length;
    const isBamboo = (p: Prop): boolean => p.kind === 'bamboo';
    const huge = (p: Prop): boolean => propStyleFor(p.biome, p.kind, p.variant) === 'huge_mushroom';
    expect(count('jungle', isBamboo)).toBeGreaterThan(5);
    expect(count('mushroom_fields', huge)).toBeGreaterThan(5);
    for (const b of OVERWORLD) {
      if (b !== 'jungle') expect(count(b, isBamboo), b).toBe(0);
      if (b !== 'mushroom_fields') expect(count(b, huge), b).toBe(0);
    }
    // Every meadow flower species shows up in plains.
    const species = new Set(
      propsOf('plains')
        .filter((p) => p.kind === 'flower')
        .map((p) => p.variant % 8),
    );
    expect([...species].sort()).toEqual([0, 1, 2, 3]);
  });

  it('props stand on grass tiles', () => {
    for (const b of OVERWORLD) {
      for (const p of propsOf(b, 8, 2)) {
        expect(tileAt(Math.floor(p.x / TILE_PX), Math.floor(p.y / TILE_PX), 8)).toBe(TILE.GRASS);
      }
    }
  });

  it('decoration density stays in budget (about the same per screen as before)', () => {
    for (const b of OVERWORLD) {
      const n = propsOf(b, 8, 2).length;
      // 25 chunks of 256 px; a 427x240 screen (zoom 3) covers ~1.6 chunks, so n < 1500 keeps it
      // under ~100 props per screen.
      expect(n, b).toBeLessThan(1500);
      expect(n, b).toBeGreaterThan(150);
    }
  });
});
