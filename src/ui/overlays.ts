/** Level-up, pause and results screens (canvas-drawn overlays pushed on the router). */
import type { App } from '../app';
import type { View } from '../core/canvas';
import type { RunState } from '../game';
import { ITEMS } from '../data/items';
import { missionPreview } from '../systems/missions';
import { resolveItemChoice } from '../systems/items';
import {
  applyCard,
  buildOffer,
  enchantOffer,
  finishOffer,
  SKIP_EMERALDS,
} from '../systems/levelup';
import { cb } from '../core/accessibility';
import { drawIcon } from './icons';
import { formatClock, shortNumber } from './metaWidgets';
import {
  drawBar,
  drawButton,
  drawPanel,
  drawText,
  fitText,
  inRect,
  type Rect,
  UI,
  wrap,
} from './panel';
import { resultsScreen } from './resultsScreen';
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
    const gap = 8;
    const w = Math.min(96, Math.floor((view.width - 12 - (n - 1) * gap) / n));
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
        drawPanel(ctx, r, hover === i, cb(card.gold ? '#e8b923' : RARITY_COLOR[card.rarity]));
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
/** `persist` is false for debug runs (their results are shown but never saved). */
export function victoryScreen(app: App, run: RunState, persist = true): Screen {
  app.audio.play('victory');
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
      if (i === 1) app.router.replace(resultsScreen(app, run, persist));
    },
    onKey(code) {
      if (code === 'Enter' || code === 'Space') app.router.pop();
    },
  };
}

/**
 * Pause menu. With the live `run` it also shows the run so far and how today's missions would stand if
 * the run ended now (the sim is frozen, so this is computed once).
 */
export function pauseScreen(app: App, onQuit: () => void, run?: RunState): Screen {
  let hover = -1;
  let lastView: View | null = null;
  const info = run ? run.stats.snapshot(run) : null;
  const missions = info
    ? missionPreview(app.data(), info)
        .sort((x, y) => y.projected - y.progress - (x.projected - x.progress))
        .slice(0, 5)
    : [];
  const rowsFor = (view: View): number => Math.min(missions.length, view.height < 220 ? 3 : 5);
  const layout = (view: View): { panel: Rect; btns: Rect[] } => {
    const w = Math.min(view.width - 12, 230);
    const cx = Math.floor(view.width / 2);
    const rows = rowsFor(view);
    const bodyH = (info ? 12 : 0) + (rows > 0 ? 11 + rows * 12 : 0);
    const h = 18 + bodyH + 2 * 18 + 6 + 8 + 12;
    const panel = {
      x: cx - Math.floor(w / 2),
      y: Math.max(2, Math.floor((view.height - h) / 2)),
      w,
      h,
    };
    const by = panel.y + h - 12 - 2 * 18 - 6;
    return {
      panel,
      btns: [
        { x: cx - 50, y: by, w: 100, h: 16 },
        { x: cx - 50, y: by + 20, w: 100, h: 16 },
      ],
    };
  };
  const resume = (): void => app.router.pop();
  return {
    update() {},
    render(view) {
      lastView = view;
      dim(view, 0.62);
      const { ctx } = view;
      const { panel, btns } = layout(view);
      drawPanel(ctx, panel);
      drawText(ctx, 'PAUSED', view.width / 2, panel.y + 13, '#fff', 'center');
      let y = panel.y + 26;
      if (info && run) {
        drawText(
          ctx,
          fitText(
            `${formatClock(run.time)}   Kills ${run.kills}   Level ${run.level}`,
            panel.w - 12,
          ),
          view.width / 2,
          y,
          UI.soft,
          'center',
        );
        y += 12;
      }
      const rows = rowsFor(view);
      if (rows > 0) {
        drawText(ctx, "TODAY'S MISSIONS", panel.x + 8, y + 3, UI.gold);
        y += 11;
        missions.slice(0, rows).forEach((m, i) => {
          const ry = y + i * 12;
          const shown = m.projected;
          const doneNow = shown >= m.def.target;
          const num = `${shortNumber(shown)}/${shortNumber(m.def.target)}`;
          drawText(
            ctx,
            fitText(m.def.text, panel.w - 16 - 52),
            panel.x + 8,
            ry + 5,
            doneNow ? UI.green : UI.text,
          );
          drawText(ctx, num, panel.x + panel.w - 8, ry + 5, doneNow ? UI.green : UI.soft, 'right');
          drawBar(
            ctx,
            { x: panel.x + 8, y: ry + 7, w: panel.w - 16, h: 3 },
            shown / m.def.target,
            doneNow ? UI.green : '#4aa0ff',
          );
        });
      }
      const [a, b] = btns;
      if (a && b) {
        drawButton(ctx, a, 'Resume (Esc)', hover === 0, false, { variant: 'primary' });
        drawButton(ctx, b, 'Quit to menu', hover === 1);
        drawText(ctx, 'Quitting forfeits this run', view.width / 2, b.y + 28, UI.faint, 'center');
      }
    },
    onMove(x, y) {
      if (lastView) hover = layout(lastView).btns.findIndex((r) => inRect(r, x, y));
    },
    onClick(x, y) {
      if (!lastView) return;
      const i = layout(lastView).btns.findIndex((r) => inRect(r, x, y));
      if (i === 0) resume();
      if (i === 1) onQuit();
    },
    onKey(code) {
      if (code === 'Escape' || code === 'KeyP' || app.input.pausePressed()) resume();
    },
  };
}

export { resultsScreen };
