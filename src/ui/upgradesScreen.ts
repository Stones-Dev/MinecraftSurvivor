/** Permanent upgrades (BRIEF 12.1): spend Emeralds on per-hero ranks plus the two account-wide upgrades. */
import type { App } from '../app';
import type { View } from '../core/canvas';
import type { SaveData } from '../core/save';
import { HEROES, heroById } from '../data/companions';
import { ACCOUNT_KEY, META_UPGRADES, upgradeCost, type MetaUpgrade } from '../data/metaUpgrades';
import { gridMove, keyToNav, layoutTier, pageCount, wrapIndex, type NavEvent } from './hubModel';
import { drawIcon } from './icons';
import {
  UI,
  drawPanel,
  drawSlot,
  drawText,
  drawTooltip,
  fitText,
  inRect,
  textWidth,
  tooltipLines,
  type Rect,
} from './panel';
import type { Screen } from './router';
import {
  Buttons,
  PadNav,
  drawPillRight,
  drawPortrait,
  drawSilhouette,
  drawTitle,
  rarityColor,
} from './widgets';

const PIP = 5;

/** Why an upgrade cannot be bought right now (null when it can). */
export function buyBlocker(data: SaveData, key: string, id: string): string | null {
  const u = META_UPGRADES.find((m) => m.id === id);
  if (!u) return 'Unknown upgrade';
  const rank = data.upgrades[key]?.[id] ?? 0;
  if (rank >= u.max) return 'Already at the maximum rank';
  if (data.currencies.emeralds < upgradeCost(u, rank)) return 'Not enough Emeralds';
  return null;
}

/** Buy the next rank of `id` for `key` (a hero id or the account key); returns false when it cannot be bought. */
export function buyUpgrade(data: SaveData, key: string, id: string): boolean {
  if (buyBlocker(data, key, id)) return false;
  const u = META_UPGRADES.find((m) => m.id === id) as MetaUpgrade;
  const ranks = (data.upgrades[key] ??= {});
  const rank = ranks[id] ?? 0;
  data.currencies.emeralds -= upgradeCost(u, rank);
  ranks[id] = rank + 1;
  return true;
}

interface RowHit {
  r: Rect;
  u: MetaUpgrade;
  index: number;
}

export function upgradesScreen(app: App, onBack: () => void): Screen {
  const buttons = new Buttons();
  const pad = new PadNav();
  let sel = app.data().loadout.hero;
  let page = 0;
  let cursor = 0;
  let flash: { id: string; t: number } | null = null;
  let t = 0;
  let mx = -1;
  let my = -1;
  let rowHits: RowHit[] = [];
  let stripHits: { r: Rect; key: string; owned: boolean; name: string }[] = [];
  let perPage = 4;
  let cols = 1;
  /** Last input was the keyboard or a pad: the row cursor shows instead of the hover. */
  let kbd = false;

  /** Owned heroes in roster order, then the account-wide section. */
  const tabs = (): string[] => [
    ...HEROES.filter((h) => app.data().owned[h.id]).map((h) => h.id),
    ACCOUNT_KEY,
  ];
  const current = (): string => {
    const list = tabs();
    return list.includes(sel) ? sel : (list[0] ?? ACCOUNT_KEY);
  };
  const choose = (key: string): void => {
    if (key === sel) return;
    sel = key;
    page = 0;
    cursor = 0;
    app.audio.play('click');
  };
  const step = (d: number): void => {
    const list = tabs();
    choose(list[wrapIndex(list.indexOf(current()), d, list.length)] ?? ACCOUNT_KEY);
  };
  const listFor = (key: string): MetaUpgrade[] =>
    META_UPGRADES.filter((u) => Boolean(u.account) === (key === ACCOUNT_KEY));

  const buy = (key: string, id: string): void => {
    const data = app.data();
    if (!buyUpgrade(data, key, id)) {
      app.audio.play('click');
      return;
    }
    app.store.save(data);
    app.audio.play('emerald');
    flash = { id, t: 0.5 };
  };

  const nav = (ev: NavEvent): void => {
    const key = current();
    const list = listFor(key);
    const idx = page * perPage + cursor;
    switch (ev) {
      case 'up':
      case 'down':
      case 'left':
      case 'right': {
        if (cols === 1 && (ev === 'left' || ev === 'right')) {
          step(ev === 'left' ? -1 : 1);
          return;
        }
        const next = gridMove(idx, ev, cols, list.length);
        page = Math.floor(next / perPage);
        cursor = next - page * perPage;
        break;
      }
      case 'ok': {
        const u = list[idx];
        if (u) buy(key, u.id);
        break;
      }
      case 'back':
        onBack();
        break;
      case 'prev':
        step(-1);
        break;
      case 'next':
        step(1);
        break;
    }
  };

  return {
    update(dt) {
      t += dt;
      if (flash) {
        flash.t -= dt;
        if (flash.t <= 0) flash = null;
      }
      for (const ev of pad.poll(dt)) {
        kbd = true;
        nav(ev);
      }
    },
    render(view: View) {
      const { ctx, width, height } = view;
      const data = app.data();
      const key = current();
      const isAccount = key === ACCOUNT_KEY;
      const tier = layoutTier(width, height);
      drawTitle(view, 'UPGRADES');
      drawPillRight(ctx, width - 6, 3, 'emerald', String(data.currencies.emeralds), UI.green);

      // Hero strip: every hero in roster order (locked ones are dark), then the account chest.
      const n = HEROES.length + 1;
      const sw = Math.max(16, Math.min(30, Math.floor((width - 12 + 2) / n) - 2));
      const sh = Math.min(sw + 2, tier === 'compact' ? 22 : 30);
      const x0 = Math.floor((width - (n * (sw + 2) - 2)) / 2);
      stripHits = [];
      const stripY = 24;
      HEROES.forEach((h, i) => {
        const r = { x: x0 + i * (sw + 2), y: stripY, w: sw, h: sh };
        const owned = !!data.owned[h.id];
        stripHits.push({ r, key: h.id, owned, name: owned ? h.name : '???' });
        drawSlot(ctx, r, {
          color: owned ? rarityColor(h.rarity) : null,
          selected: h.id === key,
          hover: owned && inRect(r, mx, my),
          locked: !owned,
        });
        if (owned)
          drawPortrait(ctx, app.atlas, h, r.x + sw / 2, r.y + sh - 2, t, sw - 4, sh - 4, 2);
        else drawSilhouette(ctx, app.atlas, h, r.x + sw / 2, r.y + sh - 2, 0.4);
      });
      {
        const r = { x: x0 + HEROES.length * (sw + 2), y: stripY, w: sw, h: sh };
        stripHits.push({ r, key: ACCOUNT_KEY, owned: true, name: 'Account' });
        drawSlot(ctx, r, { color: '#c8a23a', selected: isAccount, hover: inRect(r, mx, my) });
        drawIcon(ctx, 'chest', r.x + Math.floor((sw - 12) / 2), r.y + Math.floor((sh - 12) / 2));
      }

      // Heading line: who the upgrades belong to.
      const headY = stripY + sh + 4;
      const title = isAccount
        ? 'Account (all heroes)'
        : `${heroById(key).name}  Lv ${data.owned[key]?.level ?? 1}`;
      drawText(ctx, title, 8, headY + 8, isAccount ? UI.gold : '#fff');

      // Rows (one or two columns), paged to the available height.
      const list = listFor(key);
      const rowH = tier === 'compact' ? 22 : tier === 'normal' ? 24 : 28;
      const gap = 2;
      cols = width >= 520 ? 2 : 1;
      const top = headY + 13;
      const barY = height - 22;
      const rowsFit = Math.max(1, Math.floor((barY - 4 - top + gap) / (rowH + gap)));
      perPage = rowsFit * cols;
      const pages = pageCount(list.length, perPage);
      page = Math.min(page, pages - 1);
      cursor = Math.min(cursor, Math.max(0, Math.min(perPage, list.length - page * perPage) - 1));
      const colW = Math.floor((width - 12 - (cols - 1) * 4) / cols);
      const ranks = data.upgrades[key];
      rowHits = [];
      buttons.begin();
      list.slice(page * perPage, (page + 1) * perPage).forEach((u, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const r: Rect = { x: 6 + col * (colW + 4), y: top + row * (rowH + gap), w: colW, h: rowH };
        rowHits.push({ r, u, index: i });
        const rank = ranks?.[u.id] ?? 0;
        const maxed = rank >= u.max;
        const cost = upgradeCost(u, rank);
        const afford = data.currencies.emeralds >= cost;
        const hot = inRect(r, mx, my) && !kbd;
        const isCursor = i === cursor && kbd;
        drawPanel(ctx, r, hot || isCursor, maxed ? '#c8a23a' : null);
        if (flash && flash.id === u.id) {
          ctx.globalAlpha = Math.min(1, flash.t * 2) * 0.35;
          ctx.fillStyle = UI.green;
          ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
          ctx.globalAlpha = 1;
        }
        const box = rowH - 6;
        drawSlot(
          ctx,
          { x: r.x + 3, y: r.y + 3, w: box, h: box },
          { color: maxed ? '#c8a23a' : null },
        );
        drawIcon(
          ctx,
          u.icon,
          r.x + 3 + Math.floor((box - 12) / 2),
          r.y + 3 + Math.floor((box - 12) / 2),
        );
        const tx = r.x + box + 8;

        // Buy button (or MAX) and its price.
        const bw = tier === 'compact' ? 34 : 40;
        const btn: Rect = {
          x: r.x + r.w - bw - 3,
          y: r.y + Math.floor((rowH - 14) / 2),
          w: bw,
          h: 14,
        };
        buttons.add(btn, maxed ? 'MAX' : 'Buy', () => buy(key, u.id), maxed || !afford, {
          key: `buy-${u.id}`,
          variant: !maxed && afford ? 'primary' : 'normal',
          color: maxed ? UI.gold : undefined,
        });
        let right = btn.x - 4;
        if (!maxed) {
          const c = String(cost);
          drawText(
            ctx,
            c,
            right,
            r.y + Math.floor(rowH / 2) + 3,
            afford ? UI.green : UI.red,
            'right',
          );
          right -= textWidth(c) + 14;
          drawIcon(ctx, 'emerald', right + 2, r.y + Math.floor((rowH - 12) / 2));
          right -= 4;
        }
        // Name and rank pips on the first line, the effect of the next rank on the second.
        const pipsW = u.max * PIP;
        const pipsX = right - pipsW;
        const line1 = r.y + (rowH >= 24 ? 10 : 9);
        const showPips = pipsX - tx > 52;
        if (showPips) {
          for (let p = 0; p < u.max; p++) {
            ctx.fillStyle = p < rank ? UI.green : '#06060a';
            ctx.fillRect(pipsX + p * PIP, line1 - 5, PIP - 1, 4);
          }
        }
        const nameRoom = (showPips ? pipsX - 4 : right) - tx;
        drawText(ctx, fitText(`${u.name}  ${rank}/${u.max}`, nameRoom), tx, line1, '#fff');
        const effect = maxed ? `MAX  ${u.text(u.max)}` : `Next: ${u.text(rank + 1)}`;
        drawText(ctx, fitText(effect, right - tx), tx, line1 + 9, maxed ? UI.gold : '#9fe39f');
      });

      // Bottom bar: Back, plus page controls when the list does not fit.
      buttons.add({ x: 6, y: barY, w: 56, h: 16 }, 'Back', onBack, false, { key: 'back' });
      if (pages > 1) {
        const cx = Math.floor(width / 2);
        buttons.add(
          { x: cx - 62, y: barY, w: 44, h: 16 },
          'Prev',
          () => (page = Math.max(0, page - 1)),
          page === 0,
          {
            key: 'prev',
          },
        );
        buttons.add(
          { x: cx + 18, y: barY, w: 44, h: 16 },
          'Next',
          () => (page = Math.min(pages - 1, page + 1)),
          page >= pages - 1,
          { key: 'next' },
        );
        drawText(ctx, `${page + 1}/${pages}`, cx, barY + 11, UI.soft, 'center');
      }
      buttons.draw(view);

      // Tooltips: hero strip names and the full text of a hovered row.
      const strip = stripHits.find((s) => inRect(s.r, mx, my));
      if (strip) drawTooltip(ctx, [], mx, my, width, height, null, strip.name);
      else if (!buttons.over(mx, my)) {
        const hit = rowHits.find((h) => inRect(h.r, mx, my));
        if (hit) {
          const rank = ranks?.[hit.u.id] ?? 0;
          const maxed = rank >= hit.u.max;
          const lines = [
            `Rank ${rank}/${hit.u.max}`,
            maxed ? hit.u.text(hit.u.max) : `Next: ${hit.u.text(rank + 1)}`,
            ...(maxed ? [] : [`Cost: ${upgradeCost(hit.u, rank)} Emeralds`]),
          ].flatMap((l) => tooltipLines(l));
          drawTooltip(ctx, lines, mx, my, width, height, null, hit.u.name);
        }
      }
    },
    onMove(x, y) {
      if (x !== mx || y !== my) kbd = false;
      mx = x;
      my = y;
      buttons.move(x, y);
    },
    onClick(x, y) {
      mx = x;
      my = y;
      if (buttons.click(x, y)) return;
      const s = stripHits.find((h) => inRect(h.r, x, y));
      if (s && s.owned) choose(s.key);
    },
    onKey(code) {
      if (code === 'PageUp') page = Math.max(0, page - 1);
      else if (code === 'PageDown') page++;
      else {
        const ev = keyToNav(code);
        if (ev) {
          kbd = true;
          nav(ev);
        }
      }
    },
  };
}
