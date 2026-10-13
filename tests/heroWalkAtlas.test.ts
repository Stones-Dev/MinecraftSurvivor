import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WALK_DIRS, WALK_FRAMES } from '../src/core/heroAnim';
import { ARMOR_IDS, SWORD_IDS } from '../src/data/tiers';
import { columnBottoms, findFeet } from './helpers/feet';
import { readPng } from './helpers/png';

interface Frame {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  ox: number;
  oy: number;
  fx?: number;
  fy?: number;
  bx?: number;
}
interface AtlasJson {
  pages: string[];
  frames: Record<string, Frame>;
  anims: Record<string, { frames: string[]; fps: number; loop: boolean }>;
}
const atlas = JSON.parse(
  readFileSync(new URL('../public/atlas/atlas.json', import.meta.url), 'utf8'),
) as AtlasJson;
const HEROES = ['steve', 'alex', 'rana'] as const;

describe('hero walk cycle in the atlas', () => {
  it('has 4 directions x 4 frames for every hero and armour tier', () => {
    let n = 0;
    for (const hero of HEROES)
      for (const armor of ARMOR_IDS)
        for (const dir of WALK_DIRS) {
          const a = atlas.anims[`hero.${hero}.${armor}.none.walk_${dir}`];
          expect(a, `${hero} ${armor} ${dir}`).toBeDefined();
          expect(a?.frames.length).toBe(WALK_FRAMES);
          expect(a?.loop).toBe(true);
          for (const k of a?.frames ?? []) {
            expect(atlas.frames[k], k).toBeDefined();
            expect(atlas.frames[`${k}@flash`], `${k}@flash`).toBeDefined();
            n++;
          }
        }
    expect(n).toBe(3 * 8 * 4 * 4);
  });

  it('every directional row is a different picture (front, left, right, back are not duplicates)', () => {
    for (const hero of HEROES) {
      const first = WALK_DIRS.map(
        (d) => atlas.anims[`hero.${hero}.none.none.walk_${d}`]?.frames[0],
      );
      expect(new Set(first).size).toBe(4);
    }
  });

  it('left and right rows face opposite ways (the profile frames are real sprites, not mirrors)', () => {
    // The two profile rows have the same size but are different pixels.
    for (const hero of HEROES) {
      const l = atlas.frames[atlas.anims[`hero.${hero}.none.none.walk_left`]?.frames[0] ?? ''];
      const r = atlas.frames[atlas.anims[`hero.${hero}.none.none.walk_right`]?.frames[0] ?? ''];
      expect(l && r && (l.x !== r.x || l.y !== r.y || l.page !== r.page)).toBe(true);
    }
  });

  it('has a held sword for every hero and sword tier, anchored on the fist inside the sprite', () => {
    for (const hero of HEROES)
      for (const tier of SWORD_IDS) {
        const a = atlas.anims[`hero.${hero}.none.sword_${tier}.held`];
        expect(a, `${hero} ${tier}`).toBeDefined();
        const f = atlas.frames[a?.frames[0] ?? ''];
        expect(f).toBeDefined();
        if (!f) continue;
        expect(f.ox).toBeGreaterThanOrEqual(0);
        expect(f.ox).toBeLessThanOrEqual(f.w);
        expect(f.oy).toBeGreaterThanOrEqual(0);
        expect(f.oy).toBeLessThanOrEqual(f.h);
        expect(f.w).toBeGreaterThan(8);
        expect(f.h).toBeGreaterThan(8);
        expect(atlas.frames[`${a?.frames[0]}@flash`]).toBeDefined();
      }
  });

  it('stands the walk frames on the idle baseline (within 1 px, the bob of the passing frames)', () => {
    for (const hero of HEROES)
      for (const armor of ARMOR_IDS) {
        const idle =
          atlas.anims[`hero.${hero}.${armor}.none.idle`] ??
          atlas.anims[`hero.${hero}.none.none.idle`];
        const idleLift = atlas.frames[idle?.frames[0] ?? '']?.fy ?? 0;
        for (const dir of WALK_DIRS)
          for (const k of atlas.anims[`hero.${hero}.${armor}.none.walk_${dir}`]?.frames ?? []) {
            const fy = atlas.frames[k]?.fy;
            if (fy === undefined) continue; // front/back steps of Rana have no flat foot run
            expect(Math.abs(fy - idleLift), `${k} ${hero} ${armor} ${dir}`).toBeLessThanOrEqual(1);
          }
      }
  });

  it('keeps the idle and swing feet on one line and every direction row centred on the same column', () => {
    for (const hero of HEROES) {
      const idle = atlas.anims[`hero.${hero}.none.sword_wood.idle`];
      expect(atlas.frames[idle?.frames[0] ?? '']?.fy).toBe(0);
      // standing frame 0 of every row has its body centre within 2 px of the row's cell centre
      for (const dir of WALK_DIRS) {
        const f = atlas.frames[atlas.anims[`hero.${hero}.none.none.walk_${dir}`]?.frames[0] ?? ''];
        expect(Math.abs(f?.bx ?? 99)).toBeLessThanOrEqual(2);
      }
    }
  });

  it('stores the same feet that the reference measurement reads from the atlas pixels', () => {
    const pages = atlas.pages.map((p) => readPng(new URL(`../public/atlas/${p}`, import.meta.url)));
    let checked = 0;
    for (const [key, f] of Object.entries(atlas.frames)) {
      if (!HEROES.some((h) => key.startsWith(`${h}.`)) || key.endsWith('@flash')) continue;
      const page = pages[f.page];
      if (!page) throw new Error('page');
      const px = new Uint8Array(f.w * f.h * 4);
      for (let y = 0; y < f.h; y++)
        for (let x = 0; x < f.w; x++)
          for (let c = 0; c < 4; c++)
            px[(y * f.w + x) * 4 + c] = page.data[((f.y + y) * page.w + f.x + x) * 4 + c] ?? 0;
      const feet = findFeet(columnBottoms(px, f.w, f.h), f.ox, f.oy);
      if (!feet) {
        expect(f.fx, key).toBeUndefined();
        continue;
      }
      expect(f.fx, key).toBeCloseTo(feet.x, 0);
      expect(f.fy, key).toBe(feet.lift);
      expect(f.bx, key).toBeCloseTo(feet.cx, 0);
      checked++;
    }
    expect(checked).toBeGreaterThan(1500);
  });
});

describe('slicing of the WALKING blocks', () => {
  const sheets = { steve: 8, alex: 8, rana: 8 } as const;
  const have = HEROES.every((h) =>
    existsSync(new URL(`../assets-work/${h}/sections.json`, import.meta.url)),
  );

  it.skipIf(!have)('splits every WALKING block into 4 rows x 4 cells (needs assets-work/)', () => {
    for (const hero of HEROES) {
      const meta = JSON.parse(
        readFileSync(new URL(`../assets-work/${hero}/sections.json`, import.meta.url), 'utf8'),
      ) as {
        sections: {
          n: number;
          cols: number;
          rows: number;
          frames: { empty: boolean; row: number; col: number }[];
        }[];
      };
      const labels = JSON.parse(
        readFileSync(new URL(`../assets-work/${hero}/labels.json`, import.meta.url), 'utf8'),
      ) as { sections: Record<string, string> };
      const walking = meta.sections.filter((s) => labels.sections[String(s.n)] === 'WALKING');
      expect(walking.length).toBe(sheets[hero]);
      for (const s of walking) {
        expect(s.cols).toBe(4);
        expect(s.rows).toBe(4);
        expect(s.frames.length).toBe(16);
        expect(s.frames.every((f) => !f.empty)).toBe(true);
        expect(s.frames.map((f) => f.row * 4 + f.col)).toEqual([...Array(16).keys()]);
      }
    }
  });

  it('is recorded in the manifest: 96 shipped walk entries of 4 frames', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../assets-src/manifest.json', import.meta.url), 'utf8'),
    ) as { entries: { id: string; ship: boolean; frames: number[]; loop: boolean }[] };
    const walks = manifest.entries.filter((e) => /^hero\.\w+\.\w+\.none\.walk_/.test(e.id));
    expect(walks.length).toBe(96);
    for (const e of walks) {
      expect(e.ship).toBe(true);
      expect(e.loop).toBe(true);
      expect(e.frames.length).toBe(4);
    }
  });
});
