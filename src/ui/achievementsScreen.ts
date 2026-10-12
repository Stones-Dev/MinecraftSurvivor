/**
 * Achievements: a tab per category, a medal per achievement (gold when unlocked, iron when locked,
 * "?" while hidden), progress bars and rewards. Keyboard and gamepad: Q / E (LB / RB) change category,
 * arrows / d-pad move the focus ring over the tabs, the rows and Back (rows scroll into view), Enter / A
 * presses it, Esc / B goes back; the wheel scrolls long categories.
 */
import type { App } from '../app';
import { ACHIEVEMENT_CATEGORIES, type AchievementCategory } from '../data/achievements';
import {
  achievementCounts,
  achievementProgress,
  type AchievementProgress,
} from '../systems/achievements';
import { keyToNav, type NavEvent } from './hubModel';
import { drawIcon } from './icons';
import {
  drawCheck,
  drawMedal,
  drawRewardInline,
  drawTabs,
  HitList,
  shortNumber,
} from './metaWidgets';
import { drawBar, drawPanel, drawText, fitText, inRect, textWidth, UI, type Rect } from './panel';
import type { Screen } from './router';
import { Scroller, withClip } from './scroll';
import { drawTitle, PadNav } from './widgets';

const ROW_H = 24;
const ROW_GAP = 2;

const p2 = (n: number): string => String(n).padStart(2, '0');
function dateText(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

export function achievementsScreen(app: App, back: () => void): Screen {
  const hits = new HitList();
  const pad = new PadNav();
  const scroll = new Scroller();
  let tab = 0;
  let sel = 0;
  let mx = -1;
  let my = -1;
  let tabRects: Rect[] = [];
  let track: Rect | null = null;
  let content: Rect = { x: 0, y: 0, w: 0, h: 0 };

  const cat = (): AchievementCategory => ACHIEVEMENT_CATEGORIES[tab]?.id ?? 'combat';
  const setTab = (t: number): void => {
    tab = (t + ACHIEVEMENT_CATEGORIES.length) % ACHIEVEMENT_CATEGORIES.length;
    sel = 0;
    scroll.reset();
  };

  const drawRow = (
    ctx: CanvasRenderingContext2D,
    p: AchievementProgress,
    r: Rect,
    index: number,
  ): void => {
    const { def } = p;
    const hidden = def.hidden && !p.unlocked;
    hits.add(r, '', () => (sel = index), {
      clip: content,
      invisible: true,
      focusable: true,
      key: `row:${def.id}`,
      onFocus: () => {
        sel = index;
        scroll.reveal(index * (ROW_H + ROW_GAP), ROW_H, content.h);
      },
    });
    drawPanel(ctx, r, index === sel, p.unlocked ? '#9a7418' : null);
    drawMedal(
      ctx,
      r.x + 3,
      r.y + 2,
      p.unlocked ? 'unlocked' : hidden ? 'hidden' : 'locked',
      def.icon,
    );
    const rightW = 100;
    const tx = r.x + 27;
    const textMax = r.w - 27 - rightW - 8;
    drawText(
      ctx,
      fitText(hidden ? '???' : def.name, textMax),
      tx,
      r.y + 10,
      p.unlocked ? UI.gold : hidden ? UI.dim : UI.text,
    );
    drawText(
      ctx,
      fitText(hidden ? 'Keep playing to discover this one.' : def.desc, textMax),
      tx,
      r.y + 20,
      p.unlocked ? UI.soft : UI.dim,
    );
    const rx = r.x + r.w - rightW - 4;
    if (p.unlocked) {
      drawCheck(ctx, rx + rightW - 9, r.y + 4, UI.green);
      if (def.reward) drawRewardInline(ctx, def.reward, rx, r.y + 3, true);
      drawText(ctx, dateText(p.at), rx + rightW, r.y + 20, UI.dim, 'right');
    } else {
      if (def.reward && !hidden) drawRewardInline(ctx, def.reward, rx, r.y + 3);
      if (!def.binary) {
        const txt = `${shortNumber(p.cur)}/${shortNumber(def.goal)}`;
        drawText(ctx, txt, rx + rightW, r.y + 20, UI.soft, 'right');
        const bw = rightW - textWidth(txt) - 5;
        if (bw > 12) drawBar(ctx, { x: rx, y: r.y + 15, w: bw, h: 5 }, p.cur / def.goal, '#4aa0ff');
      }
    }
  };

  /** One navigation event from the keyboard or a pad. */
  const navigate = (ev: NavEvent): void => {
    if (ev === 'back') return back();
    if (ev === 'prev' || ev === 'next') {
      setTab(tab + (ev === 'prev' ? -1 : 1));
      app.audio.play('click');
      return;
    }
    hits.handleNav(ev);
  };

  return {
    update(dt) {
      for (const ev of pad.poll(dt)) navigate(ev);
    },
    render(view) {
      const { ctx, width, height } = view;
      const data = app.data();
      drawTitle(view, 'ACHIEVEMENTS');
      const counts = achievementCounts(data);
      drawText(ctx, `${counts.unlocked}/${counts.total}`, width - 8, 13, UI.gold, 'right');
      drawIcon(ctx, 'star', width - 8 - textWidth(`${counts.unlocked}/${counts.total}`) - 14, 4);

      const cw = Math.min(width - 12, 420);
      const x0 = Math.floor((width - cw) / 2);
      tabRects = drawTabs(
        ctx,
        { x: x0, y: 21, w: cw, h: 13 },
        ACHIEVEMENT_CATEGORIES.map((c) => c.label),
        tab,
        tabRects.findIndex((r) => inRect(r, mx, my)),
      );
      content = { x: x0, y: 38, w: cw, h: height - 38 - 24 };
      hits.begin();
      const list = achievementProgress(data, cat());
      scroll.fit(list.length * (ROW_H + ROW_GAP) - ROW_GAP, content.h);
      sel = Math.max(0, Math.min(list.length - 1, sel));
      const rowW = content.w - (scroll.scrollable ? 6 : 0);
      withClip(ctx, content, () => {
        list.forEach((p, i) => {
          const r: Rect = {
            x: content.x,
            y: content.y + i * (ROW_H + ROW_GAP) - scroll.offset,
            w: rowW,
            h: ROW_H,
          };
          // Off-screen rows still register so the focus ring can walk to them.
          drawRow(ctx, p, r, i);
        });
      });
      track = null;
      if (scroll.scrollable) {
        track = { x: content.x + content.w - 4, y: content.y, w: 4, h: content.h };
        scroll.drawBar(ctx, track);
      }
      // Footer: back, and the full text of the selected achievement.
      const fy = height - 20;
      hits.add({ x: x0, y: fy, w: 52, h: 16 }, 'Back', back);
      ACHIEVEMENT_CATEGORIES.forEach((c, i) => {
        const r = tabRects[i];
        if (r)
          hits.add(r, c.label, () => setTab(i), {
            invisible: true,
            focusable: true,
            key: `tab:${i}`,
          });
      });
      const cur = list[sel];
      if (cur) {
        const hidden = cur.def.hidden && !cur.unlocked;
        const line = hidden ? 'Hidden achievement' : cur.def.desc;
        drawText(ctx, fitText(line, cw - 66), x0 + 60, fy + 11, UI.soft);
      }
      hits.draw(ctx);
    },
    onMove(x, y) {
      mx = x;
      my = y;
      hits.move(x, y);
    },
    onClick(x, y) {
      const t = tabRects.findIndex((r) => inRect(r, x, y));
      if (t >= 0) {
        setTab(t);
        app.audio.play('click');
        return;
      }
      if (track && inRect(track, x, y) && scroll.clickTrack(track, y)) return;
      hits.click(x, y);
    },
    onWheel(dy) {
      scroll.by(dy > 0 ? 18 : -18);
    },
    onKey(code) {
      const ev = keyToNav(code);
      if (ev) navigate(ev);
    },
  };
}
