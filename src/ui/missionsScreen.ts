/**
 * Daily / weekly missions and the 7-day login reward. Tabs: Daily, Weekly, Login. Cards show the
 * mission, its reward and a progress bar, with Claim and Reroll buttons. Keyboard: Left/Right (or Q/E)
 * switch tabs, Up/Down select, Enter claims, R rerolls, Esc goes back. The wheel scrolls when the list
 * does not fit (tiny windows).
 */
import type { App } from '../app';
import type { View } from '../core/canvas';
import { DAILY_LOGIN_REWARDS, rewardText, type MissionKind } from '../data/missions';
import {
  claimDailyReward,
  claimMission,
  dailyRewardState,
  DAILY_REROLLS,
  ensureMissions,
  missionViews,
  msUntilReset,
  rerollMission,
  type DailyRewardState,
  type MissionView,
} from '../systems/missions';
import { keyToNav } from './hubModel';
import { drawIcon } from './icons';
import {
  drawCheck,
  drawRewardInline,
  drawTabs,
  formatClock,
  formatCountdown,
  HitList,
  shortNumber,
} from './metaWidgets';
import {
  drawBar,
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
import { Scroller, withClip } from './scroll';
import { pushToast } from './toast';
import { drawTitle } from './widgets';

const TABS = ['Daily', 'Weekly', 'Login'] as const;
const CARD_H = 34;
const CARD_GAP = 3;

/** "45/150", or "1:30/4:00" for time missions. */
function progressText(v: MissionView): string {
  const f = (n: number): string => (v.def.metric === 'timeSec' ? formatClock(n) : shortNumber(n));
  return `${f(v.progress)}/${f(v.def.target)}`;
}

export function missionsScreen(app: App, back: () => void): Screen {
  const hits = new HitList();
  const scroll = new Scroller();
  let tab = 0;
  let sel = 0;
  let note = '';
  let noteColor: string = UI.green;
  let noteT = 0;
  let mx = -1;
  let my = -1;
  let hoverTab = -1;
  let tabRects: Rect[] = [];
  let track: Rect | null = null;
  let content: Rect = { x: 0, y: 0, w: 0, h: 0 };

  const say = (text: string, ok = true): void => {
    note = text;
    noteColor = ok ? UI.green : UI.red;
    noteT = 4;
  };
  const save = (): void => app.store.save(app.data());
  const kind = (): MissionKind => (tab === 1 ? 'weekly' : 'daily');
  const views = (): MissionView[] => (tab === 2 ? [] : missionViews(app.data(), kind()));

  const claim = (v: MissionView): void => {
    const data = app.data();
    const r = claimMission(data, v.def.kind, v.def.id);
    if (!r.ok) return;
    save();
    app.audio.play('emerald');
    say(`Claimed ${rewardText(r.reward)}`);
    pushToast({ text: `Mission reward: ${rewardText(r.reward)}`, icon: 'emerald' });
  };
  const reroll = (v: MissionView): void => {
    const data = app.data();
    if (!rerollMission(data, v.def.kind, v.def.id)) return say('Cannot reroll that mission', false);
    save();
    app.audio.play('click');
    say('Mission rerolled');
  };
  const claimLogin = (): void => {
    const data = app.data();
    const r = claimDailyReward(data, Date.now());
    if (!r.ok) return;
    save();
    app.audio.play('emerald');
    say(`Day ${r.day}: ${rewardText(r.reward)}`);
    pushToast({ text: `Login reward: ${rewardText(r.reward)}`, icon: 'chest' });
  };
  const setTab = (t: number): void => {
    tab = (t + TABS.length) % TABS.length;
    sel = 0;
    scroll.reset();
  };

  const roll = (): void => {
    const r = ensureMissions(app.data(), Date.now());
    if (r.changed) save();
  };
  roll();
  {
    // Open on whatever has something to collect.
    const d = app.data();
    const now = Date.now();
    if (dailyRewardState(d, now).canClaim) tab = 2;
    else if (missionViews(d, 'daily').every((v) => !(v.done && !v.claimed))) {
      if (missionViews(d, 'weekly').some((v) => v.done && !v.claimed)) tab = 1;
    }
  }

  const drawCard = (
    ctx: CanvasRenderingContext2D,
    v: MissionView,
    r: Rect,
    index: number,
    clip: Rect,
    rerolls: number,
  ): void => {
    const selected = index === sel;
    // The whole card is a click target for selection; the buttons added after it sit on top.
    hits.add(r, '', () => (sel = index), { clip, invisible: true });
    const ready = v.done && !v.claimed;
    drawPanel(ctx, r, selected, ready ? UI.gold : v.claimed ? '#3f7a45' : null);
    drawSlot(ctx, { x: r.x + 4, y: r.y + 5, w: 20, h: 20 }, { locked: v.claimed });
    if (v.claimed) ctx.globalAlpha = 0.55;
    drawIcon(ctx, v.def.icon, r.x + 8, r.y + 9);
    ctx.globalAlpha = 1;
    const btnW = 46;
    const textMax = r.w - 30 - btnW - 10;
    drawText(ctx, fitText(v.def.text, textMax), r.x + 30, r.y + 12, v.claimed ? UI.dim : UI.text);
    drawRewardInline(ctx, v.def.reward, r.x + 30, r.y + 14, v.claimed);
    const ptxt = progressText(v);
    const barW = textMax - textWidth(ptxt) - 5;
    drawBar(
      ctx,
      { x: r.x + 30, y: r.y + r.h - 9, w: Math.max(20, barW), h: 5 },
      v.progress / v.def.target,
      v.done ? UI.green : '#4aa0ff',
    );
    drawText(
      ctx,
      ptxt,
      r.x + 30 + Math.max(20, barW) + 5,
      r.y + r.h - 4,
      v.done ? UI.green : UI.soft,
    );
    const bx = r.x + r.w - btnW - 5;
    if (ready) {
      const cr = { x: bx, y: r.y + 5, w: btnW, h: 14 };
      hits.add(cr, 'Claim', () => claim(v), { clip, style: { variant: 'gold' } });
    } else if (v.claimed) {
      drawCheck(ctx, bx + 6, r.y + 8, UI.green);
      drawText(ctx, 'Done', bx + 17, r.y + 15, UI.green);
    }
    if (!v.done && !v.claimed && rerolls > 0) {
      const rr = { x: bx, y: r.y + r.h - 16, w: btnW, h: 12 };
      hits.add(rr, 'Reroll', () => reroll(v), { clip });
    }
  };

  const drawLogin = (ctx: CanvasRenderingContext2D, view: View, st: DailyRewardState): void => {
    const c = content;
    const cellGap = 3;
    const cellW = Math.floor((c.w - cellGap * 6) / 7);
    const cellH = view.height < 200 ? 50 : 62;
    const claimedDays = st.status === 'claimed' ? st.day : st.done;
    for (let i = 1; i <= 7; i++) {
      const r: Rect = { x: c.x + (i - 1) * (cellW + cellGap), y: c.y + 2, w: cellW, h: cellH };
      const reward = DAILY_LOGIN_REWARDS[i - 1] ?? {};
      const claimed = i <= claimedDays;
      const today = st.canClaim && i === st.day;
      drawPanel(ctx, r, today, today ? UI.gold : i === 7 ? '#8a5ad0' : claimed ? '#3f7a45' : null);
      drawText(ctx, `Day ${i}`, r.x + r.w / 2, r.y + 11, today ? UI.gold : UI.soft, 'center');
      const ix = r.x + Math.floor((r.w - 12) / 2);
      if (claimed) ctx.globalAlpha = 0.45;
      drawIcon(ctx, reward.rareSpawnEggs ? 'star' : 'emerald', ix, r.y + 14);
      ctx.globalAlpha = 1;
      drawText(
        ctx,
        `${reward.emeralds ?? 0}`,
        r.x + r.w / 2,
        r.y + 34,
        claimed ? UI.dim : UI.green,
        'center',
      );
      const extra: string[] = [];
      if (reward.spawnEggs) extra.push(`${reward.spawnEggs} egg`);
      if (reward.rareSpawnEggs) extra.push('RARE egg');
      extra.forEach((t, k) =>
        drawText(
          ctx,
          t,
          r.x + r.w / 2,
          r.y + 43 + k * 9,
          reward.rareSpawnEggs && k === extra.length - 1 ? '#c98cff' : UI.gold,
          'center',
        ),
      );
      if (claimed) drawCheck(ctx, r.x + r.w - 10, r.y + 3, UI.green);
    }
    let y = c.y + cellH + 16;
    const streakText = `Streak: ${st.streak} day${st.streak === 1 ? '' : 's'}`;
    drawText(ctx, streakText, c.x + c.w / 2, y, UI.text, 'center');
    y += 11;
    let msg: string;
    let col: string = UI.soft;
    if (st.status === 'ready') {
      msg = st.broken ? 'Streak lost - a new one starts today' : 'Your reward is ready!';
      col = UI.gold;
    } else if (st.status === 'claimed') msg = 'Claimed today. Come back tomorrow!';
    else if (st.status === 'clock-behind') {
      msg = 'Your device clock is behind your last claim';
      col = UI.red;
    } else {
      msg = 'Your device clock looks wrong';
      col = UI.red;
    }
    drawText(ctx, fitText(msg, c.w), c.x + c.w / 2, y, col, 'center');
    y += 7;
    const bw = 110;
    const label = st.canClaim
      ? `Claim day ${st.day}`
      : st.status === 'claimed'
        ? 'Claimed'
        : 'Unavailable';
    const br = { x: c.x + Math.floor((c.w - bw) / 2), y, w: bw, h: 16 };
    if (br.y + br.h <= c.y + c.h) {
      hits.add(br, label, claimLogin, {
        disabled: !st.canClaim,
        style: { variant: st.canClaim ? 'gold' : 'normal' },
      });
    }
    if (c.y + c.h - (br.y + br.h) > 12) {
      drawText(
        ctx,
        'Day 7 always brings a RARE Spawn Egg',
        c.x + c.w / 2,
        br.y + br.h + 11,
        '#c98cff',
        'center',
      );
    }
  };

  return {
    update(dt) {
      noteT = Math.max(0, noteT - dt);
    },
    render(view) {
      const { ctx, width, height } = view;
      const data = app.data();
      const now = Date.now();
      drawTitle(view, 'MISSIONS');
      const em = String(data.currencies.emeralds);
      drawText(ctx, em, width - 8, 13, UI.green, 'right');
      drawIcon(ctx, 'emerald', width - 8 - textWidth(em) - 14, 4);

      const cw = Math.min(width - 12, 400);
      const x0 = Math.floor((width - cw) / 2);
      const claimable = (k: MissionKind): boolean =>
        missionViews(data, k).some((v) => v.done && !v.claimed);
      const st = dailyRewardState(data, now);
      hoverTab = tabRects.findIndex((r) => inRect(r, mx, my));
      tabRects = drawTabs(ctx, { x: x0, y: 21, w: cw, h: 13 }, TABS, tab, hoverTab, [
        claimable('daily'),
        claimable('weekly'),
        st.canClaim,
      ]);
      content = { x: x0, y: 38, w: cw, h: height - 38 - 24 };

      hits.begin();
      track = null;
      if (tab === 2) {
        drawLogin(ctx, view, st);
        hits.draw(ctx);
      } else {
        const list = views();
        const ch = list.length * (CARD_H + CARD_GAP) - CARD_GAP;
        scroll.fit(ch, content.h);
        sel = Math.max(0, Math.min(list.length - 1, sel));
        const cardW = content.w - (scroll.scrollable ? 6 : 0);
        withClip(ctx, content, () => {
          list.forEach((v, i) => {
            const r: Rect = {
              x: content.x,
              y: content.y + i * (CARD_H + CARD_GAP) - scroll.offset,
              w: cardW,
              h: CARD_H,
            };
            if (r.y + r.h < content.y || r.y > content.y + content.h) return;
            drawCard(ctx, v, r, i, content, data.missions.rerollsLeft);
          });
          hits.draw(ctx);
        });
        if (list.length === 0) {
          drawText(ctx, 'No missions yet', width / 2, content.y + 30, UI.dim, 'center');
        }
        if (scroll.scrollable) {
          track = { x: content.x + content.w - 4, y: content.y, w: 4, h: content.h };
          scroll.drawBar(ctx, track);
        }
      }

      // Footer: back, reset timer and rerolls (or the latest note).
      const fy = height - 20;
      hits.add({ x: x0, y: fy, w: 52, h: 16 }, 'Back', back);
      const mid = x0 + cw / 2;
      if (noteT > 0 && note) {
        drawText(ctx, fitText(note, cw - 120), mid, fy + 11, noteColor, 'center');
      } else if (tab === 2) {
        drawText(ctx, 'New reward every local day', mid, fy + 11, UI.dim, 'center');
      } else {
        drawText(
          ctx,
          `Resets in ${formatCountdown(msUntilReset(kind(), now))}`,
          mid,
          fy + 11,
          UI.soft,
          'center',
        );
      }
      if (tab !== 2) {
        const rr = `Rerolls ${data.missions.rerollsLeft}/${DAILY_REROLLS}`;
        drawText(
          ctx,
          rr,
          x0 + cw,
          fy + 11,
          data.missions.rerollsLeft > 0 ? UI.soft : UI.faint,
          'right',
        );
      }
      hits.draw(ctx, (h) => h.label === 'Back');
    },
    onMove(x, y) {
      mx = x;
      my = y;
      hits.move(x, y);
    },
    onClick(x, y) {
      mx = x;
      my = y;
      const t = tabRects.findIndex((r) => inRect(r, x, y));
      if (t >= 0) {
        setTab(t);
        app.audio.play('click');
        return;
      }
      if (track && inRect(track, x, y) && scroll.clickTrack(track, y)) return;
      if (hits.click(x, y)) app.audio.play('click');
    },
    onWheel(dy) {
      scroll.by(dy > 0 ? 18 : -18);
    },
    onKey(code) {
      const nav = keyToNav(code);
      if (nav === 'back') return back();
      if (nav === 'left' || nav === 'prev') return setTab(tab - 1);
      if (nav === 'right' || nav === 'next') return setTab(tab + 1);
      const list = views();
      if (nav === 'up' || nav === 'down') {
        sel = Math.max(0, Math.min(list.length - 1, sel + (nav === 'up' ? -1 : 1)));
        scroll.reveal(sel * (CARD_H + CARD_GAP), CARD_H, content.h);
        return;
      }
      if (tab === 2) {
        if (nav === 'ok') claimLogin();
        return;
      }
      const v = list[sel];
      if (!v) return;
      if (nav === 'ok' && v.done && !v.claimed) claim(v);
      else if (code === 'KeyR' && !v.done && !v.claimed) reroll(v);
    },
  };
}
