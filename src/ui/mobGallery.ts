import type { Atlas } from '../core/atlas';
import type { View } from '../core/canvas';
import { ENEMIES, type EnemyDef } from '../data/enemies';
import { spawnPool } from '../data/rosters';
import { BIOME_IDS, BIOMES, isBiomeId } from '../world/biomes';
import { drawText } from './panel';
import type { Screen } from './router';

/**
 * Debug mob gallery (`?mobs=<biome|new|all>[:page]`): every enemy as the game draws it walking LEFT and walking
 * RIGHT, with its stats, for facing and look reviews. `<biome>` lists the biome's own mobs plus the
 * generic ones it reweights (the pool at minute 12), `new` the mobs bound to a biome, `all` everyone.
 */
export function mobGalleryScreen(atlas: Atlas, spec = 'new'): Screen {
  // `<what>:<page>`; a page holds 18 mobs.
  const [which = 'new', pageText = '0'] = spec.split(':');
  const page = Number(pageText) || 0;
  let defs: EnemyDef[];
  let title = which;
  if (isBiomeId(which)) {
    defs = spawnPool(which, 12, true, true)
      .map((e) => e.def)
      .sort((a, b) => Number(!!b.biomes) - Number(!!a.biomes));
    title = BIOMES[which].name;
  } else if (which === 'all') {
    defs = Object.values(ENEMIES);
  } else {
    defs = Object.values(ENEMIES).filter((d) => d.biomes && d.biomes.length < BIOME_IDS.length);
  }
  const all = defs;
  defs = all.slice(page * 18, page * 18 + 18);
  const COLS = 6;
  const CELL_W = 52;
  const CELL_H = 62;
  const anim = (d: EnemyDef): string => {
    for (const a of ['walk', 'idle', 'summon', 'firing', 'attack']) {
      if (atlas.hasAnim(`${d.sprite}.${a}`)) return `${d.sprite}.${a}`;
    }
    return `${d.sprite}.idle`;
  };
  let t = 0;
  return {
    update(dt) {
      t += dt;
    },
    render(view: View) {
      const { ctx, width, height } = view;
      ctx.fillStyle = '#4a6a46';
      ctx.fillRect(0, 0, width, height);
      drawText(ctx, `Mobs: ${title} page ${page} (${all.length})`, 4, 9, '#fff');
      defs.forEach((d, i) => {
        const cx = (i % COLS) * CELL_W + 2;
        const cy = 14 + Math.floor(i / COLS) * CELL_H;
        if (cy + CELL_H > height + 20) return;
        const id = anim(d);
        if (!atlas.hasAnim(id)) return;
        const a = atlas.anim(id);
        const frames = a.frames;
        const key = frames[Math.floor(t * a.fps) % frames.length];
        if (!key) return;
        const sc = d.scale ?? 1;
        // Same rule as drawEnemy: facing -1 = walking left, +1 = walking right.
        for (const facing of [-1, 1]) {
          const flip = d.faceLeft ? facing > 0 : facing < 0;
          atlas.draw(ctx, key, cx + (facing < 0 ? 12 : 36), cy + 36, flip, sc);
        }
        drawText(ctx, '<', cx + 4, cy + 46, '#ffe27a');
        drawText(ctx, '>', cx + 44, cy + 46, '#ffe27a');
        drawText(ctx, d.id.slice(0, 11), cx, cy + 53, '#fff');
        drawText(ctx, `${d.hp}/${d.dmg}`, cx, cy + 60, '#c8e8ff');
      });
    },
  };
}
