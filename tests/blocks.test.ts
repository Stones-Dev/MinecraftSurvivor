import { describe, expect, it } from 'vitest';
import {
  blockTexture,
  LIQUID,
  LIQUID_FRAMES,
  liquidSet,
  MAT,
  MATERIAL_COUNT,
  materialFramed,
  materialSet,
  materialSetSize,
  materialVariants,
  type MaterialId,
  SIDE,
  TEX,
  TEX_AREA,
} from '../src/world/blocks';
import { BIOME_IDS, BIOME_INDEX, OVERWORLD_BIOMES } from '../src/world/biomes';
import { findBiome } from '../src/world/biomeMap';
import { BIOME_BORDER, CHUNK_TILES, genChunkBiomes, genTerrain, TILE } from '../src/world/terrain';
import { animTiles, LAVA_SHEET, paintChunk } from '../src/world/tilePaint';
import { World } from '../src/world/world';

const MATS = Array.from({ length: MATERIAL_COUNT }, (_, i) => i as MaterialId);

function lum(c: number): number {
  return (c & 255) * 0.3 + ((c >>> 8) & 255) * 0.59 + ((c >>> 16) & 255) * 0.11;
}

/** Mean |difference| of luminance between two columns (vertical=false: rows) of a texture. */
function lineDiff(t: Uint32Array, a: number, b: number, vertical: boolean): number {
  let s = 0;
  for (let i = 0; i < TEX; i++) {
    const p = vertical ? (t[i * TEX + a] ?? 0) : (t[a * TEX + i] ?? 0);
    const q = vertical ? (t[i * TEX + b] ?? 0) : (t[b * TEX + i] ?? 0);
    s += Math.abs(lum(p) - lum(q));
  }
  return s / TEX;
}

describe('block texture library', () => {
  it('has 6-8 variants of 256 pixels for every material, deterministically', () => {
    for (const m of MATS) {
      const n = materialVariants(m);
      expect(n).toBeGreaterThanOrEqual(6);
      expect(n).toBeLessThanOrEqual(8);
      for (let v = 0; v < n; v++) {
        const t = blockTexture(m, v);
        expect(t.length).toBe(TEX_AREA);
        expect(t.every((c) => c >>> 24 >= 0xfe)).toBe(true);
      }
      expect(materialSet(m).length).toBe(materialSetSize(m) * TEX_AREA);
      // Variants differ from each other.
      expect(blockTexture(m, 0)).not.toEqual(blockTexture(m, 1));
    }
  });

  it('is deterministic across fresh module instances', async () => {
    const { vi } = await import('vitest');
    vi.resetModules();
    const fresh = await import('../src/world/blocks');
    for (const m of MATS) expect(fresh.blockTexture(m, 3)).toEqual(blockTexture(m, 3));
    expect(fresh.liquidSet(fresh.LIQUID.WATER, 5)).toEqual(liquidSet(LIQUID.WATER, 5));
  });

  it('uses few tones like Minecraft (<= 8 colours per block, <= 10 per liquid frame)', () => {
    for (const m of MATS) {
      for (let v = 0; v < materialVariants(m); v++) {
        const n = new Set(blockTexture(m, v)).size;
        expect(n, `${m}/${v}`).toBeGreaterThanOrEqual(4);
        expect(n, `${m}/${v}`).toBeLessThanOrEqual(8);
      }
    }
    for (const set of [liquidSet(LIQUID.WATER, 0), liquidSet(LIQUID.LAVA, 0)]) {
      for (let k = 0; k < 16 * LIQUID_FRAMES; k++) {
        const n = new Set(set.subarray(k * TEX_AREA, (k + 1) * TEX_AREA)).size;
        expect(n).toBeLessThanOrEqual(10);
      }
    }
  });

  it('natural blocks tile without seams (edge difference within the interior variation)', () => {
    for (const m of MATS) {
      if (materialFramed(m)) continue;
      for (let v = 0; v < materialVariants(m); v++) {
        const t = blockTexture(m, v);
        // Seam = the column/row pairs that meet when the block repeats; compare with the roughest
        // adjacent pair inside the block (and with the mean, loosely).
        let worst = 0;
        let mean = 0;
        for (let i = 0; i < TEX - 1; i++) {
          const d = (lineDiff(t, i, i + 1, true) + lineDiff(t, i, i + 1, false)) / 2;
          worst = Math.max(worst, d);
          mean += d / (TEX - 1);
        }
        const seam = (lineDiff(t, TEX - 1, 0, true) + lineDiff(t, TEX - 1, 0, false)) / 2;
        expect(seam, `material ${m} variant ${v}`).toBeLessThanOrEqual(worst * 1.25 + 1);
        expect(seam, `material ${m} variant ${v}`).toBeLessThanOrEqual(mean * 2 + 2);
      }
    }
  });

  it('is clustered, not per-pixel static (most pixels share a tone with a neighbour)', () => {
    for (const m of [MAT.GRASS, MAT.DIRT, MAT.SAND, MAT.NETHERRACK, MAT.SNOW, MAT.STONE]) {
      const t = blockTexture(m, 0);
      let same = 0;
      for (let y = 0; y < TEX; y++) {
        for (let x = 0; x < TEX; x++) {
          const c = t[y * TEX + x];
          if (
            c === t[y * TEX + ((x + 1) & 15)] ||
            c === t[y * TEX + ((x + 15) & 15)] ||
            c === t[((y + 1) & 15) * TEX + x] ||
            c === t[((y + 15) & 15) * TEX + x]
          )
            same++;
        }
      }
      expect(same / TEX_AREA, `material ${m}`).toBeGreaterThan(0.6);
    }
  });

  it('water animates and draws its shores; swamp water is greener than plains water', () => {
    const set = liquidSet(LIQUID.WATER, BIOME_INDEX.plains);
    const frame = (mask: number, f: number): Uint32Array =>
      set.subarray(
        (mask * LIQUID_FRAMES + f) * TEX_AREA,
        (mask * LIQUID_FRAMES + f + 1) * TEX_AREA,
      );
    expect(frame(0, 0)).not.toEqual(frame(0, 1));
    // North shore: the top row is the dark bank; south shore: the bottom row is light foam.
    const open = frame(0, 0);
    expect(lum(frame(SIDE.N, 0)[3] ?? 0)).toBeLessThan(lum(open[3] ?? 0) - 10);
    expect(lum(frame(SIDE.S, 0)[15 * TEX + 5] ?? 0)).toBeGreaterThan(lum(open[15 * TEX + 5] ?? 0));
    const avg = (s: Uint32Array, ch: number): number =>
      s.subarray(0, TEX_AREA).reduce((a, c) => a + ((c >>> (ch * 8)) & 255), 0) / TEX_AREA;
    const swamp = liquidSet(LIQUID.WATER, BIOME_INDEX.swamp);
    expect(avg(swamp, 1) - avg(swamp, 2)).toBeGreaterThan(avg(set, 1) - avg(set, 2));
  });
});

describe('chunk painting with blocks', () => {
  it('paints every biome and the Nether arena without gaps', () => {
    const world = new World(3);
    for (const b of OVERWORLD_BIOMES) {
      const at = findBiome(b, 3, 0, 0, 3000) ?? { tx: 0, ty: 0 };
      const cx = Math.floor(at.tx / CHUNK_TILES);
      const cy = Math.floor(at.ty / CHUNK_TILES);
      const terrain = genTerrain(cx, cy, 3);
      const biomes = genChunkBiomes(cx, cy, (x, y) => world.biomeIndexAtTile(x, y));
      const buf = paintChunk(cx, cy, terrain, biomes, 3);
      expect(
        buf.data.every((c) => c >>> 24 === 255),
        b,
      ).toBe(true);
      // Forced single-biome painting too (gallery / hub).
      const single = paintChunk(0, 0, genTerrain(0, 0, 3), b, 3);
      expect(
        single.data.every((c) => c >>> 24 === 255),
        b,
      ).toBe(true);
    }
    const arena = new World(7, { r: 22 });
    for (let cy = -2; cy <= 1; cy++) {
      for (let cx = -2; cx <= 1; cx++) {
        const terrain = genTerrain(cx, cy, 7, arena.arena);
        const biomes = genChunkBiomes(cx, cy, (x, y) => arena.biomeIndexAtTile(x, y));
        const buf = paintChunk(cx, cy, terrain, biomes, 7);
        expect(buf.data.every((c) => c >>> 24 === 255)).toBe(true);
      }
    }
  });

  it('is deterministic and decides materials per tile (16x16 blocks)', () => {
    const terrain = genTerrain(4, -3, 11);
    const a = paintChunk(4, -3, terrain, 'forest', 11);
    expect(paintChunk(4, -3, terrain, 'forest', 11).data).toEqual(a.data);
  });

  it('lists exactly the animated (unfrozen water and lava) tiles of a chunk', () => {
    const world = new World(3);
    let checked = 0;
    for (const b of ['swamp', 'snowy_taiga', 'badlands', 'plains'] as const) {
      const at = findBiome(b, 3, 0, 0, 3000) ?? { tx: 0, ty: 0 };
      for (let k = 0; k < 4; k++) {
        const cx = Math.floor(at.tx / CHUNK_TILES) + (k & 1);
        const cy = Math.floor(at.ty / CHUNK_TILES) + (k >> 1);
        const terrain = genTerrain(cx, cy, 3);
        const biomes = genChunkBiomes(cx, cy, (x, y) => world.biomeIndexAtTile(x, y));
        const list = animTiles(cx, cy, terrain, biomes, 3);
        const side = CHUNK_TILES + 2;
        const bSide = CHUNK_TILES + 2 * BIOME_BORDER;
        const expected = new Set<number>();
        for (let ty = 0; ty < CHUNK_TILES; ty++) {
          for (let tx = 0; tx < CHUNK_TILES; tx++) {
            const t = terrain[(ty + 1) * side + tx + 1];
            const bi = biomes[(ty + BIOME_BORDER) * bSide + tx + BIOME_BORDER] ?? 0;
            const frozen = BIOME_IDS[bi] === 'snowy_taiga';
            if (t === TILE.LAVA || (t === TILE.WATER && !frozen)) expected.add(ty * 16 + tx);
          }
        }
        expect(new Set(Array.from(list, (e) => e & 255))).toEqual(expected);
        for (const e of list) {
          const idx = e & 255;
          const t = terrain[((idx >> 4) + 1) * side + (idx & 15) + 1];
          const sheet = (e >>> 16) & 255;
          expect(sheet === LAVA_SHEET).toBe(t === TILE.LAVA);
          // The baked tile is exactly the liquid frame the renderer starts from (time 0).
          const mask = (e >>> 8) & 15;
          const phase = (e >>> 12) & 3;
          const set =
            sheet === LAVA_SHEET ? liquidSet(LIQUID.LAVA, 0) : liquidSet(LIQUID.WATER, sheet);
          const buf = paintChunk(cx, cy, terrain, biomes, 3);
          const off = (mask * LIQUID_FRAMES + phase) * TEX_AREA;
          const px = (idx & 15) * 16 + 5;
          const py = (idx >> 4) * 16 + 7;
          expect(buf.data[py * 256 + px]).toBe(set[off + 7 * TEX + 5]);
          checked++;
          break;
        }
      }
    }
    expect(checked).toBeGreaterThan(3);
  });

  it('bakes 20 border chunks fast (best of 5 batches, average per chunk)', () => {
    const world = new World(1337);
    const border: { cx: number; cy: number; t: Uint8Array }[] = [];
    for (let cy = -10; cy <= 10 && border.length < 20; cy++) {
      for (let cx = -10; cx <= 10 && border.length < 20; cx++) {
        const b = genChunkBiomes(cx, cy, (x, y) => world.biomeIndexAtTile(x, y));
        if (new Set(b).size > 1) border.push({ cx, cy, t: genTerrain(cx, cy, 1337) });
      }
    }
    expect(border.length).toBe(20);
    for (const c of border.slice(0, 3))
      paintChunk(
        c.cx,
        c.cy,
        c.t,
        genChunkBiomes(c.cx, c.cy, (x, y) => world.biomeIndexAtTile(x, y)),
        1337,
      );
    let best = Infinity;
    for (let batch = 0; batch < 5; batch++) {
      const t0 = performance.now();
      for (const c of border) {
        const b = genChunkBiomes(c.cx, c.cy, (x, y) => world.biomeIndexAtTile(x, y));
        paintChunk(c.cx, c.cy, c.t, b, 1337);
      }
      best = Math.min(best, (performance.now() - t0) / border.length);
    }
    console.log(`border chunk bake (20 chunks, best of 5): ${best.toFixed(2)} ms per chunk`);
    expect(best).toBeLessThan(14);
  });
});
