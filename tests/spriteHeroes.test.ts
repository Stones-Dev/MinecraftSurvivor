import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Atlas } from '../src/core/atlas';
import type { AnimDef } from '../src/core/animator';
import { HEROES } from '../src/data/companions';
import { RunState } from '../src/game';
import { drawHero } from '../src/render/entities';
import { defaultLoadout } from '../src/systems/meta';

interface AtlasJson {
  version: number;
  pages: string[];
  frames: Record<string, unknown>;
  anims: Record<string, AnimDef>;
}

const json = JSON.parse(
  readFileSync(new URL('../public/atlas/atlas.json', import.meta.url), 'utf8'),
) as AtlasJson;
const spriteHeroes = HEROES.filter((h) => h.render === 'sprite');

describe('sprite heroes ship their animations', () => {
  for (const h of spriteHeroes) {
    it(`${h.id} (${h.sprite}) has idle/walk, a cast anim and flash frames`, () => {
      const has = (a: string): boolean => `${h.sprite}.${a}` in json.anims;
      expect(has('walk')).toBe(true);
      expect(has('idle') || has('walk')).toBe(true);
      expect((h.castAnims ?? []).some(has)).toBe(true);
      for (const a of ['idle', 'walk']) {
        for (const f of json.anims[`${h.sprite}.${a}`]?.frames ?? []) {
          expect(json.frames[f]).toBeDefined();
          expect(json.frames[`${f}@flash`]).toBeDefined();
        }
      }
      // Villager-style sets need 4 directions x 4 frames.
      if (h.sprite.startsWith('npc.'))
        expect(json.anims[`${h.sprite}.walk`]?.frames.length).toBe(16);
    });
  }

  it('ships the illusioner decoy images', () => {
    expect('mob.illusioner_fake.idle' in json.anims).toBe(true);
  });
});

/** A canvas context that accepts everything and counts drawImage calls. */
function stubCtx(): { ctx: CanvasRenderingContext2D; draws: () => number } {
  let draws = 0;
  const target: Record<string | symbol, unknown> = { canvas: { width: 640, height: 360 } };
  const ctx = new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'drawImage')
        return () => {
          draws++;
        };
      return () => undefined;
    },
    set(t, k, v) {
      t[k] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, draws: () => draws };
}

describe('drawHero for sprite heroes', () => {
  // The atlas pages are images in the browser; any object works for a stub context.
  const atlas = Reflect.construct(
    Atlas as unknown as new (data: AtlasJson, pages: unknown[]) => Atlas,
    [json, json.pages.map(() => ({}))],
  );
  const g = globalThis as { document?: unknown };
  g.document ??= {
    createElement: () => ({ width: 0, height: 0, getContext: () => stubCtx().ctx }),
  };

  for (const h of spriteHeroes) {
    it(`draws ${h.id} idle, walking, swinging, casting, hurt and dead`, () => {
      const run = new RunState(5, 0, { ...defaultLoadout(), hero: h.id });
      const p = run.player;
      const { ctx, draws } = stubCtx();
      const frame = (setup: () => void): void => {
        setup();
        const before = draws();
        drawHero(ctx, atlas, run, 0, 0);
        expect(draws()).toBeGreaterThan(before);
      };
      frame(() => undefined);
      frame(() => {
        p.moving = true;
        p.walkPhase = 5;
        p.moveDX = 1;
        p.moveDY = 0;
      });
      frame(() => {
        p.moveDX = 0;
        p.moveDY = -1;
      });
      frame(() => {
        p.swingT = 0.2;
      });
      frame(() => {
        p.castT = 0.3;
        p.castDur = 0.45;
      });
      frame(() => {
        p.hurtT = 0.1;
      });
      frame(() => {
        p.dead = true;
        run.deadT = 0.4;
      });
    });
  }
});
