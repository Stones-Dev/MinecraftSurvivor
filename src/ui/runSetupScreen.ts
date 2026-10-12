/** Run setup: pick Hero, Pet and Allies from what you own, then start (BRIEF section 5). */
import type { App } from '../app';
import type { Atlas } from '../core/atlas';
import type { SaveData } from '../core/save';
import {
  ALLIES,
  COMPANION_BY_ID,
  HEROES,
  PETS,
  RARITY_COLOR,
  RARITY_LABEL,
  allyById,
  heroById,
  petById,
  type CompanionDef,
} from '../data/companions';
import { heroBaseHp, loadoutFromSave, maxAllySlots, type RunLoadout } from '../systems/meta';
import { buffLine, clipLines, drawPortrait, fitText, shortName } from './collectionScreen';
import { drawPanel, drawText, type Rect } from './panel';
import type { Screen } from './router';
import { Buttons, drawTitle } from './widgets';

interface Picked {
  hero: string;
  pet: string | null;
  allies: string[];
}

/** The loadout as it will actually run: unowned or duplicate entries dropped, allies capped to the slots. */
function picked(data: SaveData): Picked {
  const lo = data.loadout;
  const hero =
    COMPANION_BY_ID.get(lo.hero)?.kind === 'hero' && data.owned[lo.hero] ? lo.hero : 'steve';
  const pet = lo.pet && petById(lo.pet) && data.owned[lo.pet] ? lo.pet : null;
  const allies = lo.allies.filter(
    (id, i) => allyById(id) && data.owned[id] && lo.allies.indexOf(id) === i,
  );
  return { hero, pet, allies: allies.slice(0, maxAllySlots(data)) };
}

/** Next option in `opts` in direction `dir`, skipping `skip` (the id already used by the other slot). */
function cycle(
  opts: (string | null)[],
  cur: string | null,
  dir: number,
  skip: string | null,
): string | null {
  let i = Math.max(0, opts.indexOf(cur));
  for (let n = 0; n < opts.length; n++) {
    i = (i + dir + opts.length) % opts.length;
    const o = opts[i] ?? null;
    if (o === null || o !== skip) return o;
  }
  return cur;
}

function drawSlot(
  ctx: CanvasRenderingContext2D,
  atlas: Atlas,
  t: number,
  label: string,
  def: CompanionDef | null,
  level: number,
  r: Rect,
): void {
  drawPanel(ctx, r, false, def ? RARITY_COLOR[def.rarity] : null);
  drawText(ctx, label, r.x + 19, r.y + 10, '#9a9aa8');
  const tx = r.x + 57;
  const tw = r.w - 57 - 17;
  if (!def) {
    drawText(ctx, 'None', tx, r.y + 22, '#cfcfd8');
    drawText(ctx, 'Nothing equipped.', tx, r.y + 31, '#9a9aa8');
    return;
  }
  const lv = def.kind === 'hero' ? '' : `  Lv ${level}`;
  drawText(
    ctx,
    `${RARITY_LABEL[def.rarity]}${lv}`,
    r.x + r.w - 17,
    r.y + 10,
    RARITY_COLOR[def.rarity],
    'right',
  );
  drawPortrait(ctx, atlas, def, r.x + 36, r.y + r.h - 8, t, 34, r.h - 26, 1.5);
  drawText(ctx, fitText(ctx, shortName(def), tw), tx, r.y + 22);
  const lines = clipLines(ctx, buffLine(def, level), tw, Math.floor((r.h - 35) / 9) + 1);
  lines.forEach((l, i) => drawText(ctx, l, tx, r.y + 31 + i * 9, '#7dff9a'));
}

export function runSetupScreen(
  app: App,
  onStart: (loadout: RunLoadout) => void,
  onBack: () => void,
): Screen {
  const { atlas } = app;
  const buttons = new Buttons();
  let t = 0;

  const start = (): void => {
    app.audio.play('click');
    onStart(loadoutFromSave(app.data()));
  };

  /** Move one slot to the previous (-1) or next (+1) owned option and persist right away. */
  const step = (slot: 'hero' | 'pet' | number, dir: number): void => {
    const data = app.data();
    const cur = picked(data);
    const ownedIds = (list: CompanionDef[]): string[] =>
      list.filter((d) => data.owned[d.id]).map((d) => d.id);
    let { hero, pet, allies } = cur;
    if (slot === 'hero') {
      hero = cycle(ownedIds(HEROES), hero, dir, null) ?? 'steve';
    } else if (slot === 'pet') {
      pet = cycle([null, ...ownedIds(PETS)], pet, dir, null);
    } else {
      const slots = [allies[0] ?? null, allies[1] ?? null];
      slots[slot] = cycle(
        [null, ...ownedIds(ALLIES)],
        slots[slot] ?? null,
        dir,
        slots[1 - slot] ?? null,
      );
      allies = slots.filter((id): id is string => id !== null);
    }
    data.loadout = { hero, pet, allies };
    app.audio.play('click');
    app.store.save(data);
  };

  return {
    update(dt) {
      t += dt;
    },
    render(view) {
      const { ctx, width, height } = view;
      const data = app.data();
      drawTitle(view, 'RUN SETUP');
      const cur = picked(data);
      const two = maxAllySlots(data) === 2;
      const hero = heroById(cur.hero);

      // Layout: 2x2 slot grid, then the hero summary, then the button row.
      const by = height - 22;
      const sumLines = height >= 220 ? 2 : 1;
      const firstBase = by - 5 - 9 * sumLines;
      const gridTop = 22;
      const gap = 4;
      const cw = Math.floor((width - 12 - gap) / 2);
      const ch = Math.floor((firstBase - 8 - gridTop - gap) / 2);
      const cell = (i: number): Rect => ({
        x: 6 + (i % 2) * (cw + gap),
        y: gridTop + Math.floor(i / 2) * (ch + gap),
        w: cw,
        h: ch,
      });

      const lvl = (id: string | null): number => (id ? (data.owned[id]?.level ?? 1) : 1);
      const defOf = (id: string | null): CompanionDef | null =>
        id ? (COMPANION_BY_ID.get(id) ?? null) : null;
      const petOpts = PETS.filter((d) => data.owned[d.id]).length;
      const allyOpts = ALLIES.filter((d) => data.owned[d.id]).length;
      const slots: {
        label: string;
        id: string | null;
        slot: 'hero' | 'pet' | number;
        n: number;
      }[] = [
        {
          label: 'HERO',
          id: cur.hero,
          slot: 'hero',
          n: HEROES.filter((d) => data.owned[d.id]).length,
        },
        { label: 'PET', id: cur.pet, slot: 'pet', n: petOpts + 1 },
        { label: two ? 'ALLY 1' : 'ALLY', id: cur.allies[0] ?? null, slot: 0, n: allyOpts + 1 },
      ];
      if (two) {
        slots.push({ label: 'ALLY 2', id: cur.allies[1] ?? null, slot: 1, n: allyOpts + 1 });
      }

      buttons.begin();
      slots.forEach((s, i) => {
        const r = cell(i);
        drawSlot(ctx, atlas, t, s.label, defOf(s.id), lvl(s.id), r);
        // Ally 2 only opens up once Ally 1 is filled, so the two slots never fragment.
        const off = s.n <= 1 || (s.slot === 1 && !cur.allies[0]);
        const ay = r.y + Math.floor((r.h - 16) / 2) + 3;
        buttons.add({ x: r.x + 3, y: ay, w: 12, h: 16 }, '<', () => step(s.slot, -1), off);
        buttons.add({ x: r.x + r.w - 15, y: ay, w: 12, h: 16 }, '>', () => step(s.slot, 1), off);
      });
      if (!two) {
        const r = cell(3);
        drawPanel(ctx, r);
        drawText(ctx, 'ALLY 2', r.x + 6, r.y + 10, '#9a9aa8');
        clipLines(
          ctx,
          'Locked. Buy Leadership in Upgrades for a second Ally slot.',
          r.w - 12,
          4,
        ).forEach((l, i) => drawText(ctx, l, r.x + 6, r.y + 22 + i * 9, '#6a6a76'));
      }

      // Hero summary.
      const stats = `${hero.name}   HP ${heroBaseHp(hero.id)}   Dmg x${hero.dmg}   Speed x${hero.speed}`;
      drawText(ctx, stats, width / 2, firstBase, '#ffd84a', 'center');
      clipLines(ctx, `${hero.passiveName}: ${hero.passive}`, width - 12, sumLines).forEach((l, i) =>
        drawText(ctx, l, width / 2, firstBase + 9 * (i + 1), '#cfcfd8', 'center'),
      );

      const x0 = Math.floor((width - 186) / 2);
      buttons.add({ x: x0, y: by, w: 70, h: 16 }, 'Back', onBack);
      buttons.add({ x: x0 + 76, y: by, w: 110, h: 16 }, 'START RUN', start);
      buttons.draw(view);
    },
    onMove(x, y) {
      buttons.move(x, y);
    },
    onClick(x, y) {
      buttons.click(x, y);
    },
    onKey(code) {
      if (code === 'Escape') onBack();
      else if (code === 'Enter') start();
    },
  };
}
