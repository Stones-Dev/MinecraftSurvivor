/** Level-up, pause and results screens (canvas-drawn overlays pushed on the router). */
import type { App } from '../app';
import type { View } from '../core/canvas';
import type { RunState } from '../game';
import { ITEMS } from '../data/items';
import { baseMods } from '../data/upgrades';
import { runReward } from '../systems/economy';
import { applyLoadoutMods } from '../systems/meta';
import { resolveItemChoice } from '../systems/items';
import {
  applyCard,
  buildOffer,
  enchantOffer,
  finishOffer,
  SKIP_EMERALDS,
} from '../systems/levelup';
import { drawIcon } from './icons';
import { drawButton, drawPanel, drawText, inRect, type Rect, wrap } from './panel';
import type { Screen } from './router';

const RARITY_COLOR = { common: '#101014', rare: '#3b78d8', epic: '#a24ad8', legendary: '#e8b923' };

function dim(view: View, alpha: number): void {
  view.ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  view.ctx.fillRect(0, 0, view.width, view.height);
}

export function levelupScreen(app: App, run: RunState): Screen {
  let hover = -1;
  let hoverBtn = -1;
  const cardRect = (view: View, i: number): Rect => {
    const n = run.offer?.length ?? 3;
    const w = 96;
    const gap = 8;
    const x0 = Math.floor((view.width - (n * w + (n - 1) * gap)) / 2);
    return { x: x0 + i * (w + gap), y: Math.floor(view.height / 2) - 52, w, h: 108 };
  };
  const btns = (view: View): Rect[] => {
    const y = Math.floor(view.height / 2) + 66;
    const cx = Math.floor(view.width / 2);
    return [
      { x: cx - 78, y, w: 74, h: 16 },
      { x: cx + 4, y, w: 74, h: 16 },
    ];
  };
  const pick = (i: number): void => {
    const card = run.offer?.[i];
    if (!card) return;
    applyCard(run, card);
    finishOffer(run);
    app.router.pop();
  };
  const reroll = (): void => {
    if (run.rerolls <= 0) return;
    run.rerolls--;
    run.offer = run.offerKind === 'enchant' ? enchantOffer(run) : buildOffer(run);
  };
  const skip = (): void => {
    run.emeraldsPicked += SKIP_EMERALDS;
    finishOffer(run);
    app.router.pop();
  };
  let lastView: View | null = null;
  return {
    update() {},
    render(view) {
      lastView = view;
      const { ctx } = view;
      dim(view, 0.62);
      drawText(
        ctx,
        'LEVEL UP!',
        view.width / 2,
        Math.floor(view.height / 2) - 62,
        '#ffe27a',
        'center',
      );
      run.offer?.forEach((card, i) => {
        const r = cardRect(view, i);
        drawPanel(ctx, r, hover === i, card.gold ? '#e8b923' : RARITY_COLOR[card.rarity]);
        drawText(ctx, `${i + 1}`, r.x + 6, r.y + 12, '#aaa');
        if (card.isNew) drawText(ctx, 'NEW', r.x + r.w - 6, r.y + 12, '#7dff9a', 'right');
        drawIcon(ctx, card.icon, r.x + r.w / 2 - 18, r.y + 18, 3);
        drawText(ctx, card.title, r.x + r.w / 2, r.y + 66, '#fff', 'center');
        wrap(ctx, card.desc, r.w - 12).forEach((line, j) =>
          drawText(ctx, line, r.x + r.w / 2, r.y + 80 + j * 9, '#c9c9d4', 'center'),
        );
      });
      const [b0, b1] = btns(view);
      if (b0 && b1) {
        drawButton(ctx, b0, `Reroll (R) x${run.rerolls}`, hoverBtn === 0, run.rerolls <= 0);
        drawButton(ctx, b1, `Skip (S) +${SKIP_EMERALDS}`, hoverBtn === 1);
      }
    },
    onMove(x, y) {
      if (!lastView) return;
      hover = (run.offer ?? []).findIndex((_c, i) => inRect(cardRect(lastView as View, i), x, y));
      hoverBtn = btns(lastView).findIndex((b) => inRect(b, x, y));
    },
    onClick(x, y) {
      if (!lastView) return;
      const i = (run.offer ?? []).findIndex((_c, k) => inRect(cardRect(lastView as View, k), x, y));
      if (i >= 0) return pick(i);
      const b = btns(lastView).findIndex((r) => inRect(r, x, y));
      if (b === 0) reroll();
      if (b === 1) skip();
    },
    onKey(code) {
      if (code === 'Digit1' || code === 'Numpad1') pick(0);
      else if (code === 'Digit2' || code === 'Numpad2') pick(1);
      else if (code === 'Digit3' || code === 'Numpad3') pick(2);
      else if (code === 'Digit4' || code === 'Numpad4') pick(3);
      else if (code === 'KeyR') reroll();
      else if (code === 'KeyS') skip();
    },
  };
}

/** Asked when a second item is found: keep the current one or swap (the game stays paused). */
export function itemChoiceScreen(app: App, run: RunState): Screen {
  let hover = -1;
  let lastView: View | null = null;
  const btns = (view: View): Rect[] => {
    const cx = Math.floor(view.width / 2);
    const y = Math.floor(view.height / 2) + 30;
    return [
      { x: cx - 104, y, w: 100, h: 18 },
      { x: cx + 4, y, w: 100, h: 18 },
    ];
  };
  const choose = (take: boolean): void => {
    resolveItemChoice(run, take);
    app.router.pop();
  };
  return {
    update() {},
    render(view) {
      lastView = view;
      const { ctx } = view;
      dim(view, 0.62);
      drawText(
        ctx,
        'NEW ITEM FOUND',
        view.width / 2,
        Math.floor(view.height / 2) - 44,
        '#ffe27a',
        'center',
      );
      const cur = run.item ? ITEMS[run.item] : null;
      const next = run.pendingItem ? ITEMS[run.pendingItem] : null;
      const cx = Math.floor(view.width / 2);
      const y = Math.floor(view.height / 2) - 36;
      for (const [i, def, label] of [
        [0, cur, 'Keep'],
        [1, next, 'Take'],
      ] as const) {
        const r: Rect = { x: cx + (i === 0 ? -104 : 4), y, w: 100, h: 62 };
        drawPanel(ctx, r, hover === i);
        if (def) {
          drawIcon(ctx, def.icon, r.x + r.w / 2 - 12, r.y + 6, 2);
          drawText(ctx, def.name, r.x + r.w / 2, r.y + 38, '#fff', 'center');
          wrap(ctx, def.blurb, r.w - 8)
            .slice(0, 2)
            .forEach((line, j) =>
              drawText(ctx, line, r.x + r.w / 2, r.y + 47 + j * 8, '#c9c9d4', 'center'),
            );
        }
        drawText(ctx, label, r.x + 6, r.y + 10, '#aaa');
      }
      const [a, b] = btns(view);
      if (a && b) {
        drawButton(ctx, a, 'Keep current (1)', hover === 0);
        drawButton(ctx, b, 'Take new (2)', hover === 1);
      }
    },
    onMove(x, y) {
      if (lastView) hover = btns(lastView).findIndex((r) => inRect(r, x, y));
    },
    onClick(x, y) {
      if (!lastView) return;
      const i = btns(lastView).findIndex((r) => inRect(r, x, y));
      if (i >= 0) choose(i === 1);
    },
    onKey(code) {
      if (code === 'Digit1') choose(false);
      else if (code === 'Digit2') choose(true);
    },
  };
}

/** Shown once when the Warden falls: carry on into Endless or finish the run. */
export function victoryScreen(app: App, run: RunState): Screen {
  let hover = -1;
  let lastView: View | null = null;
  const btns = (view: View): Rect[] => {
    const cx = Math.floor(view.width / 2);
    const y = Math.floor(view.height / 2) + 6;
    return [
      { x: cx - 60, y, w: 120, h: 18 },
      { x: cx - 60, y: y + 24, w: 120, h: 18 },
    ];
  };
  return {
    update() {},
    render(view) {
      lastView = view;
      dim(view, 0.5);
      const { ctx } = view;
      drawText(
        ctx,
        'NIGHT SURVIVED!',
        view.width / 2,
        Math.floor(view.height / 2) - 24,
        '#7dff9a',
        'center',
      );
      drawText(
        ctx,
        'The Warden has fallen.',
        view.width / 2,
        Math.floor(view.height / 2) - 10,
        '#fff',
        'center',
      );
      const [a, b] = btns(view);
      if (a && b) {
        drawButton(ctx, a, 'Continue (Endless)', hover === 0);
        drawButton(ctx, b, 'Finish run', hover === 1);
      }
    },
    onMove(x, y) {
      if (lastView) hover = btns(lastView).findIndex((r) => inRect(r, x, y));
    },
    onClick(x, y) {
      if (!lastView) return;
      const i = btns(lastView).findIndex((r) => inRect(r, x, y));
      if (i === 0) app.router.pop();
      if (i === 1) app.router.replace(resultsScreen(app, run));
    },
    onKey(code) {
      if (code === 'Enter' || code === 'Space') app.router.pop();
    },
  };
}

export function pauseScreen(app: App, onQuit: () => void): Screen {
  let hover = -1;
  let lastView: View | null = null;
  const btns = (view: View): Rect[] => {
    const cx = Math.floor(view.width / 2);
    const y = Math.floor(view.height / 2);
    return [
      { x: cx - 50, y: y - 8, w: 100, h: 18 },
      { x: cx - 50, y: y + 16, w: 100, h: 18 },
    ];
  };
  const resume = (): void => app.router.pop();
  return {
    update() {},
    render(view) {
      lastView = view;
      dim(view, 0.55);
      drawText(
        view.ctx,
        'PAUSED',
        view.width / 2,
        Math.floor(view.height / 2) - 22,
        '#fff',
        'center',
      );
      const [a, b] = btns(view);
      if (a && b) {
        drawButton(view.ctx, a, 'Resume (Esc)', hover === 0);
        drawButton(view.ctx, b, 'Quit to menu', hover === 1);
      }
    },
    onMove(x, y) {
      if (lastView) hover = btns(lastView).findIndex((r) => inRect(r, x, y));
    },
    onClick(x, y) {
      if (!lastView) return;
      const i = btns(lastView).findIndex((r) => inRect(r, x, y));
      if (i === 0) resume();
      if (i === 1) onQuit();
    },
    onKey(code) {
      if (code === 'Escape' || code === 'KeyP') resume();
    },
  };
}

/** Results: totals, emeralds earned, records. Saves progress when created. */
export function resultsScreen(app: App, run: RunState): Screen {
  const data = app.data();
  // Permanent bonuses only (Looting, Pig): Golden Hour and other timed buffs must not depend on the final second.
  const meta = baseMods();
  applyLoadoutMods(run.loadout, meta);
  const earned = runReward(
    {
      timeSec: run.time,
      kills: run.kills,
      bosses: run.bossKills,
      miniBosses: run.miniKills,
      picked: run.emeraldsPicked,
    },
    meta.lootMult,
  );
  const newTime = Math.floor(run.time) > Math.floor(data.records.bestTimeSec);
  const newKills = run.kills > data.records.bestKills;
  data.currencies.emeralds += earned;
  data.records.runs += 1;
  data.flags.tutorialDone = true;
  if (run.won) data.records.wins += 1;
  data.currencies.spawnEggs += run.spawnEggs;
  data.currencies.rareSpawnEggs += run.rareSpawnEggs;
  data.records.bestTimeSec = Math.max(data.records.bestTimeSec, Math.floor(run.time));
  data.records.bestKills = Math.max(data.records.bestKills, run.kills);
  app.store.save(data);
  let hover = false;
  let lastView: View | null = null;
  const btn = (view: View): Rect => ({
    x: Math.floor(view.width / 2) - 50,
    y: Math.floor(view.height / 2) + 52,
    w: 100,
    h: 18,
  });
  const m = Math.floor(run.time / 60);
  const s = Math.floor(run.time % 60);
  return {
    update() {},
    render(view) {
      lastView = view;
      const { ctx, width, height } = view;
      ctx.fillStyle = '#14141c';
      ctx.fillRect(0, 0, width, height);
      const panel: Rect = {
        x: Math.floor(width / 2) - 90,
        y: Math.floor(height / 2) - 62,
        w: 180,
        h: 108,
      };
      drawPanel(ctx, panel);
      drawText(
        ctx,
        run.won ? 'NIGHT SURVIVED' : 'YOU DIED',
        width / 2,
        panel.y + 16,
        run.won ? '#7dff9a' : '#ff6b6b',
        'center',
      );
      const rows: [string, string, boolean][] = [
        ['Time', `${m}:${s.toString().padStart(2, '0')}`, newTime],
        ['Kills', String(run.kills), newKills],
        ['Level', String(run.level), false],
        ['Bosses / mini-bosses', `${run.bossKills} / ${run.miniKills}`, false],
        ['Spawn Eggs (rare)', `${run.spawnEggs} (${run.rareSpawnEggs})`, false],
        ['Emeralds earned', `+${earned}`, false],
      ];
      rows.forEach(([k, v, record], i) => {
        drawText(ctx, k, panel.x + 14, panel.y + 36 + i * 14, '#c9c9d4');
        drawText(ctx, v, panel.x + panel.w - 14, panel.y + 36 + i * 14, '#fff', 'right');
        if (record)
          drawText(
            ctx,
            'NEW RECORD',
            panel.x + panel.w / 2,
            panel.y + 36 + i * 14,
            '#ffe27a',
            'center',
          );
      });
      drawButton(ctx, btn(view), 'Back to menu', hover);
    },
    onMove(x, y) {
      if (lastView) hover = inRect(btn(lastView), x, y);
    },
    onClick(x, y) {
      if (lastView && inRect(btn(lastView), x, y)) app.goHub();
    },
    onKey(code) {
      if (code === 'Enter' || code === 'Space') app.goHub();
    },
  };
}
