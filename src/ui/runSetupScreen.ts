/**
 * Run setup: pick the Hero, Pet and Allies from what you own (slots on the left, a picker on the right),
 * choose an optional start biome, then start (BRIEF section 5).
 */
import { abilityText } from '../abilities';
import type { App } from '../app';
import type { SaveData } from '../core/save';
import {
  ALLIES,
  COMPANION_BY_ID,
  HEROES,
  MAX_COMPANION_LEVEL,
  PETS,
  RARITY_LABEL,
  allyById,
  petById,
  type CompanionDef,
} from '../data/companions';
import {
  abilityRank,
  heroBaseHp,
  loadoutFromSave,
  maxAllySlots,
  type RunLoadout,
} from '../systems/meta';
import { BIOMES, type BiomeId } from '../world/biomes';
import { buffLine, shortName } from './collectionScreen';
import {
  cycleStartBiome,
  gridMove,
  keyToNav,
  pageCount,
  pageOf,
  setupLayout,
  wrapIndex,
  type NavEvent,
} from './hubModel';
import { drawIcon } from './icons';
import {
  clipText,
  drawPanel,
  drawSlot,
  drawText,
  fitText,
  inRect,
  textWidth,
  UI,
  type Rect,
} from './panel';
import type { Screen } from './router';
import { Buttons, PadNav, drawPortrait, drawTitle, rarityColor } from './widgets';

interface Picked {
  hero: string;
  pet: string | null;
  allies: string[];
}

/** The loadout as it will actually run: unowned or duplicate entries dropped, allies capped to the slots. */
export function picked(data: SaveData): Picked {
  const lo = data.loadout;
  const hero =
    COMPANION_BY_ID.get(lo.hero)?.kind === 'hero' && data.owned[lo.hero] ? lo.hero : 'steve';
  const pet = lo.pet && petById(lo.pet) && data.owned[lo.pet] ? lo.pet : null;
  const allies = lo.allies.filter(
    (id, i) => allyById(id) && data.owned[id] && lo.allies.indexOf(id) === i,
  );
  return { hero, pet, allies: allies.slice(0, maxAllySlots(data)) };
}

type Slot = 'hero' | 'pet' | 0 | 1;

/** What can go in a slot: owned heroes; owned pets or allies plus "none" (null); the other ally is excluded. */
export function slotOptions(data: SaveData, slot: Slot): (CompanionDef | null)[] {
  const owned = (list: CompanionDef[]): CompanionDef[] => list.filter((d) => data.owned[d.id]);
  if (slot === 'hero') return owned(HEROES);
  if (slot === 'pet') return [null, ...owned(PETS)];
  const other = picked(data).allies[1 - slot];
  return [null, ...owned(ALLIES).filter((d) => d.id !== other)];
}

/** The loadout after putting `id` (null = empty) into `slot`; ally 2 only exists once ally 1 is filled. */
export function assignSlot(data: SaveData, slot: Slot, id: string | null): SaveData['loadout'] {
  const cur = picked(data);
  let { hero, pet, allies } = cur;
  if (slot === 'hero') hero = id ?? 'steve';
  else if (slot === 'pet') pet = id;
  else {
    const slots = [allies[0] ?? null, allies[1] ?? null];
    slots[slot] = id;
    allies = slots.filter((a): a is string => a !== null);
  }
  return { hero, pet, allies };
}

/** The remembered start biome for this session (null = Random: drawn per run from the run seed, see resolveStartBiome). */
let lastStartBiome: BiomeId | null = null;

export function runSetupScreen(
  app: App,
  onStart: (loadout: RunLoadout) => void,
  onBack: () => void,
): Screen {
  const { atlas } = app;
  const buttons = new Buttons();
  const pad = new PadNav();
  let t = 0;
  let slot: Slot = 'hero';
  const cursor: Record<string, number> = { hero: 0, pet: 0, '0': 0, '1': 0 };
  let mx = -1;
  let my = -1;
  let slotHits: { r: Rect; slot: Slot; off: boolean }[] = [];
  let cellHits: { r: Rect; i: number }[] = [];
  let cols = 6;
  let perPage = 12;

  const start = (): void => {
    app.audio.play('click');
    const lo = loadoutFromSave(app.data());
    onStart(lastStartBiome ? { ...lo, startBiome: lastStartBiome } : lo);
  };

  const key = (s: Slot): string => String(s);
  const options = (): (CompanionDef | null)[] => slotOptions(app.data(), slot);
  const equippedId = (data: SaveData, s: Slot): string | null => {
    const p = picked(data);
    return s === 'hero' ? p.hero : s === 'pet' ? p.pet : (p.allies[s] ?? null);
  };

  /** Put the cursor on whatever is currently equipped in the slot. */
  const sync = (): void => {
    const data = app.data();
    const id = equippedId(data, slot);
    const i = slotOptions(data, slot).findIndex((d) => (d?.id ?? null) === id);
    cursor[key(slot)] = Math.max(0, i);
  };
  sync();

  const setSlot = (s: Slot): void => {
    if (s === slot) return;
    const data = app.data();
    // Ally 2 only opens once ally 1 holds someone (and Leadership is bought).
    if (s === 1 && (maxAllySlots(data) < 2 || !picked(data).allies[0])) return;
    slot = s;
    app.audio.play('click');
    sync();
  };

  const slotList = (): Slot[] =>
    maxAllySlots(app.data()) >= 2 ? ['hero', 'pet', 0, 1] : ['hero', 'pet', 0];

  const cycleSlot = (dir: number): void => {
    const list = slotList().filter((s) => s !== 1 || picked(app.data()).allies[0]);
    const i = list.indexOf(slot);
    setSlot(list[wrapIndex(i < 0 ? 0 : i, dir, list.length)] ?? 'hero');
  };

  const choose = (i: number): void => {
    const opts = options();
    const def = opts[i];
    const data = app.data();
    if (def === undefined) return;
    const id = def?.id ?? null;
    cursor[key(slot)] = i;
    if (equippedId(data, slot) === id) return;
    data.loadout = assignSlot(data, slot, id);
    app.audio.play('click');
    app.store.save(data);
    // Emptying ally 1 can leave ally 2 pointing at nothing: fall back to a valid slot.
    if (slot === 1 && !picked(data).allies[1]) sync();
  };

  const nav = (ev: NavEvent): void => {
    const n = options().length;
    const cur = cursor[key(slot)] ?? 0;
    switch (ev) {
      case 'left':
      case 'right':
      case 'up':
      case 'down':
        cursor[key(slot)] = gridMove(cur, ev, cols, n);
        break;
      case 'ok': {
        const def = options()[cur];
        const same = (def?.id ?? null) === equippedId(app.data(), slot);
        if (same) start();
        else choose(cur);
        break;
      }
      case 'back':
        onBack();
        break;
      case 'prev':
        cycleSlot(-1);
        break;
      case 'next':
        cycleSlot(1);
        break;
    }
  };

  const slotName = (s: Slot, two: boolean): string =>
    s === 'hero' ? 'HERO' : s === 'pet' ? 'PET' : two ? `ALLY ${Number(s) + 1}` : 'ALLY';

  const drawSlotRow = (
    ctx: CanvasRenderingContext2D,
    data: SaveData,
    s: Slot,
    r: Rect,
    two: boolean,
    off: boolean,
  ): void => {
    const on = s === slot;
    const id = equippedId(data, s);
    const def = id ? (COMPANION_BY_ID.get(id) ?? null) : null;
    drawPanel(ctx, r, on || inRect(r, mx, my), on ? UI.gold : def ? rarityColor(def.rarity) : null);
    const box = r.h - 6;
    const ps = { x: r.x + 3, y: r.y + 3, w: box, h: box };
    drawSlot(ctx, ps, { color: def ? rarityColor(def.rarity) : null, locked: off });
    const tx = ps.x + box + 4;
    const tw = r.x + r.w - 4 - tx;
    if (off) {
      drawIcon(ctx, 'lock', ps.x + Math.floor((box - 12) / 2), ps.y + Math.floor((box - 12) / 2));
      drawText(ctx, slotName(s, two), tx, r.y + 10, UI.faint);
      const why = maxAllySlots(data) < 2 ? 'Buy Leadership' : 'Fill ally 1 first';
      drawText(ctx, fitText(why, tw), tx, r.y + 20, UI.faint);
      return;
    }
    if (def) drawPortrait(ctx, atlas, def, ps.x + box / 2, ps.y + box - 2, t, box - 4, box - 4, 2);
    else
      drawIcon(ctx, 'cross', ps.x + Math.floor((box - 12) / 2), ps.y + Math.floor((box - 12) / 2));
    drawText(ctx, slotName(s, two), tx, r.y + 10, on ? UI.gold : UI.dim);
    drawText(ctx, fitText(def ? shortName(def) : 'None', tw), tx, r.y + 20, def ? '#fff' : UI.soft);
    if (def && def.kind !== 'hero' && r.h >= 30) {
      drawText(ctx, `Lv ${data.owned[def.id]?.level ?? 1}`, tx, r.y + 29, UI.gold);
    }
  };

  const drawCell = (
    ctx: CanvasRenderingContext2D,
    data: SaveData,
    def: CompanionDef | null,
    r: Rect,
    isCursor: boolean,
    isEquipped: boolean,
    hover: boolean,
  ): void => {
    drawSlot(ctx, r, {
      color: def ? rarityColor(def.rarity) : null,
      selected: isCursor,
      hover,
    });
    if (!def) {
      drawIcon(
        ctx,
        'cross',
        r.x + Math.floor((r.w - 12) / 2),
        r.y + Math.floor((r.h - 12) / 2) - 3,
      );
      drawText(ctx, 'None', r.x + r.w / 2, r.y + r.h - 4, UI.dim, 'center');
      return;
    }
    const pips = def.kind !== 'hero';
    drawPortrait(
      ctx,
      atlas,
      def,
      r.x + r.w / 2,
      r.y + r.h - (pips ? 8 : 4),
      t,
      r.w - 6,
      r.h - (pips ? 12 : 8),
      2,
    );
    if (pips) {
      const lv = data.owned[def.id]?.level ?? 1;
      const px = Math.round(r.x + (r.w - (MAX_COMPANION_LEVEL * 5 - 1)) / 2);
      for (let i = 0; i < MAX_COMPANION_LEVEL; i++) {
        ctx.fillStyle = i < lv ? rarityColor(def.rarity) : '#06060a';
        ctx.fillRect(px + i * 5, r.y + r.h - 5, 4, 2);
      }
    }
    if (isEquipped) drawIcon(ctx, 'star', r.x + r.w - 12, r.y + 1);
  };

  const drawDetail = (
    ctx: CanvasRenderingContext2D,
    data: SaveData,
    def: CompanionDef | null,
    r: Rect,
    tier: string,
  ): void => {
    drawPanel(ctx, r, false, def ? rarityColor(def.rarity) : null, 'slate');
    const x = r.x + 5;
    const w = r.w - 10;
    if (!def) {
      drawText(ctx, 'Empty slot', x, r.y + 11, '#fff');
      drawText(ctx, 'Nothing equipped here.', x, r.y + 21, UI.dim);
      return;
    }
    const rc = rarityColor(def.rarity);
    const label = RARITY_LABEL[def.rarity];
    drawText(ctx, label, r.x + r.w - 5, r.y + 11, rc, 'right');
    drawText(ctx, fitText(def.name, w - textWidth(label) - 6), x, r.y + 11, '#fff');
    let y = r.y + 21;
    if (def.kind === 'hero') {
      if (tier !== 'compact') {
        drawIcon(ctx, 'heart', x, y - 8);
        drawText(ctx, String(heroBaseHp(def.id)), x + 14, y, '#ff9a9a');
        drawIcon(ctx, 'sword', x + 46, y - 8);
        drawText(ctx, `x${def.dmg}`, x + 60, y, '#ffd0a0');
        drawIcon(ctx, 'boots', x + 88, y - 8);
        drawText(ctx, `x${def.speed}`, x + 102, y, '#a0e0ff');
        y += 12;
      }
      const o = data.owned[def.id];
      const txt = abilityText(def.id, abilityRank(o?.shards ?? 0));
      const room = Math.floor((r.y + r.h - 4 - y) / 9);
      const lines = clipText(`${txt.name}: ${txt.blurb}`, w, Math.max(1, room - 1));
      lines.forEach((l, i) => drawText(ctx, l, x, y + i * 9, i === 0 ? UI.gold : UI.soft));
      y += lines.length * 9;
      if (y <= r.y + r.h - 4) {
        drawText(ctx, fitText(`Passive: ${def.passiveName}`, w), x, y, UI.green);
      }
      return;
    }
    const lv = data.owned[def.id]?.level ?? 1;
    drawText(ctx, `Level ${lv}/${MAX_COMPANION_LEVEL}`, x, y, UI.gold);
    y += 9;
    const room = Math.floor((r.y + r.h - 4 - y) / 9) + 1;
    clipText(buffLine(def, lv), w, Math.max(1, room)).forEach((l, i) =>
      drawText(ctx, l, x, y + i * 9, UI.green),
    );
  };

  return {
    update(dt) {
      t += dt;
      for (const ev of pad.poll(dt)) nav(ev);
    },
    render(view) {
      const { ctx, width, height } = view;
      const data = app.data();
      const L = setupLayout(width, height);
      drawTitle(view, 'RUN SETUP');
      const two = maxAllySlots(data) >= 2;
      const cur = picked(data);

      // Slots column.
      slotHits = [];
      const slots: Slot[] = two ? ['hero', 'pet', 0, 1] : ['hero', 'pet', 0];
      slots.forEach((s, i) => {
        const r: Rect = {
          x: L.slotX,
          y: L.slotsY + i * (L.rowH + L.rowGap),
          w: L.slotW,
          h: L.rowH,
        };
        const off = s === 1 && !cur.allies[0];
        slotHits.push({ r, slot: s, off });
        drawSlotRow(ctx, data, s, r, two, off);
      });
      if (!two) {
        const r: Rect = {
          x: L.slotX,
          y: L.slotsY + 3 * (L.rowH + L.rowGap),
          w: L.slotW,
          h: L.rowH,
        };
        drawPanel(ctx, r, false, null, 'slate');
        drawIcon(ctx, 'lock', r.x + 4, r.y + Math.floor((r.h - 12) / 2));
        drawText(ctx, 'ALLY 2', r.x + 20, r.y + 10, UI.faint);
        clipText(
          'Buy Leadership in Upgrades.',
          r.w - 24,
          Math.max(1, Math.floor((r.h - 12) / 9)),
        ).forEach((l, i) => drawText(ctx, l, r.x + 20, r.y + 20 + i * 9, UI.faint));
      }

      // Picker.
      const opts = options();
      cols = L.grid.cols;
      perPage = L.grid.cols * L.grid.rows;
      const idx = Math.min(cursor[key(slot)] ?? 0, Math.max(0, opts.length - 1));
      const pages = pageCount(opts.length, perPage);
      const page = Math.min(pageOf(idx, perPage), pages - 1);
      const title =
        slot === 'hero' ? 'Choose your hero' : slot === 'pet' ? 'Choose a pet' : 'Choose an ally';
      drawText(ctx, title, L.picker.x + 2, L.picker.y + 8, UI.gold);
      if (pages > 1) {
        drawText(
          ctx,
          `${page + 1}/${pages}`,
          L.picker.x + L.picker.w - 2,
          L.picker.y + 8,
          UI.dim,
          'right',
        );
      }
      cellHits = [];
      const eq = equippedId(data, slot);
      const g = L.grid;
      let hover: CompanionDef | null | undefined;
      opts.slice(page * perPage, (page + 1) * perPage).forEach((def, k) => {
        const i = page * perPage + k;
        const r: Rect = {
          x: g.x + (k % g.cols) * (g.cw + g.gap),
          y: g.y + Math.floor(k / g.cols) * (g.ch + g.gap),
          w: g.cw,
          h: g.ch,
        };
        cellHits.push({ r, i });
        const hov = inRect(r, mx, my);
        if (hov) hover = def;
        drawCell(ctx, data, def, r, i === idx, (def?.id ?? null) === eq, hov);
      });
      drawDetail(ctx, data, hover !== undefined ? hover : (opts[idx] ?? null), L.detail, L.tier);

      // Bottom bar: Back, start biome, START RUN.
      buttons.begin();
      const by = L.barY;
      const startW = L.tier === 'compact' ? 96 : 120;
      buttons.add({ x: 6, y: by, w: 46, h: 16 }, 'Back', onBack, false, { key: 'back' });
      buttons.add({ x: width - 6 - startW, y: by, w: startW, h: 16 }, 'START RUN', start, false, {
        key: 'start',
        variant: 'primary',
        icon: 'sword',
      });
      const bx = 6 + 46 + 6;
      const bw = width - 6 - startW - 6 - bx;
      if (bw >= 70) {
        const label = lastStartBiome ? BIOMES[lastStartBiome].name : 'Random';
        buttons.add(
          { x: bx, y: by, w: 14, h: 16 },
          '<',
          () => (lastStartBiome = cycleStartBiome(lastStartBiome, -1)),
          false,
          {
            key: 'biome-',
            tooltip: 'Previous start biome',
          },
        );
        buttons.add(
          { x: bx + bw - 14, y: by, w: 14, h: 16 },
          '>',
          () => (lastStartBiome = cycleStartBiome(lastStartBiome, 1)),
          false,
          {
            key: 'biome+',
            tooltip: 'Next start biome',
          },
        );
        const mid = { x: bx + 16, y: by, w: bw - 32, h: 16 };
        drawSlot(ctx, mid);
        drawIcon(ctx, lastStartBiome ? 'grass' : 'dice', mid.x + 2, mid.y + 2);
        drawText(
          ctx,
          fitText(`Start: ${label}`, mid.w - 20),
          mid.x +
            17 +
            Math.floor((mid.w - 20 - textWidth(fitText(`Start: ${label}`, mid.w - 20))) / 2),
          mid.y + 11,
          lastStartBiome ? '#fff' : UI.soft,
        );
      }
      buttons.draw(view);
    },
    onMove(x, y) {
      mx = x;
      my = y;
      buttons.move(x, y);
    },
    onClick(x, y) {
      mx = x;
      my = y;
      if (buttons.click(x, y)) return;
      const s = slotHits.find((h) => inRect(h.r, x, y));
      if (s) {
        if (!s.off) setSlot(s.slot);
        return;
      }
      const c = cellHits.find((h) => inRect(h.r, x, y));
      if (c) choose(c.i);
    },
    onKey(code) {
      if (code === 'KeyB') {
        lastStartBiome = cycleStartBiome(lastStartBiome, 1);
        return;
      }
      const ev = keyToNav(code);
      if (ev) nav(ev);
    },
  };
}
