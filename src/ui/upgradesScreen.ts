/** Permanent upgrades (BRIEF 12.1): spend Emeralds on per-hero ranks plus the two account-wide upgrades. */
import type { App } from '../app';
import type { View } from '../core/canvas';
import { HEROES, heroById } from '../data/companions';
import { ACCOUNT_KEY, META_UPGRADES, upgradeCost } from '../data/metaUpgrades';
import { drawIcon } from './icons';
import { drawPanel, drawText, fitText, textWidth } from './panel';
import type { Screen } from './router';
import { Buttons, drawTitle } from './widgets';

const ROW_H = 22;
const PIP = 5;

export function upgradesScreen(app: App, onBack: () => void): Screen {
  const buttons = new Buttons();
  let sel = app.data().loadout.hero;
  let page = 0;

  /** Owned heroes in roster order, then the account-wide section. */
  const tabs = (): string[] => [
    ...HEROES.filter((h) => app.data().owned[h.id]).map((h) => h.id),
    ACCOUNT_KEY,
  ];
  const current = (): string => {
    const t = tabs();
    return t.includes(sel) ? sel : (t[0] ?? ACCOUNT_KEY);
  };
  const step = (d: number): void => {
    const t = tabs();
    const i = t.indexOf(current());
    sel = t[(i + d + t.length) % t.length] ?? ACCOUNT_KEY;
    page = 0;
  };
  const turn = (d: number): void => {
    page = Math.max(0, page + d);
  };

  const buy = (key: string, id: string): void => {
    const u = META_UPGRADES.find((m) => m.id === id);
    if (!u) return;
    const data = app.data();
    const ranks = (data.upgrades[key] ??= {});
    const rank = ranks[id] ?? 0;
    const cost = upgradeCost(u, rank);
    if (rank >= u.max || data.currencies.emeralds < cost) return;
    data.currencies.emeralds -= cost;
    ranks[id] = rank + 1;
    app.store.save(data);
    app.audio.play('emerald');
  };

  return {
    update() {},
    render(view: View) {
      const { ctx, width, height } = view;
      const data = app.data();
      const key = current();
      const isAccount = key === ACCOUNT_KEY;
      drawTitle(view, 'UPGRADES', 'Permanent boosts, paid in Emeralds');
      const em = String(data.currencies.emeralds);
      drawText(ctx, em, width - 8, 20, '#7dff9a', 'right');
      drawIcon(ctx, 'emerald', width - 8 - textWidth(em) - 14, 11);

      buttons.begin();
      // Hero selector.
      const all = tabs();
      buttons.add({ x: 6, y: 32, w: 24, h: 14 }, '<', () => step(-1));
      buttons.add({ x: width - 30, y: 32, w: 24, h: 14 }, '>', () => step(1));
      const mid = { x: 34, y: 32, w: width - 68, h: 14 };
      drawPanel(ctx, mid);
      const title = isAccount
        ? 'Account  (all heroes)'
        : `${heroById(key).name}  (Lv ${data.owned[key]?.level ?? 1})`;
      drawText(ctx, title, mid.x + mid.w / 2, mid.y + 10, isAccount ? '#ffd84a' : '#fff', 'center');
      drawText(
        ctx,
        `${all.indexOf(key) + 1}/${all.length}`,
        mid.x + mid.w - 4,
        mid.y + 10,
        '#9a9aa8',
        'right',
      );

      // Upgrade rows, paged to the available height.
      const list = META_UPGRADES.filter((u) => Boolean(u.account) === isAccount);
      const top = 51;
      const perPage = Math.max(1, Math.floor((height - 26 - top) / ROW_H));
      const pages = Math.max(1, Math.ceil(list.length / perPage));
      page = Math.min(page, pages - 1);
      const ranks = data.upgrades[key];
      list.slice(page * perPage, (page + 1) * perPage).forEach((u, i) => {
        const r = { x: 6, y: top + i * ROW_H, w: width - 12, h: ROW_H - 2 };
        const rank = ranks?.[u.id] ?? 0;
        const maxed = rank >= u.max;
        const cost = upgradeCost(u, rank);
        const afford = data.currencies.emeralds >= cost;
        drawPanel(ctx, r, false, maxed ? '#c8a23a' : null);
        drawIcon(ctx, u.icon, r.x + 4, r.y + 4);

        const btn = { x: r.x + r.w - 42, y: r.y + 3, w: 38, h: 14 };
        buttons.add(btn, maxed ? 'MAX' : 'Buy', () => buy(key, u.id), maxed || !afford);
        let textMax = btn.x - 4;
        if (!maxed) {
          const c = String(cost);
          drawText(ctx, c, btn.x - 4, r.y + 13, afford ? '#7dff9a' : '#ff8a8a', 'right');
          const iconX = btn.x - 4 - textWidth(c) - 14;
          drawIcon(ctx, 'emerald', iconX, r.y + 4);
          textMax = iconX - 4;
        }

        // Name, rank and pips on the first line, effect text on the second.
        const pipsX = textMax - u.max * PIP;
        for (let p = 0; p < u.max; p++) {
          ctx.fillStyle = p < rank ? '#7dff9a' : '#3b3b46';
          ctx.fillRect(pipsX + p * PIP, r.y + 5, PIP - 1, 4);
        }
        drawText(ctx, `${rank}/${u.max}`, pipsX - 4, r.y + 9, '#9a9aa8', 'right');
        drawText(ctx, fitText(u.name, pipsX - 34 - (r.x + 20)), r.x + 20, r.y + 9, '#fff');
        const effect = maxed ? `MAX  ${u.text(u.max)}` : u.text(rank + 1);
        drawText(
          ctx,
          fitText(effect, textMax - (r.x + 20)),
          r.x + 20,
          r.y + 17,
          maxed ? '#ffd84a' : '#9fe39f',
        );
      });

      // Bottom bar: Back, plus page controls when the list does not fit.
      const by = height - 22;
      buttons.add({ x: 6, y: by, w: 56, h: 16 }, 'Back', onBack);
      if (pages > 1) {
        buttons.add({ x: width - 154, y: by, w: 44, h: 16 }, 'Prev', () => turn(-1), page === 0);
        buttons.add(
          { x: width - 50, y: by, w: 44, h: 16 },
          'Next',
          () => turn(1),
          page >= pages - 1,
        );
        drawText(ctx, `Page ${page + 1}/${pages}`, width - 80, by + 11, '#cfcfd8', 'center');
      }
      buttons.draw(view);
    },
    onMove(x, y) {
      buttons.move(x, y);
    },
    onClick(x, y) {
      if (buttons.click(x, y)) app.audio.play('click');
    },
    onKey(code) {
      if (code === 'Escape') onBack();
      else if (code === 'ArrowLeft') step(-1);
      else if (code === 'ArrowRight') step(1);
    },
  };
}
