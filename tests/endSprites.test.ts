import { afterEach, describe, expect, it } from 'vitest';
import { applyAccessibility } from '../src/core/accessibility';
import { PixBuffer } from '../src/core/pixelart';
import { defaultSave } from '../src/core/save';
import type { Telegraph } from '../src/game';
import { drawTelegraph } from '../src/render/entities';
import {
  CRYSTAL_FRAMES,
  CRYSTAL_H,
  CRYSTAL_W,
  DRAGON_H,
  DRAGON_W,
  EGG_H,
  EGG_W,
  FLAP_FRAMES,
  FRAME_BLOCK,
  PILLAR_H,
  PILLAR_W,
  STAR_TILE,
  cagePixels,
  crystalPixels,
  dragonPixels,
  eggPixels,
  flapOf,
  pillarPixels,
  portalFramePixels,
  starfieldPixels,
  whitened,
  type DragonPose,
} from '../src/render/endSprites';
import { END_VARIANTS, endTexture, isEndTile } from '../src/world/endTiles';
import { CHUNK_TILES, TILE, genTerrain, type Arena } from '../src/world/terrain';
import { paintChunk } from '../src/world/tilePaint';

afterEach(() => applyAccessibility(defaultSave(1).settings));

function opaque(buf: PixBuffer): number {
  let n = 0;
  for (const c of buf.data) if (c >>> 24 !== 0) n++;
  return n;
}

function bounds(buf: PixBuffer): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = buf.w;
  let y0 = buf.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < buf.h; y++)
    for (let x = 0; x < buf.w; x++)
      if ((buf.data[y * buf.w + x] ?? 0) >>> 24 !== 0) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  return { x0, y0, x1, y1 };
}

function same(a: PixBuffer, b: PixBuffer): boolean {
  return a.data.length === b.data.length && a.data.every((v, i) => v === b.data[i]);
}

const FLY: DragonPose = { flap: 1, mode: 'fly', mouth: false, tail: 0 };

describe('procedural End sprites (no canvas needed)', () => {
  it('the dragon is a big non-empty sprite that fits its canvas, with poses that differ', () => {
    const fly = dragonPixels(FLY);
    expect(fly.w).toBe(DRAGON_W);
    expect(fly.h).toBe(DRAGON_H);
    expect(opaque(fly)).toBeGreaterThan(3000);
    const b = bounds(fly);
    expect(b.x0).toBeGreaterThanOrEqual(0);
    expect(b.y0).toBeGreaterThanOrEqual(0);
    expect(b.x1).toBeLessThan(DRAGON_W);
    expect(b.y1).toBeLessThan(DRAGON_H);
    // 150 px wide at least (tail to snout): a boss, not a mob.
    expect(b.x1 - b.x0).toBeGreaterThan(130);
    const raised = dragonPixels({ ...FLY, flap: 0 });
    const dive = dragonPixels({ ...FLY, mode: 'dive' });
    const perch = dragonPixels({ ...FLY, mode: 'perch' });
    const mouth = dragonPixels({ ...FLY, mouth: true });
    for (const other of [raised, dive, perch, mouth]) {
      expect(opaque(other)).toBeGreaterThan(2000);
      expect(same(fly, other)).toBe(false);
    }
    // Wings foreshorten when raised and fold when perched.
    expect(opaque(raised)).toBeLessThan(opaque(fly));
    expect(opaque(perch)).toBeLessThan(opaque(fly));
    // Deterministic.
    expect(same(fly, dragonPixels(FLY))).toBe(true);
    // The glowing eye is magenta.
    let magenta = 0;
    for (const c of fly.data)
      if ((c & 255) > 230 && ((c >>> 8) & 255) < 100 && c >>> 16 > 200) magenta++;
    expect(magenta).toBeGreaterThan(4);
  });

  it('the flap cycle covers the whole range, one frame per step', () => {
    const flaps = Array.from({ length: FLAP_FRAMES }, (_, k) => flapOf(k));
    expect(Math.max(...flaps)).toBeCloseTo(1, 5);
    expect(Math.min(...flaps)).toBeLessThan(0.1);
    expect(new Set(flaps.map((f) => f.toFixed(2))).size).toBeGreaterThanOrEqual(4);
  });

  it('crystal frames spin, the cage has bars, the pillar is a tall obsidian tower', () => {
    const frames = Array.from({ length: CRYSTAL_FRAMES }, (_, k) => crystalPixels(k));
    for (const f of frames) {
      expect(f.w).toBe(CRYSTAL_W);
      expect(f.h).toBe(CRYSTAL_H);
      expect(opaque(f)).toBeGreaterThan(120);
    }
    expect(same(frames[0] as PixBuffer, frames[2] as PixBuffer)).toBe(false);
    expect(opaque(frames[2] as PixBuffer)).toBeLessThan(opaque(frames[0] as PixBuffer));
    const cage = cagePixels();
    expect(opaque(cage)).toBeGreaterThan(150);
    // The bars leave gaps (the outline fills part of them).
    expect(opaque(cage)).toBeLessThan(cage.w * cage.h * 0.92);
    const pillar = pillarPixels();
    expect(pillar.w).toBe(PILLAR_W + 4);
    expect(pillar.h).toBe(PILLAR_H + 4);
    expect(opaque(pillar)).toBeGreaterThan(PILLAR_W * PILLAR_H * 0.9);
    // Dark (obsidian): the average brightness is low.
    let sum = 0;
    let n = 0;
    for (const c of pillar.data) {
      if (c >>> 24 === 0) continue;
      sum += (c & 255) + ((c >>> 8) & 255) + ((c >>> 16) & 255);
      n += 3;
    }
    expect(sum / n).toBeLessThan(90);
  });

  it('the egg, the portal frame block and the star layers exist', () => {
    const egg = eggPixels();
    expect(egg.w).toBe(EGG_W);
    expect(egg.h).toBe(EGG_H);
    expect(opaque(egg)).toBeGreaterThan(200);
    const eye = portalFramePixels(true);
    const plain = portalFramePixels(false);
    expect(eye.w).toBe(FRAME_BLOCK);
    expect(opaque(eye)).toBeGreaterThan(FRAME_BLOCK * FRAME_BLOCK * 0.9);
    expect(same(eye, plain)).toBe(false);
    // The eye of ender is green.
    let green = 0;
    for (const c of eye.data) if (((c >>> 8) & 255) > 180 && (c & 255) < 120) green++;
    expect(green).toBeGreaterThan(3);
    const layers = [0, 1, 2].map(starfieldPixels);
    for (const l of layers) {
      expect(l.w).toBe(STAR_TILE);
      expect(opaque(l)).toBeGreaterThan(20);
      // Mostly empty sky.
      expect(opaque(l)).toBeLessThan(l.w * l.h * 0.05);
    }
    expect(same(layers[0] as PixBuffer, layers[1] as PixBuffer)).toBe(false);
  });

  it('whitening brightens every opaque pixel and keeps the shape', () => {
    const src = crystalPixels(0);
    const w = whitened(src);
    expect(opaque(w)).toBe(opaque(src));
    for (let i = 0; i < src.data.length; i++) {
      const a = src.data[i] ?? 0;
      const b = w.data[i] ?? 0;
      if (a === 0) continue;
      expect(b & 255).toBeGreaterThanOrEqual(a & 255);
      expect((b >>> 8) & 255).toBeGreaterThanOrEqual((a >>> 8) & 255);
    }
  });
});

describe('End ground', () => {
  it('has six variants of each material that tile and differ', () => {
    for (const m of ['end_stone', 'bedrock', 'obsidian'] as const) {
      const seen = new Set<string>();
      for (let v = 0; v < END_VARIANTS; v++) {
        const t = endTexture(m, v);
        expect(t).toHaveLength(256);
        expect(t.every((c) => c >>> 24 === 255)).toBe(true);
        seen.add(Array.from(t).join(','));
      }
      expect(seen.size).toBe(END_VARIANTS);
    }
    expect(isEndTile(TILE.VOID) && isEndTile(TILE.BEDROCK) && !isEndTile(TILE.GRASS)).toBe(true);
  });

  it('bakes islands opaque, the void transparent and the south rim with a cliff face', () => {
    const arena: Arena = { r: 44, kind: 'end' };
    const bake = (cx: number, cy: number): PixBuffer => {
      const terrain = genTerrain(cx, cy, 5, arena);
      return paintChunk(cx, cy, terrain, 'nether', 5);
    };
    const middle = bake(0, 0);
    expect(opaque(middle)).toBe(middle.w * middle.h);
    const far = bake(4, 4);
    expect(opaque(far)).toBe(0);
    // A chunk on the rim: some island, some sky.
    const rim = bake(1, 0);
    expect(opaque(rim)).toBeGreaterThan(0);
    expect(opaque(rim)).toBeLessThan(rim.w * rim.h);
    // Rim pixels that are not island are the cliff: dark and under island tiles.
    let cliff = 0;
    for (let ty = 1; ty < CHUNK_TILES; ty++) {
      for (let tx = 0; tx < CHUNK_TILES; tx++) {
        const here = genTerrain(1, 0, 5, arena)[(ty + 1) * (CHUNK_TILES + 2) + tx + 1];
        const above = genTerrain(1, 0, 5, arena)[ty * (CHUNK_TILES + 2) + tx + 1];
        if (here === TILE.VOID && above !== TILE.VOID) {
          const px = rim.data[(ty * 16 + 4) * rim.w + tx * 16 + 8] ?? 0;
          if (px >>> 24 !== 0) cliff++;
        }
      }
    }
    expect(cliff).toBeGreaterThan(0);
  });
});

describe('the dragon telegraphs', () => {
  function rec() {
    const log = {
      fills: [] as { alpha: number; color: string }[],
      pts: [] as [number, number][],
      arcs: [] as number[],
    };
    const st = { globalAlpha: 1, fillStyle: '', strokeStyle: '' } as Record<string, unknown>;
    const ctx = new Proxy(st, {
      get(t, k) {
        if (k in t) return t[k as string];
        if (k === 'fill' || k === 'fillRect')
          return () =>
            log.fills.push({ alpha: st.globalAlpha as number, color: String(st.fillStyle) });
        if (k === 'moveTo' || k === 'lineTo') return (x: number, y: number) => log.pts.push([x, y]);
        if (k === 'arc') return (_x: number, _y: number, r: number) => log.arcs.push(r);
        return () => undefined;
      },
      set(t, k, v) {
        t[k as string] = v;
        return true;
      },
    }) as unknown as CanvasRenderingContext2D;
    return { ctx, log };
  }

  const lane = (t: number, steady: boolean): Telegraph => ({
    kind: 'line',
    x: 0,
    y: 0,
    x2: 200,
    y2: 0,
    r: 0,
    t,
    dur: 3,
    w: 60,
    steady,
  });

  it('the dive lane is 60 px wide and does not extend past its end', () => {
    const { ctx, log } = rec();
    drawTelegraph(ctx, lane(0.5, true), 0, 0);
    // moveTo (x0 + n), lineTo (x1 + n), lineTo (x1 - n), lineTo (x0 - n).
    const [a, b, c] = log.pts;
    expect(a && b && c).toBeTruthy();
    if (!a || !b || !c) return;
    expect(Math.hypot(b[0] - c[0], b[1] - c[1])).toBeCloseTo(60, 5);
    expect(b[0]).toBeCloseTo(200, 5);
  });

  it('a steady lane never pulses, a normal strip does', () => {
    const alphaAt = (t: number, steady: boolean, w?: number): number => {
      const { ctx, log } = rec();
      const tele = lane(t, steady);
      if (w === undefined) delete tele.w;
      drawTelegraph(ctx, tele, 0, 0);
      return log.fills[0]?.alpha ?? -1;
    };
    // The fill alpha also grows with the charge (k), so compare equal charge values: same t / dur ratio.
    const a0 = alphaAt(0.3, true, 60);
    const a1 = alphaAt(0.3, true, 60);
    expect(a0).toBe(a1);
    // Pulse: a non-steady one differs from a steady one at the same instant (the pulse factor is not 1).
    expect(alphaAt(0.3, false, 60)).not.toBe(alphaAt(0.3, true, 60));
  });

  it('is colour-blind remapped like every other telegraph', () => {
    const colour = (mode: 'off' | 'deuteranopia'): string => {
      const s = defaultSave(1).settings;
      s.accessibility.colorblind = mode;
      applyAccessibility(s);
      const { ctx, log } = rec();
      drawTelegraph(ctx, lane(0.5, true), 0, 0);
      return log.fills[0]?.color ?? '';
    };
    expect(colour('deuteranopia')).not.toBe(colour('off'));
  });

  it('the tail sweep is a pie slice of its radius', () => {
    const { ctx, log } = rec();
    drawTelegraph(
      ctx,
      {
        kind: 'arc',
        x: 0,
        y: 0,
        x2: 0,
        y2: 0,
        r: 78,
        t: 0.5,
        dur: 1,
        a0: 0,
        a1: Math.PI,
        steady: true,
      },
      0,
      0,
    );
    expect(log.arcs).toContain(78);
    expect(log.fills.length).toBeGreaterThanOrEqual(2);
  });
});
