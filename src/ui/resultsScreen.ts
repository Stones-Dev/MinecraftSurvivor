/**
 * Results: the run's numbers on the left (new bests marked), what it earned on the right (emeralds,
 * eggs, mission progress, unlocked achievements, leaderboard). Saves the run when created (never for
 * debug runs). Readable from 320x180 up; the right column scrolls with Up/Down or the wheel.
 */
import type { App } from '../app';
import type { View } from '../core/canvas';
import type { RunState } from '../game';
import { heroById } from '../data/companions';
import { rewardText } from '../data/missions';
import { baseMods } from '../data/upgrades';
import { runReward, runRewardBreakdown } from '../systems/economy';
import { applyLoadoutMods } from '../systems/meta';
import { finishRun, type RunOutcome } from '../systems/runEnd';
import { biomesVisited, type RunRecord } from '../systems/runStats';
import { drawIcon } from './icons';
import { drawRewardInline, formatClock, groupDigits, HitList, shortNumber } from './metaWidgets';
import { toastSync } from './metaWatch';
import {
  drawBar,
  drawPanel,
  drawText,
  drawTextScaled,
  fitText,
  inRect,
  textWidth,
  UI,
  type Rect,
} from './panel';
import type { Screen } from './router';
import { Scroller, withClip } from './scroll';

interface Line {
  h: number;
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void;
}

const heading = (text: string): Line => ({
  h: 12,
  draw(ctx, x, y) {
    drawText(ctx, text, x, y + 8, UI.gold);
  },
});
const note = (text: string, color: string = UI.soft): Line => ({
  h: 10,
  draw(ctx, x, y, w) {
    drawText(ctx, fitText(text, w), x, y + 8, color);
  },
});

export function resultsScreen(
  app: App,
  run: RunState,
  persist = true,
  opts: { submit?: boolean } = {},
): Screen {
  const data = app.data();
  const rec: RunRecord = run.stats.snapshot(run);
  // Permanent bonuses only (Looting, Pig): Golden Hour and other timed buffs must not depend on the final second.
  const meta = baseMods();
  applyLoadoutMods(run.loadout, meta);
  const summary = {
    timeSec: run.time,
    kills: run.kills,
    bosses: run.bossKills,
    miniBosses: run.miniKills,
    picked: run.emeraldsPicked,
  };
  const earned = runReward(summary, meta.payoutMult);
  const parts = runRewardBreakdown(summary, meta.payoutMult);

  let outcome: RunOutcome | null = null;
  if (persist) {
    try {
      outcome = finishRun(data, rec, earned, Date.now());
      app.store.save(data);
      toastSync({ unlocked: outcome.unlocked, missions: [], autoClaimed: outcome.autoClaimed });
    } catch (e) {
      console.warn('[results] could not record the run', e);
    }
  }
  const newTime = persist ? (outcome?.newBestTime ?? false) : false;
  const newKills = persist ? (outcome?.newBestKills ?? false) : false;

  // Leaderboard: fire and forget, never blocks the screen (errors are swallowed).
  let boardNote = '';
  if (persist && opts.submit !== false) {
    try {
      const lb = app.leaderboard();
      const p = lb.submitRun?.({ hero: rec.hero, timeSec: rec.timeSec, kills: rec.kills });
      void p
        ?.then((boards) => {
          if (boards.length > 0) boardNote = 'New personal best on the leaderboard!';
        })
        .catch(() => undefined);
    } catch {
      // Offline or signed out: the local board is built from the save.
    }
  }

  const hits = new HitList();
  const scroll = new Scroller();
  let viewport: Rect = { x: 0, y: 0, w: 0, h: 0 };
  let track: Rect | null = null;
  const done = (): void => app.goHub();

  const rightLines = (): Line[] => {
    const out: Line[] = [heading('EARNED')];
    out.push({
      h: 13,
      draw(ctx, x, y) {
        drawIcon(ctx, 'emerald', x, y);
        drawText(ctx, `+${groupDigits(earned)} emeralds`, x + 15, y + 9, UI.green);
      },
    });
    const bits = [
      parts.time > 0 ? `time +${parts.time}` : '',
      parts.kills > 0 ? `kills +${parts.kills}` : '',
      parts.bosses + parts.miniBosses > 0 ? `bosses +${parts.bosses + parts.miniBosses}` : '',
      parts.picked > 0 ? `pickups +${parts.picked}` : '',
      parts.bonus > 0 ? `bonus +${parts.bonus}` : '',
    ].filter(Boolean);
    if (bits.length) out.push(note(bits.join('  '), UI.dim));
    if (rec.eggsFound + rec.rareEggsFound > 0) {
      out.push({
        h: 13,
        draw(ctx, x, y) {
          drawRewardInline(
            ctx,
            { spawnEggs: rec.eggsFound, rareSpawnEggs: rec.rareEggsFound },
            x,
            y,
          );
        },
      });
    }
    if (!persist) {
      out.push(note('Debug run: nothing was saved.', UI.red));
      return out;
    }
    const missions = outcome?.missions ?? [];
    out.push(heading('MISSIONS'));
    if (missions.length === 0) out.push(note('No mission progress this run.', UI.dim));
    for (const m of missions) {
      out.push({
        h: 19,
        draw(ctx, x, y, w) {
          drawText(ctx, fitText(m.text, w - (m.completedNow ? 40 : 0)), x, y + 8, UI.text);
          if (m.completedNow) drawText(ctx, 'DONE!', x + w, y + 8, UI.green, 'right');
          drawBar(
            ctx,
            { x, y: y + 11, w: w - 44, h: 5 },
            m.after / m.target,
            m.completedNow ? UI.green : '#4aa0ff',
          );
          drawText(
            ctx,
            `${shortNumber(m.after)}/${shortNumber(m.target)}`,
            x + w,
            y + 16,
            UI.soft,
            'right',
          );
        },
      });
    }
    const unlocked = outcome?.unlocked ?? [];
    if (unlocked.length > 0) {
      out.push(heading('ACHIEVEMENTS'));
      for (const a of unlocked) {
        out.push({
          h: 16,
          draw(ctx, x, y, w) {
            drawIcon(ctx, a.icon, x, y + 1);
            drawText(ctx, fitText(a.name, w - 16), x + 15, y + 6, UI.gold);
            if (a.reward)
              drawText(ctx, fitText(rewardText(a.reward), w - 16), x + 15, y + 14, UI.dim);
          },
        });
      }
    }
    if (outcome && (outcome.autoClaimed.emeralds ?? 0) > 0) {
      out.push(note(`Yesterday's missions paid ${rewardText(outcome.autoClaimed)}`, UI.green));
    }
    if (boardNote) out.push(note(boardNote, UI.gold));
    return out;
  };

  const leftRows = (): [string, string, boolean][] => {
    const visited = biomesVisited(rec.timeByBiome).length;
    return [
      ['Time', formatClock(rec.timeSec), newTime],
      ['Kills', groupDigits(rec.kills), newKills],
      ['Level', String(rec.level), false],
      ['Damage dealt', shortNumber(rec.damageDealt), false],
      ['Damage taken', shortNumber(rec.damageTaken), false],
      ['Emeralds picked', groupDigits(rec.emeraldsPicked), false],
      ['Bosses / minis', `${rec.bosses} / ${rec.minis}`, false],
      ['Ability casts', String(rec.abilityCasts), false],
      ['Biomes visited', String(visited), false],
      ['Eggs (rare)', `${rec.eggsFound} (${rec.rareEggsFound})`, false],
    ];
  };

  return {
    update() {},
    render(view: View) {
      const { ctx, width, height } = view;
      ctx.fillStyle = '#14141c';
      ctx.fillRect(0, 0, width, height);
      const cw = Math.min(width - 12, 440);
      const x0 = Math.floor((width - cw) / 2);
      const roomy = height >= 220;
      const title = run.won ? 'NIGHT SURVIVED' : 'YOU DIED';
      const tcolor = run.won ? UI.green : '#ff6b6b';
      if (width >= 400) drawTextScaled(ctx, title, width / 2, 20, tcolor, 'center', 2);
      else drawText(ctx, title, width / 2, 14, tcolor, 'center');
      const sub = `${heroById(rec.hero).name} - ${formatClock(rec.timeSec)}`;
      drawText(ctx, sub, width / 2, width >= 400 ? 32 : 24, UI.dim, 'center');

      const top = width >= 400 ? 38 : 29;
      const bottom = height - 24;
      const leftW = Math.floor(cw * 0.46);
      const left: Rect = { x: x0, y: top, w: leftW, h: bottom - top };
      const right: Rect = { x: x0 + leftW + 4, y: top, w: cw - leftW - 4, h: bottom - top };
      drawPanel(ctx, left);
      drawPanel(ctx, right);

      const rowH = roomy ? 12 : 10;
      const rows = leftRows();
      const gap = Math.min(rowH, Math.floor((left.h - 8) / rows.length));
      rows.forEach(([k, v, rec2], i) => {
        const y = left.y + 6 + i * gap + 7;
        drawText(ctx, k, left.x + 6, y, UI.soft);
        drawText(ctx, v, left.x + left.w - 6, y, rec2 ? UI.gold : UI.text, 'right');
        if (rec2) drawText(ctx, 'NEW', left.x + left.w - 6 - textWidth(v) - 4, y, UI.gold, 'right');
      });

      viewport = { x: right.x + 6, y: right.y + 5, w: right.w - 12 - 4, h: right.h - 10 };
      const lines = rightLines();
      const total = lines.reduce((a, l) => a + l.h, 0);
      scroll.fit(total, viewport.h);
      withClip(ctx, viewport, () => {
        let y = viewport.y - scroll.offset;
        for (const l of lines) {
          if (y + l.h > viewport.y && y < viewport.y + viewport.h)
            l.draw(ctx, viewport.x, y, viewport.w);
          y += l.h;
        }
      });
      track = null;
      if (scroll.scrollable) {
        track = { x: right.x + right.w - 6, y: viewport.y, w: 4, h: viewport.h };
        scroll.drawBar(ctx, track);
      }

      hits.begin();
      const bw = 110;
      hits.add(
        { x: Math.floor((width - bw) / 2), y: height - 20, w: bw, h: 16 },
        'Continue',
        done,
        {
          style: { variant: 'primary' },
        },
      );
      hits.draw(ctx);
      if (scroll.scrollable) {
        drawText(ctx, 'Up/Down: scroll', x0 + cw, height - 9, UI.faint, 'right');
      }
      if (persist && outcome === null)
        drawText(ctx, 'Could not save this run', x0, height - 9, UI.red);
    },
    onMove(x, y) {
      hits.move(x, y);
    },
    onClick(x, y) {
      if (track && inRect(track, x, y) && scroll.clickTrack(track, y)) return;
      hits.click(x, y);
    },
    onWheel(dy) {
      scroll.by(dy > 0 ? 14 : -14);
    },
    onKey(code) {
      if (code === 'ArrowDown' || code === 'KeyS') scroll.by(14);
      else if (code === 'ArrowUp' || code === 'KeyW') scroll.by(-14);
      else if (code === 'Enter' || code === 'Space' || code === 'Escape') done();
    },
  };
}
