/**
 * The Collection screen: Heroes / Pets / Allies tabs, a paged card grid with rarity frames and locked
 * silhouettes, and a detail panel (stats, hero ability, passive, lore) with equip controls.
 */
import { abilityById, abilityText } from '../abilities';
import type { App } from '../app';
import type { View } from '../core/canvas';
import type { SaveData } from '../core/save';
import {
  ALLIES,
  HEROES,
  MAX_COMPANION_LEVEL,
  PETS,
  RARITY_LABEL,
  petText,
  type CompanionDef,
  type HeroDef,
} from '../data/companions';
import { dupesToReach } from '../systems/gacha';
import { SHARDS_PER_RANK, abilityRank, maxAllySlots, MAX_ABILITY_RANK } from '../systems/meta';
import {
  collectionLayout,
  collectionStep,
  formatMult,
  heroStats,
  keyToNav,
  pageCount,
  pageOf,
  wrapIndex,
  type CollectionZone,
  type NavEvent,
} from './hubModel';
import { drawIcon, type IconName } from './icons';
import {
  clipText,
  drawBar,
  drawDivider,
  drawFocusRing,
  drawPanel,
  drawSlot,
  drawText,
  drawTooltip,
  fitText,
  inRect,
  textWidth,
  UI,
  type Rect,
} from './panel';
import type { Screen } from './router';
import { spawnerScreen } from './spawnerScreen';
import { pushToast } from './toast';
import { Buttons, PadNav, drawPortrait, drawTitle, rarityColor } from './widgets';

export { drawPortrait };

/** Word-wrap `s` into at most maxLines lines; the last visible line ends in '..' when text is cut. */
export function clipLines(
  _ctx: CanvasRenderingContext2D | null,
  s: string,
  maxW: number,
  maxLines: number,
): string[] {
  return clipText(s, maxW, maxLines);
}

/** Display name for tight spaces (villager professions drop the shared prefix). */
export function shortName(def: CompanionDef): string {
  return def.name.replace(/^(Villager|Village|Wandering) /, '');
}

/** The one-line buff description at a given level. */
export function buffLine(def: CompanionDef, level: number): string {
  if (def.kind === 'hero') return `${def.passiveName}: ${def.passive}`;
  return def.kind === 'pet' ? petText(def, level) : def.text;
}

interface Tab {
  label: string;
  icon: IconName;
  list: CompanionDef[];
}

const TABS: Tab[] = [
  { label: 'Heroes', icon: 'helmet', list: HEROES },
  { label: 'Pets', icon: 'foot', list: PETS },
  { label: 'Allies', icon: 'shield', list: ALLIES },
];

export function isEquipped(data: SaveData, def: CompanionDef): boolean {
  if (def.kind === 'hero') return data.loadout.hero === def.id;
  if (def.kind === 'pet') return data.loadout.pet === def.id;
  return data.loadout.allies.includes(def.id);
}

interface Section {
  title: string;
  color: string;
  icon?: IconName;
  /** Right-aligned note on the heading line (cooldown). */
  note?: string;
  text: string;
  /** Progress line under the text (hero ability rank). */
  bar?: { frac: number; label: string };
  /** Short form of the progress line for the one-at-a-time view (no room for the bar). */
  brief?: string;
}

/** The text blocks of the detail panel for a companion (what the player can read about it). */
export function detailSections(def: CompanionDef, data: SaveData): Section[] {
  const o = data.owned[def.id];
  if (!o) {
    return [
      {
        title: 'LOCKED',
        color: UI.dim,
        text: 'Not found yet. Find it in the Spawner with Spawn Eggs.',
      },
    ];
  }
  const out: Section[] = [];
  if (def.kind === 'hero') {
    const ab = abilityById(def.ability);
    const rank = abilityRank(o.shards);
    const txt = abilityText(def.id, rank);
    const next = rank >= MAX_ABILITY_RANK ? 1 : (o.shards % SHARDS_PER_RANK) / SHARDS_PER_RANK;
    out.push({
      title: txt.name || 'Ability',
      color: UI.gold,
      icon: ab?.icon,
      note: `CD ${txt.cooldown}s`,
      text: txt.blurb,
      brief: `R${rank}`,
      bar: {
        frac: next,
        label:
          rank >= MAX_ABILITY_RANK
            ? `Rank ${rank}/${MAX_ABILITY_RANK} (max)`
            : `Rank ${rank}/${MAX_ABILITY_RANK}  ${o.shards % SHARDS_PER_RANK}/${SHARDS_PER_RANK}`,
      },
    });
    out.push({ title: def.passiveName, color: UI.green, text: def.passive });
  } else {
    out.push({ title: 'BUFF', color: UI.green, text: buffLine(def, o.level) });
  }
  out.push({ title: 'LORE', color: UI.dim, text: `"${def.quip}"` });
  return out;
}

const LINE = 9;

function sectionLines(sec: Section, w: number, max = 99): string[] {
  return clipText(sec.text, w, max);
}

function sectionHeight(sec: Section, w: number): number {
  return 10 + sectionLines(sec, w).length * LINE + (sec.bar ? 10 : 0) + 3;
}

/** Draw a section at (x, y); returns its height. `maxLines` clips the text when room is short. */
function drawSection(
  ctx: CanvasRenderingContext2D,
  sec: Section,
  x: number,
  y: number,
  w: number,
  maxLines = 99,
  compact = false,
): number {
  let cx = x;
  if (sec.icon && !compact) {
    drawIcon(ctx, sec.icon, x, y - 2);
    cx += 14;
  }
  const note = compact && sec.brief ? `${sec.brief}  ${sec.note ?? ''}` : (sec.note ?? '');
  const noteW = note ? textWidth(note) + 4 : 0;
  // The one-at-a-time view already names BUFF and LORE on its chips: no repeated heading.
  const bare = compact && (sec.title === 'BUFF' || sec.title === 'LORE');
  if (!bare) {
    drawText(ctx, fitText(sec.title, w - (cx - x) - noteW), cx, y + 7, sec.color);
    if (note) drawText(ctx, note, x + w, y + 7, UI.dim, 'right');
  }
  let ty = y + (bare ? 0 : compact ? 9 : 10 + (sec.icon ? 3 : 0));
  const lines = sectionLines(sec, w, maxLines);
  const dim = sec.title === 'LORE';
  for (const l of lines) {
    drawText(ctx, l, x, ty + 6, dim ? UI.dim : UI.soft);
    ty += LINE;
  }
  if (sec.bar && !compact) {
    drawBar(ctx, { x, y: ty + 2, w: Math.min(w, 70), h: 5 }, sec.bar.frac, UI.gold);
    drawText(ctx, sec.bar.label, x + Math.min(w, 70) + 4, ty + 7, UI.dim);
    ty += 10;
  }
  return ty - y + 3;
}

function stat(
  ctx: CanvasRenderingContext2D,
  icon: IconName,
  text: string,
  x: number,
  y: number,
  color: string = UI.soft,
): void {
  drawIcon(ctx, icon, x, y);
  drawText(ctx, text, x + 14, y + 9, color);
}

export function collectionScreen(app: App, onBack: () => void): Screen {
  const { atlas } = app;
  const buttons = new Buttons();
  const pad = new PadNav();
  let t = 0;
  let tabIdx = 0;
  /** Selected index per tab (into the full list). */
  const sel = TABS.map(() => 0);
  let section = 0;
  /** Where the keyboard / pad cursor is: the card grid, the detail chips or the footer buttons. */
  let zone: CollectionZone = 'grid';
  let statsRect: Rect | null = null;
  let mx = -1;
  let my = -1;
  let tabRects: Rect[] = [];
  let cardHits: { r: Rect; i: number }[] = [];
  let chipRects: Rect[] = [];
  let perPage = 15;

  const tab = (): Tab => TABS[tabIdx] as Tab;
  const current = (): CompanionDef => tab().list[sel[tabIdx] ?? 0] ?? (HEROES[0] as HeroDef);

  const setTab = (i: number): void => {
    const n = wrapIndex(i, 0, TABS.length);
    if (n !== tabIdx) app.audio.play('click');
    tabIdx = n;
    section = 0;
  };
  const select = (i: number): void => {
    const n = tab().list.length;
    const next = Math.max(0, Math.min(n - 1, i));
    if (next !== sel[tabIdx]) {
      sel[tabIdx] = next;
      section = 0;
      app.audio.play('click');
    }
  };

  const toggleEquip = (def: CompanionDef): void => {
    const data = app.data();
    if (!data.owned[def.id]) return;
    const lo = data.loadout;
    if (def.kind === 'hero') {
      if (lo.hero === def.id) return;
      lo.hero = def.id;
      pushToast({ text: `${def.name} equipped`, color: rarityColor(def.rarity) });
    } else if (def.kind === 'pet') {
      lo.pet = lo.pet === def.id ? null : def.id;
      pushToast({
        text: lo.pet ? `${def.name} equipped` : `${def.name} unequipped`,
        color: rarityColor(def.rarity),
      });
    } else if (lo.allies.includes(def.id)) {
      lo.allies = lo.allies.filter((id) => id !== def.id);
      pushToast({ text: `${def.name} unequipped`, color: rarityColor(def.rarity) });
    } else if (lo.allies.length >= maxAllySlots(data)) {
      pushToast({ text: 'Ally slots full. Unequip an ally first.', color: UI.red });
      return;
    } else {
      lo.allies = [...lo.allies, def.id];
      pushToast({ text: `${def.name} equipped`, color: rarityColor(def.rarity) });
    }
    app.audio.play('click');
    app.store.save(data);
  };

  const toSpawner = (): void => {
    app.router.push(spawnerScreen(app, () => app.router.pop()));
  };

  /** Put the ring on a footer button: Equip when it can be pressed, else Back. */
  const focusFooter = (): void => buttons.focusOn(buttons.isEnabled('equip') ? 'equip' : 'back');

  const nav = (ev: NavEvent, cols: number): void => {
    switch (ev) {
      case 'left':
      case 'right':
      case 'up':
      case 'down': {
        // The first key after the mouse switches to keyboard mode; no button is focused until the cursor
        // reaches the footer.
        if (!buttons.keyboardActive) buttons.hideFocus();
        const list = tab().list;
        const r = collectionStep(
          { zone, index: Math.min(sel[tabIdx] ?? 0, list.length - 1), chip: section },
          ev,
          { cols, count: list.length, chips: chipRects.length },
        );
        if (r.footer) {
          if (buttons.nav(r.footer)) app.audio.play('click');
          break;
        }
        if (r.index !== (sel[tabIdx] ?? 0)) select(r.index);
        if (r.chip !== section) {
          section = r.chip;
          app.audio.play('click');
        }
        if (r.zone !== zone) {
          zone = r.zone;
          if (zone === 'footer') focusFooter();
          else buttons.hideFocus();
        }
        break;
      }
      case 'ok': {
        if (zone === 'footer' && buttons.keyboardActive) {
          if (buttons.activate()) app.audio.play('click');
          break;
        }
        if (zone === 'chips') break;
        const def = current();
        if (app.data().owned[def.id]) toggleEquip(def);
        else toSpawner();
        break;
      }
      case 'back':
        onBack();
        break;
      case 'prev':
        setTab(tabIdx - 1);
        break;
      case 'next':
        setTab(tabIdx + 1);
        break;
    }
  };
  let lastCols = 5;

  const drawCard = (
    ctx: CanvasRenderingContext2D,
    data: SaveData,
    def: CompanionDef,
    r: Rect,
    selected: boolean,
    hover: boolean,
    named: boolean,
  ): void => {
    const o = data.owned[def.id];
    const color = rarityColor(def.rarity);
    drawSlot(ctx, r, { color, selected, hover, locked: !o });
    const nameH = named ? 10 : 0;
    const boxH = r.h - 6 - nameH - (o && def.kind !== 'hero' ? 4 : 0);
    const feet = r.y + 3 + boxH + 1;
    drawPortrait(ctx, atlas, def, r.x + r.w / 2, feet, t, r.w - 6, boxH, 2, 1, !o);
    if (!o) {
      drawText(
        ctx,
        '?',
        r.x + r.w / 2,
        r.y + Math.floor(boxH / 2) + 6,
        'rgba(255,255,255,0.55)',
        'center',
      );
    }
    if (named) {
      drawText(
        ctx,
        fitText(o ? shortName(def) : '???', r.w - 4),
        r.x + r.w / 2,
        r.y + r.h - (def.kind !== 'hero' && o ? 8 : 4),
        o ? '#fff' : UI.faint,
        'center',
      );
    }
    if (o && def.kind !== 'hero') {
      // Level pips (1-5), centred along the bottom edge.
      const pw = MAX_COMPANION_LEVEL * 5 - 1;
      const px = Math.round(r.x + (r.w - pw) / 2);
      for (let i = 0; i < MAX_COMPANION_LEVEL; i++) {
        ctx.fillStyle = i < o.level ? color : '#06060a';
        ctx.fillRect(px + i * 5, r.y + r.h - 5, 4, 2);
      }
    }
    if (o && isEquipped(data, def)) drawIcon(ctx, 'star', r.x + r.w - 12, r.y + 1);
  };

  const drawDetail = (
    ctx: CanvasRenderingContext2D,
    data: SaveData,
    def: CompanionDef,
    r: Rect,
    tier: string,
  ): void => {
    const o = data.owned[def.id];
    const rc = rarityColor(def.rarity);
    drawPanel(ctx, r, false, o ? rc : null);
    const pad4 = 5;
    const innerW = r.w - pad4 * 2;
    // Header: name left, rarity right.
    const rarity = RARITY_LABEL[def.rarity];
    drawText(ctx, rarity, r.x + r.w - pad4, r.y + 11, rc, 'right');
    drawText(
      ctx,
      fitText(o ? def.name : '???', innerW - textWidth(rarity) - 6),
      r.x + pad4,
      r.y + 11,
      '#fff',
    );
    drawDivider(ctx, r.x + pad4, r.y + 14, innerW);
    // Portrait slot and stats.
    const ps = tier === 'compact' ? 36 : tier === 'normal' ? 50 : 72;
    const slot = { x: r.x + pad4, y: r.y + 19, w: ps, h: ps };
    drawSlot(ctx, slot, { color: rc, locked: !o });
    drawPortrait(ctx, atlas, def, slot.x + ps / 2, slot.y + ps - 3, t, ps - 6, ps - 6, 3, 1, !o);
    if (!o)
      drawText(ctx, '?', slot.x + ps / 2, slot.y + ps / 2 + 4, 'rgba(255,255,255,0.6)', 'center');
    if (o && isEquipped(data, def)) drawIcon(ctx, 'star', slot.x + ps - 12, slot.y + 1);
    const sx = slot.x + ps + 6;
    let sy = slot.y + 1;
    statsRect = null;
    if (def.kind === 'hero') {
      // Effective figures: the hero's kit with the permanent upgrades bought for it (the same maths as a run).
      const hs = o ? heroStats(def.id, data.upgrades[def.id] ?? {}, o.shards) : null;
      const base = o ? heroStats(def.id, {}, o.shards) : null;
      const col = (now: number | undefined, was: number | undefined, plain: string): string =>
        now !== undefined && was !== undefined && now > was + 1e-9 ? UI.green : plain;
      stat(
        ctx,
        'heart',
        hs ? String(hs.hp) : '?',
        sx,
        sy,
        o ? col(hs?.hp, base?.hp, '#ff9a9a') : UI.faint,
      );
      stat(
        ctx,
        'sword',
        hs ? formatMult(hs.dmg) : '?',
        sx,
        sy + 12,
        o ? col(hs?.dmg, base?.dmg, '#ffd0a0') : UI.faint,
      );
      stat(
        ctx,
        'boots',
        hs ? formatMult(hs.speed) : '?',
        sx,
        sy + 24,
        o ? col(hs?.speed, base?.speed, '#a0e0ff') : UI.faint,
      );
      if (o && ps >= 50) {
        const rank = abilityRank(data.owned[def.id]?.shards ?? 0);
        stat(ctx, 'star', `Ability rank ${rank}`, sx, sy + 38, UI.gold);
      }
      if (hs && base && ps >= 72) {
        stat(
          ctx,
          'helmet',
          `Armor ${hs.armor}  Regen ${Number(hs.regen.toFixed(1))}/s`,
          sx,
          sy + 50,
          col(hs.armor + hs.regen, base.armor + base.regen, UI.soft),
        );
        stat(
          ctx,
          'clock',
          `Cooldowns ${formatMult(hs.cd)}`,
          sx,
          sy + 62,
          col(base.cd, hs.cd, UI.soft),
        );
      }
      if (hs) statsRect = { x: sx, y: slot.y, w: r.x + r.w - pad4 - sx, h: ps };
    } else if (o) {
      stat(ctx, 'star', `Level ${o.level}/${MAX_COMPANION_LEVEL}`, sx, sy, UI.gold);
      const max = o.level >= MAX_COMPANION_LEVEL;
      const need = dupesToReach(o.level + 1);
      sy += 12;
      drawText(ctx, max ? 'Max level' : `Shards ${o.shards}/${need}`, sx, sy + 9, UI.soft);
      if (!max) {
        drawBar(
          ctx,
          { x: sx, y: sy + 12, w: Math.min(r.x + r.w - pad4 - sx, 60), h: 5 },
          o.shards / need,
          rc,
        );
      }
      if (def.kind === 'ally') stat(ctx, 'heart', `HP ${def.hp}`, sx, sy + 20, '#ff9a9a');
    } else {
      drawText(ctx, 'Not found yet', sx, sy + 9, UI.dim);
      drawText(ctx, 'Pull it at the', sx, sy + 21, UI.faint);
      drawText(ctx, 'Spawner.', sx, sy + 30, UI.faint);
    }

    // Body: stacked sections when they fit, otherwise one at a time under chips.
    const bodyTop = slot.y + ps + 5;
    const room = r.y + r.h - 4 - bodyTop;
    const secs = detailSections(def, data);
    const total = secs.reduce((n, s) => n + sectionHeight(s, innerW), 0);
    chipRects = [];
    if (total <= room) {
      let y = bodyTop;
      for (const s of secs) y += drawSection(ctx, s, r.x + pad4, y, innerW);
      return;
    }
    const idx = Math.min(section, secs.length - 1);
    let cx = r.x + pad4;
    secs.forEach((s, i) => {
      const label =
        i === 0 && def.kind === 'hero'
          ? 'Ability'
          : i === 1 && def.kind === 'hero'
            ? 'Passive'
            : s.title === 'LORE'
              ? 'Lore'
              : 'Buff';
      const cw = textWidth(label) + 8;
      const chip = { x: cx, y: bodyTop - 1, w: cw, h: 10 };
      chipRects.push(chip);
      drawSlot(ctx, chip, { selected: i === idx, hover: inRect(chip, mx, my) });
      drawText(ctx, label, chip.x + cw / 2, chip.y + 8, i === idx ? UI.gold : UI.soft, 'center');
      cx += cw + 3;
    });
    const focusedChip = chipRects[idx];
    if (zone === 'chips' && buttons.keyboardActive && focusedChip)
      drawFocusRing(ctx, focusedChip, t);
    const s = secs[idx];
    if (s) {
      const top = bodyTop + 13;
      const maxLines = Math.max(1, Math.floor((r.y + r.h - 4 - top - 9) / LINE));
      drawSection(ctx, s, r.x + pad4, top, innerW, maxLines, true);
    }
  };

  return {
    update(dt) {
      t += dt;
      for (const ev of pad.poll(dt)) nav(ev, lastCols);
    },
    render(view: View) {
      const { ctx, width, height } = view;
      const data = app.data();
      const L = collectionLayout(width, height);
      drawTitle(view, 'COLLECTION');
      const cur = tab();
      const list = cur.list;

      // Tabs with owned counts.
      const labels = TABS.map((tb) => {
        const have = tb.list.filter((d) => data.owned[d.id]).length;
        return `${tb.label} ${have}/${tb.list.length}`;
      });
      const tw = Math.min(
        Math.floor((width - 12 - 8) / 3),
        Math.max(...labels.map((l) => textWidth(l))) + 26,
      );
      const tx0 = Math.floor((width - (TABS.length * tw + (TABS.length - 1) * 4)) / 2);
      tabRects = TABS.map((_, i) => ({ x: tx0 + i * (tw + 4), y: L.tabsY, w: tw, h: 14 }));
      TABS.forEach((tb, i) => {
        const r = tabRects[i] as Rect;
        const on = i === tabIdx;
        drawPanel(ctx, r, on || inRect(r, mx, my), on ? UI.gold : null, 'stone');
        const label = fitText(labels[i] ?? '', r.w - 18);
        const lw = textWidth(label) + 14;
        const lx = r.x + Math.floor((r.w - lw) / 2);
        drawIcon(ctx, tb.icon, lx, r.y + 1);
        drawText(ctx, label, lx + 14, r.y + 10, on ? UI.gold : UI.soft);
      });

      // Card grid, paged.
      const g = L.grid;
      lastCols = g.cols;
      perPage = g.cols * g.rows;
      const pages = pageCount(list.length, perPage);
      const index = Math.min(sel[tabIdx] ?? 0, list.length - 1);
      const page = Math.min(pageOf(index, perPage), pages - 1);
      const first = page * perPage;
      cardHits = [];
      let hoverDef: CompanionDef | null = null;
      list.slice(first, first + perPage).forEach((def, k) => {
        const r: Rect = {
          x: g.x + (k % g.cols) * (g.cw + g.gap),
          y: g.y + Math.floor(k / g.cols) * (g.ch + g.gap),
          w: g.cw,
          h: g.ch,
        };
        const i = first + k;
        cardHits.push({ r, i });
        const hov = inRect(r, mx, my);
        if (hov) hoverDef = def;
        drawCard(ctx, data, def, r, i === index, hov, L.named);
        if (i === index && zone === 'grid' && buttons.keyboardActive) drawFocusRing(ctx, r, t);
      });

      const sel0 = list[index] ?? (list[0] as CompanionDef);
      drawDetail(ctx, data, sel0, L.detail, L.tier);

      // Buttons: paging on the left, Equip and Back on the right.
      buttons.begin();
      const by = L.buttonsY;
      const left = g.x;
      if (pages > 1) {
        const mid = Math.floor((left + (L.detail.x - 8)) / 2);
        buttons.add(
          { x: left, y: by, w: 40, h: 16 },
          'Prev',
          () => select((page - 1) * perPage),
          page <= 0,
          { key: 'prev' },
        );
        buttons.add(
          { x: L.detail.x - 8 - 40, y: by, w: 40, h: 16 },
          'Next',
          () => select((page + 1) * perPage),
          page >= pages - 1,
          { key: 'next' },
        );
        drawText(ctx, `${page + 1}/${pages}`, mid, by + 11, UI.soft, 'center');
      }
      const owned = !!data.owned[sel0.id];
      const equipped = isEquipped(data, sel0);
      const eqLabel = !owned
        ? 'Spawner'
        : sel0.kind === 'hero' && equipped
          ? 'Equipped'
          : equipped
            ? 'Unequip'
            : 'Equip';
      const bw = Math.min(78, Math.floor((L.detail.w - 4) / 2));
      buttons.add(
        { x: width - 6 - bw * 2 - 4, y: by, w: bw, h: 16 },
        eqLabel,
        () => (owned ? toggleEquip(sel0) : toSpawner()),
        owned && sel0.kind === 'hero' && equipped,
        {
          key: 'equip',
          variant: !owned ? 'gold' : equipped && sel0.kind !== 'hero' ? 'normal' : 'primary',
          icon: !owned ? 'egg' : undefined,
        },
      );
      buttons.add({ x: width - 6 - bw, y: by, w: bw, h: 16 }, 'Back', onBack, false, {
        key: 'back',
      });
      // The button under the ring can switch off (Equip on the equipped hero): keep the ring on the footer.
      if (zone === 'footer' && buttons.keyboardActive && !buttons.hasFocus) focusFooter();
      buttons.draw(view);

      // Hovering the hero figures lists all of them (armor, regeneration and cooldowns do not fit inline).
      if (statsRect && sel0.kind === 'hero' && inRect(statsRect, mx, my) && !buttons.over(mx, my)) {
        const hs = heroStats(
          sel0.id,
          data.upgrades[sel0.id] ?? {},
          data.owned[sel0.id]?.shards ?? 0,
        );
        drawTooltip(
          ctx,
          [
            `Max HP ${hs.hp}`,
            `Damage ${formatMult(hs.dmg)}`,
            `Speed ${formatMult(hs.speed)}`,
            `Armor ${hs.armor}`,
            `Regen ${Number(hs.regen.toFixed(1))} HP/s`,
            `Cooldowns ${formatMult(hs.cd)}`,
            hs.upgraded ? 'Upgrades applied' : 'No upgrades yet',
          ],
          mx,
          my,
          width,
          height,
          null,
          'Hero stats',
        );
      }

      // Tooltip for the card under the pointer.
      const hd = hoverDef as CompanionDef | null;
      if (hd && !buttons.over(mx, my)) {
        const have = data.owned[hd.id];
        const lines = have
          ? [
              RARITY_LABEL[hd.rarity],
              hd.kind === 'hero'
                ? `${hd.passiveName}`
                : `Level ${have.level}/${MAX_COMPANION_LEVEL}`,
            ]
          : [RARITY_LABEL[hd.rarity], 'Found in the Spawner'];
        drawTooltip(
          ctx,
          lines,
          mx,
          my,
          width,
          height,
          rarityColor(hd.rarity),
          have ? hd.name : '???',
        );
      }
    },
    onMove(x, y) {
      if (x !== mx || y !== my) zone = 'grid';
      mx = x;
      my = y;
      buttons.move(x, y);
    },
    onClick(x, y) {
      mx = x;
      my = y;
      zone = 'grid';
      if (buttons.click(x, y)) return;
      const tabHit = tabRects.findIndex((r) => inRect(r, x, y));
      if (tabHit >= 0) {
        setTab(tabHit);
        return;
      }
      const chip = chipRects.findIndex((r) => inRect(r, x, y));
      if (chip >= 0) {
        section = chip;
        app.audio.play('click');
        return;
      }
      const hit = cardHits.find((c) => inRect(c.r, x, y));
      if (hit) select(hit.i);
    },
    onKey(code) {
      if (code === 'PageUp') select((pageOf(sel[tabIdx] ?? 0, perPage) - 1) * perPage);
      else if (code === 'PageDown') select((pageOf(sel[tabIdx] ?? 0, perPage) + 1) * perPage);
      else if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3') {
        section = Math.min(Number(code.slice(5)) - 1, Math.max(0, chipRects.length - 1));
      } else {
        const ev = keyToNav(code);
        if (ev) nav(ev, lastCols);
      }
    },
  };
}
