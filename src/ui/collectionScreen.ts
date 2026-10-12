/** The Collection screen: Heroes / Pets / Allies tabs, a card grid, a detail panel and equip controls. */
import type { App } from '../app';
import type { Atlas } from '../core/atlas';
import type { SaveData } from '../core/save';
import {
  ALLIES,
  HEROES,
  MAX_COMPANION_LEVEL,
  PETS,
  RARITY_COLOR,
  RARITY_LABEL,
  petText,
  type CompanionDef,
} from '../data/companions';
import { dupesToReach } from '../systems/gacha';
import { maxAllySlots } from '../systems/meta';
import { drawIcon } from './icons';
import { drawPanel, drawText, fitText, inRect, wrap, type Rect } from './panel';
import type { Screen } from './router';
import { Buttons, drawCompanion, drawTitle } from './widgets';

/** First idle frame size (w, h) of every companion sprite, used to fit portraits into boxes. */
const SIZE: Record<string, readonly [number, number]> = {
  steve: [19, 35],
  alex: [18, 35],
  rana: [18, 34],
  chicken: [19, 17],
  pig: [37, 21],
  cow: [43, 28],
  sheep: [35, 24],
  rabbit: [22, 23],
  cat: [53, 20],
  parrot: [21, 21],
  bee: [25, 16],
  frog: [22, 17],
  fox: [38, 22],
  turtle: [53, 21],
  axolotl: [47, 15],
  wolf_pup: [21, 12],
  panda: [31, 19],
  strider: [26, 37],
  wolf: [37, 22],
  snow_golem: [33, 51],
  trader_llama: [40, 40],
  fletcher: [17, 39],
  cleric: [17, 38],
  weaponsmith: [17, 38],
  armorer: [17, 38],
  librarian: [17, 40],
  horse: [48, 39],
  iron_golem: [44, 60],
};

/** Draw a companion centred on `cx` with its feet at `feetY`, shrunk to fit a boxW x boxH box. */
export function drawPortrait(
  ctx: CanvasRenderingContext2D,
  atlas: Atlas,
  def: CompanionDef,
  cx: number,
  feetY: number,
  t: number,
  boxW: number,
  boxH: number,
  maxScale = 1,
  alpha = 1,
): void {
  const [w, h] = SIZE[def.id] ?? [32, 32];
  const scale = Math.min(maxScale, boxW / w, boxH / h);
  drawCompanion(ctx, atlas, def, cx, feetY, t, scale, alpha);
}

/** Word-wrap `s` into at most maxLines lines; the last visible line ends in '..' when text is cut. */
export function clipLines(
  ctx: CanvasRenderingContext2D,
  s: string,
  maxW: number,
  maxLines: number,
): string[] {
  const lines = wrap(ctx, s, maxW);
  if (lines.length <= maxLines) return lines;
  const cut = lines.slice(0, Math.max(0, maxLines));
  if (cut.length > 0) cut[cut.length - 1] = fitText(lines.slice(cut.length - 1).join(' '), maxW);
  return cut;
}

/** Display name for tight spaces (villager professions drop the shared prefix). */
export function shortName(def: CompanionDef): string {
  return def.name.replace(/^Villager /, '');
}

/** The one-line buff description at a given level. */
export function buffLine(def: CompanionDef, level: number): string {
  if (def.kind === 'hero') return `${def.passiveName}: ${def.passive}`;
  return def.kind === 'pet' ? petText(def, level) : def.text;
}

interface Tab {
  label: string;
  list: CompanionDef[];
}

const TABS: Tab[] = [
  { label: 'Heroes', list: HEROES },
  { label: 'Pets', list: PETS },
  { label: 'Allies', list: ALLIES },
];

const CARD_H = 52;
const GAP = 3;

function isEquipped(data: SaveData, def: CompanionDef): boolean {
  if (def.kind === 'hero') return data.loadout.hero === def.id;
  if (def.kind === 'pet') return data.loadout.pet === def.id;
  return data.loadout.allies.includes(def.id);
}

function drawCard(
  ctx: CanvasRenderingContext2D,
  atlas: Atlas,
  t: number,
  data: SaveData,
  def: CompanionDef,
  r: Rect,
  selected: boolean,
): void {
  const o = data.owned[def.id];
  drawPanel(ctx, r, selected, RARITY_COLOR[def.rarity]);
  drawPortrait(ctx, atlas, def, r.x + r.w / 2, r.y + 36, t, r.w - 6, 32, 1, o ? 1 : 0.3);
  if (!o) {
    ctx.fillStyle = 'rgba(12,12,18,0.45)';
    ctx.fillRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
  }
  drawText(
    ctx,
    fitText(o ? shortName(def) : '???', r.w - 4),
    r.x + r.w / 2,
    r.y + 45,
    '#fff',
    'center',
  );
  if (o && def.kind !== 'hero') {
    // Level pips (1-5), centred under the name.
    const px = Math.round(r.x + (r.w - (MAX_COMPANION_LEVEL * 5 - 1)) / 2);
    for (let i = 0; i < MAX_COMPANION_LEVEL; i++) {
      ctx.fillStyle = i < o.level ? RARITY_COLOR[def.rarity] : '#101014';
      ctx.fillRect(px + i * 5, r.y + r.h - 5, 4, 2);
    }
  }
  if (isEquipped(data, def)) drawIcon(ctx, 'star', r.x + r.w - 12, r.y + 1);
}

function drawDetail(
  ctx: CanvasRenderingContext2D,
  atlas: Atlas,
  t: number,
  data: SaveData,
  def: CompanionDef,
  r: Rect,
  message: string,
): void {
  const o = data.owned[def.id];
  const rc = RARITY_COLOR[def.rarity];
  drawPanel(ctx, r, false, o ? rc : null);
  const tx = r.x + 46;
  const tw = r.w - 50;
  drawText(ctx, o ? def.name : '???', r.x + 5, r.y + 11);
  drawPortrait(ctx, atlas, def, r.x + 24, r.y + 59, t, 38, 40, 1.5, o ? 1 : 0.3);
  drawText(ctx, RARITY_LABEL[def.rarity], tx, r.y + 24, rc);
  let buff = 'Pull it at the Spawner to unlock.';
  if (o) {
    buff = buffLine(def, o.level);
    if (def.kind === 'hero') {
      drawText(ctx, `Shards ${o.shards}`, r.x + r.w - 5, r.y + 11, '#9a9aa8', 'right');
      drawText(ctx, `HP ${def.hp}`, tx, r.y + 33, '#cfcfd8');
      drawText(ctx, `Dmg x${def.dmg}`, tx, r.y + 42, '#cfcfd8');
      drawText(ctx, `Speed x${def.speed}`, tx, r.y + 51, '#cfcfd8');
    } else {
      drawText(ctx, `Level ${o.level}/${MAX_COMPANION_LEVEL}`, tx, r.y + 33, '#ffd84a');
      const max = o.level >= MAX_COMPANION_LEVEL;
      const need = dupesToReach(o.level + 1);
      drawText(ctx, max ? 'Max level' : `Shards ${o.shards}/${need}`, tx, r.y + 42, '#cfcfd8');
      if (!max) {
        ctx.fillStyle = '#101014';
        ctx.fillRect(tx, r.y + 45, tw, 4);
        ctx.fillStyle = rc;
        ctx.fillRect(tx + 1, r.y + 46, Math.round(((tw - 2) * Math.min(o.shards, need)) / need), 2);
      }
      if (def.kind === 'ally') drawText(ctx, `HP ${def.hp}`, tx, r.y + 58, '#cfcfd8');
    }
  } else {
    drawText(ctx, 'Not found yet', tx, r.y + 33, '#9a9aa8');
  }
  // Buff text, then the lore quip in whatever room is left.
  const bottom = r.y + r.h - 4;
  const textW = r.w - 8;
  let y = r.y + 70;
  const room = (): number => Math.max(0, Math.floor((bottom - y) / 9) + 1);
  const buffLines = clipLines(ctx, buff, textW, Math.min(room(), def.kind === 'hero' ? 3 : 4));
  for (const l of buffLines) {
    drawText(ctx, l, r.x + 5, y, o ? '#7dff9a' : '#9a9aa8');
    y += 9;
  }
  if (!o) return;
  y += 2;
  const loreRoom = room() - (message ? 1 : 0);
  clipLines(ctx, `"${def.quip}"`, textW, loreRoom).forEach((l, i) =>
    drawText(ctx, l, r.x + 5, y + i * 9, '#9a9aa8'),
  );
  if (message) drawText(ctx, message, r.x + 5, bottom, '#ff9a9a');
}

export function collectionScreen(app: App, onBack: () => void): Screen {
  const { atlas } = app;
  const buttons = new Buttons();
  let t = 0;
  let tabIdx = 0;
  let message = '';
  const selected = TABS.map((tab) => tab.list[0]?.id ?? '');
  const pages = TABS.map(() => 0);
  let tabRects: Rect[] = [];
  let cardHits: { r: Rect; id: string }[] = [];

  const setTab = (i: number): void => {
    tabIdx = (i + TABS.length) % TABS.length;
    message = '';
  };

  const toggleEquip = (def: CompanionDef): void => {
    const data = app.data();
    if (!data.owned[def.id]) return;
    const lo = data.loadout;
    message = '';
    if (def.kind === 'hero') {
      lo.hero = def.id;
    } else if (def.kind === 'pet') {
      lo.pet = lo.pet === def.id ? null : def.id;
    } else if (lo.allies.includes(def.id)) {
      lo.allies = lo.allies.filter((id) => id !== def.id);
    } else if (lo.allies.length >= maxAllySlots(data)) {
      message = 'Ally slots full';
      return;
    } else {
      lo.allies = [...lo.allies, def.id];
    }
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
      drawTitle(view, 'COLLECTION');
      const tab = TABS[tabIdx] as Tab;
      const list = tab.list;

      // Tabs with owned counts.
      const tw = 82;
      const tx0 = Math.floor((width - (TABS.length * tw + (TABS.length - 1) * 4)) / 2);
      tabRects = TABS.map((_, i) => ({ x: tx0 + i * (tw + 4), y: 22, w: tw, h: 13 }));
      TABS.forEach((tb, i) => {
        const r = tabRects[i] as Rect;
        const have = tb.list.filter((d) => data.owned[d.id]).length;
        drawPanel(ctx, r, i === tabIdx);
        drawText(
          ctx,
          `${tb.label} ${have}/${tb.list.length}`,
          r.x + r.w / 2,
          r.y + 9,
          i === tabIdx ? '#ffd84a' : '#cfcfd8',
          'center',
        );
      });

      // Geometry: grid on the left, detail panel on the right, button row at the bottom.
      const top = 39;
      const bottom = height - 24;
      const dw = width >= 400 ? 140 : 132;
      const detail: Rect = { x: width - 6 - dw, y: top, w: dw, h: bottom - top };
      const cw = width >= 400 ? 36 : 32;
      const areaW = detail.x - 4 - 6;
      const cols = Math.max(1, Math.floor((areaW + GAP) / (cw + GAP)));
      const rows = Math.max(1, Math.floor((bottom - top + GAP) / (CARD_H + GAP)));
      const perPage = cols * rows;
      const pageCount = Math.max(1, Math.ceil(list.length / perPage));
      const page = Math.min(pages[tabIdx] ?? 0, pageCount - 1);
      pages[tabIdx] = page;
      const gx = 6 + Math.floor((areaW - (cols * (cw + GAP) - GAP)) / 2);

      cardHits = [];
      list.slice(page * perPage, (page + 1) * perPage).forEach((def, i) => {
        const r: Rect = {
          x: gx + (i % cols) * (cw + GAP),
          y: top + Math.floor(i / cols) * (CARD_H + GAP),
          w: cw,
          h: CARD_H,
        };
        cardHits.push({ r, id: def.id });
        drawCard(ctx, atlas, t, data, def, r, def.id === selected[tabIdx]);
      });

      const sel = list.find((d) => d.id === selected[tabIdx]) ?? (list[0] as CompanionDef);
      drawDetail(ctx, atlas, t, data, sel, detail, message);

      // Buttons: paging on the left, Equip and Back on the right.
      buttons.begin();
      const by = height - 20;
      buttons.add(
        { x: 6, y: by, w: 40, h: 16 },
        'Prev',
        () => (pages[tabIdx] = page - 1),
        page <= 0,
      );
      buttons.add(
        { x: 80, y: by, w: 40, h: 16 },
        'Next',
        () => (pages[tabIdx] = page + 1),
        page >= pageCount - 1,
      );
      const owned = !!data.owned[sel.id];
      const equipped = isEquipped(data, sel);
      const label = !owned
        ? 'Locked'
        : sel.kind === 'hero' && equipped
          ? 'Equipped'
          : equipped
            ? 'Unequip'
            : 'Equip';
      buttons.add(
        { x: width - 6 - 50 - 6 - 72, y: by, w: 72, h: 16 },
        label,
        () => toggleEquip(sel),
        !owned || (sel.kind === 'hero' && equipped),
      );
      buttons.add({ x: width - 6 - 50, y: by, w: 50, h: 16 }, 'Back', onBack);
      buttons.draw(view);
      drawText(ctx, `${page + 1}/${pageCount}`, 63, by + 11, '#cfcfd8', 'center');
    },
    onMove(x, y) {
      buttons.move(x, y);
    },
    onClick(x, y) {
      if (buttons.click(x, y)) return;
      const tabHit = tabRects.findIndex((r) => inRect(r, x, y));
      if (tabHit >= 0) {
        if (tabHit !== tabIdx) app.audio.play('click');
        setTab(tabHit);
        return;
      }
      const hit = cardHits.find((c) => inRect(c.r, x, y));
      if (hit) {
        selected[tabIdx] = hit.id;
        message = '';
        app.audio.play('click');
      }
    },
    onKey(code) {
      if (code === 'Escape') onBack();
      else if (code === 'ArrowLeft') setTab(tabIdx - 1);
      else if (code === 'ArrowRight') setTab(tabIdx + 1);
    },
  };
}
