/** The Spawner (gacha) screen: a pixel-art mob spawner cage, x1 / x10 pulls, pity counter and rates. */
import { cb } from '../core/accessibility';
import type { App } from '../app';
import type { View } from '../core/canvas';
import {
  COMPANION_BY_ID,
  COMPANIONS,
  DUPE_EMERALDS,
  RARITY_COLOR,
  RARITY_LABEL,
  RARITY_ORDER,
  type CompanionRarity,
} from '../data/companions';
import { OVERWORLD_BANNER, type PullResult, spendAndPull } from '../systems/gacha';
import type { IconName } from './icons';
import {
  UI,
  drawBar,
  drawPanel,
  drawText,
  drawTooltip,
  fitText,
  inRect,
  tooltipLines,
  wrap,
  type Rect,
} from './panel';
import type { Screen } from './router';
import { Buttons, drawCompanion, drawPill, drawRarity, drawTitle } from './widgets';

type Phase = 'idle' | 'spin' | 'reveal' | 'tray';

const SPIN_ONE = 1.7;
const SPIN_TEN = 0.42;

/** Cheap deterministic jitter in [0, 1) for lightning and flames. */
function jitter(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function drawCage(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  t: number,
  color: string,
  heat: number,
  lightning: boolean,
): void {
  // Stone base.
  ctx.fillStyle = '#101014';
  ctx.fillRect(cx - 28, cy + 22, 56, 8);
  ctx.fillStyle = '#4a4a54';
  ctx.fillRect(cx - 27, cy + 22, 54, 6);
  ctx.fillStyle = '#62626e';
  ctx.fillRect(cx - 27, cy + 22, 54, 1);
  // Dark interior.
  ctx.fillStyle = '#0c0c12';
  ctx.fillRect(cx - 22, cy - 24, 44, 46);
  // Glow behind the bars, stronger with heat.
  ctx.globalAlpha = 0.12 + 0.3 * heat;
  ctx.fillStyle = color;
  ctx.fillRect(cx - 22, cy - 24, 44, 46);
  ctx.globalAlpha = 1;
  // Flames along the top edge.
  for (let i = 0; i < 9; i++) {
    const fx = cx - 22 + i * 5.5;
    const h = 3 + heat * 12 * (0.5 + jitter(i * 3.1 + Math.floor(t * 14)));
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(fx), Math.round(cy - 24 - h), 4, Math.round(h));
    ctx.fillStyle = '#fff6c8';
    ctx.fillRect(Math.round(fx + 1), Math.round(cy - 24 - h * 0.5), 2, Math.round(h * 0.5));
  }
  if (lightning) {
    ctx.fillStyle = '#fff3a8';
    for (let b = 0; b < 2; b++) {
      let x = cx + (b === 0 ? -34 : 34);
      let y = cy - 46;
      const seed = Math.floor(t * 18) + b * 7;
      for (let s = 0; s < 8; s++) {
        const nx = x + (jitter(seed + s) - 0.5) * 10 + (b === 0 ? 1.5 : -1.5);
        ctx.fillRect(
          Math.round(Math.min(x, nx)),
          Math.round(y),
          Math.max(2, Math.round(Math.abs(nx - x))),
          7,
        );
        x = nx;
        y += 7;
      }
    }
  }
}

function drawBars(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  ctx.fillStyle = '#2a2a32';
  for (let i = 0; i < 6; i++) ctx.fillRect(cx - 22 + i * 8.4, cy - 24, 2, 46);
  // Frame.
  ctx.fillStyle = '#7b7b88';
  ctx.fillRect(cx - 24, cy - 26, 48, 3);
  ctx.fillRect(cx - 24, cy + 19, 48, 3);
  ctx.fillRect(cx - 24, cy - 26, 3, 48);
  ctx.fillRect(cx + 21, cy - 26, 3, 48);
  ctx.fillStyle = '#a6a6b4';
  ctx.fillRect(cx - 24, cy - 26, 48, 1);
}

/** A wall torch: a stick with a flickering flame. */
function drawTorch(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  ctx.fillStyle = '#101014';
  ctx.fillRect(x - 2, y, 4, 12);
  ctx.fillStyle = '#7a5530';
  ctx.fillRect(x - 1, y + 1, 2, 10);
  const f = Math.floor(t * 10);
  const h = 4 + Math.floor(jitter(f) * 3);
  ctx.fillStyle = '#ff8a2a';
  ctx.fillRect(x - 2, y - h, 4, h);
  ctx.fillStyle = '#ffd84a';
  ctx.fillRect(x - 1, y - h + 1, 2, h - 1);
  ctx.fillStyle = '#fff6c8';
  ctx.fillRect(x - 1, y - 2, 2, 2);
  ctx.fillStyle = '#ffb040';
  ctx.globalAlpha = 0.05;
  ctx.fillRect(x - 12, y - 10, 24, 22);
  ctx.globalAlpha = 0.07;
  ctx.fillRect(x - 8, y - 8, 16, 18);
  ctx.globalAlpha = 0.1;
  ctx.fillRect(x - 5, y - 7, 10, 12);
  ctx.globalAlpha = 1;
}

/** Embers drifting up from the cage in its glow colour. */
function drawEmbers(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  t: number,
  color: string,
  heat: number,
): void {
  ctx.fillStyle = color;
  const n = 6 + Math.floor(heat * 10);
  for (let i = 0; i < n; i++) {
    const life = (t * (12 + jitter(i) * 10) + i * 17) % 60;
    const x = cx - 22 + jitter(i * 3.7) * 44 + Math.sin(t * 2 + i) * 3;
    const y = cy + 18 - life;
    ctx.globalAlpha = Math.max(0, 1 - life / 60) * 0.8;
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }
  ctx.globalAlpha = 1;
}

export function spawnerScreen(app: App, onBack: () => void): Screen {
  const { atlas } = app;
  const buttons = new Buttons();
  let phase: Phase = 'idle';
  let t = 0;
  let spinT = 0;
  let queue: PullResult[] = [];
  let shown: PullResult[] = [];
  let cur: PullResult | null = null;
  let tenMode = false;
  let showRates = false;
  let message = '';
  let ratesRect = { x: 0, y: 0, w: 0, h: 0 };
  let pills: { r: Rect; tip: string }[] = [];
  let mx = -1;
  let my = -1;

  const save = () => app.data();

  const startPull = (count: 1 | 10): void => {
    if (phase === 'spin' || phase === 'reveal') return;
    const data = save();
    const results = spendAndPull(data, OVERWORLD_BANNER, count);
    if (!results) {
      message = count === 1 ? 'You need a Spawn Egg.' : 'You need a Rare Spawn Egg.';
      return;
    }
    message = '';
    app.store.save(data);
    app.audio.play('click');
    queue = results.slice();
    shown = [];
    tenMode = count === 10;
    nextSpin();
  };

  const nextSpin = (): void => {
    cur = queue.shift() ?? null;
    if (!cur) {
      phase = tenMode ? 'tray' : 'idle';
      return;
    }
    phase = 'spin';
    spinT = tenMode ? SPIN_TEN : SPIN_ONE;
    t = 0;
  };

  const finishSpin = (): void => {
    if (!cur) return;
    const r = cur;
    const hi = RARITY_ORDER.indexOf(r.rarity);
    app.audio.play(hi >= 4 ? 'legendary' : hi >= 3 ? 'levelup' : hi >= 2 ? 'emerald' : 'xp');
    if (tenMode) {
      shown.push(r);
      nextSpin();
    } else {
      phase = 'reveal';
      t = 0;
    }
  };

  const skip = (): void => {
    if (phase === 'spin') {
      if (tenMode) {
        while (cur) {
          shown.push(cur);
          cur = queue.shift() ?? null;
        }
        phase = 'tray';
      } else {
        finishSpin();
      }
    } else if (phase === 'reveal') {
      phase = 'idle';
      cur = null;
    } else if (phase === 'tray') {
      phase = 'idle';
      shown = [];
    }
  };

  const busy = (): boolean => phase === 'spin' || phase === 'reveal';

  return {
    update(dt) {
      t += dt;
      if (phase === 'spin') {
        if (Math.floor(t * 14) !== Math.floor((t - dt) * 14)) app.audio.play('spin');
        spinT -= dt;
        if (spinT <= 0) finishSpin();
      }
    },
    render(view: View) {
      const { ctx, width, height } = view;
      const data = save();
      drawTitle(view, 'THE SPAWNER');
      const cx = Math.floor(width / 2);
      const cy = Math.floor(70 + (height - 180) * 0.3);
      // Resources (left) and the Legendary pity bar (right) under the header.
      pills = [];
      let px = 6;
      const addPill = (icon: IconName, text: string, color: string, tip: string): void => {
        const r = drawPill(ctx, px, 24, icon, text, color);
        pills.push({ r, tip });
        px += r.w + 3;
      };
      addPill('egg', String(data.currencies.spawnEggs), '#9ad978', 'Spawn Eggs: one pull each.');
      addPill(
        'egg_rare',
        String(data.currencies.rareSpawnEggs),
        UI.gold,
        'Rare Spawn Eggs: a x10 pull.',
      );
      addPill(
        'emerald',
        String(data.currencies.emeralds),
        UI.green,
        'Emeralds (duplicates refund some).',
      );
      const pity = data.pity[OVERWORLD_BANNER.id] ?? 0;
      const pw = Math.max(84, Math.min(120, width - px - 10));
      const pityBar = { x: width - 6 - pw, y: 24, w: pw, h: 14 };
      drawBar(ctx, pityBar, pity / OVERWORLD_BANNER.pity, cb(RARITY_COLOR.legendary));
      drawText(
        ctx,
        fitText(`Legendary pity ${pity}/${OVERWORLD_BANNER.pity}`, pw - 6),
        pityBar.x + pw / 2,
        pityBar.y + 10,
        '#fff',
        'center',
      );
      pills.push({
        r: pityBar,
        tip: `A Legendary is guaranteed after ${OVERWORLD_BANNER.pity} pulls without one.`,
      });

      // Cage and the thing inside it.
      let color = '#ff9a3a';
      let heat = 0.15;
      let lightning = false;
      if (phase === 'spin' && cur) {
        const total = tenMode ? SPIN_TEN : SPIN_ONE;
        const prog = 1 - spinT / total;
        color = cb(RARITY_COLOR[cur.rarity]);
        heat = 0.2 + 0.8 * prog;
        lightning = cur.rarity === 'legendary' && prog > 0.4;
      } else if (phase === 'reveal' && cur) {
        color = cb(RARITY_COLOR[cur.rarity]);
        heat = Math.max(0.2, 1 - t * 0.6);
        lightning = cur.rarity === 'legendary' && t < 1.4;
      }
      drawTorch(ctx, cx - 50, cy + 2, t);
      drawTorch(ctx, cx + 50, cy + 2, t);
      drawCage(ctx, cx, cy, t, color, heat, lightning);
      drawEmbers(ctx, cx, cy, t, color, heat);
      if (phase === 'spin') {
        // A whirl of silhouettes: companions cycle faster the closer the spin is to its end.
        const total = tenMode ? SPIN_TEN : SPIN_ONE;
        const prog = 1 - spinT / total;
        const n = Math.floor(t * (6 + 24 * prog));
        const def = COMPANIONS[Math.floor(jitter(n) * COMPANIONS.length)];
        if (def) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(cx - 22, cy - 24, 44, 46);
          ctx.clip();
          ctx.translate(cx, cy + 16);
          ctx.scale(Math.cos(t * (8 + 30 * prog)), 1);
          drawCompanion(ctx, atlas, def, 0, 0, t, 1.2, 0.55);
          ctx.restore();
        }
      }
      drawBars(ctx, cx, cy);

      // Reveal (x1).
      if (phase === 'reveal' && cur) {
        const def = COMPANION_BY_ID.get(cur.id);
        if (def) {
          const pop = Math.min(1, t * 3);
          const rise = 6 + (1 - pop) * 10;
          drawCompanion(ctx, atlas, def, cx, cy - 24 - rise + 6, t, 1 + pop * 0.8);
          const box = { x: cx - 100, y: cy + 36, w: 200, h: 58 };
          drawPanel(ctx, box, false, cb(RARITY_COLOR[cur.rarity]));
          drawText(ctx, def.name, cx, box.y + 13, '#fff', 'center');
          drawRarity(ctx, def, cx, box.y + 23, 'center');
          const status = cur.isNew
            ? 'NEW!'
            : cur.shards > 0
              ? `Hero duplicate: +${cur.shards} shards, +${cur.refund} Emeralds`
              : cur.refund > 0
                ? `Max level: +${cur.refund} Emeralds`
                : `Duplicate: level ${cur.level}`;
          drawText(ctx, status, cx, box.y + 33, cur.isNew ? '#7dff9a' : '#ffd84a', 'center');
          wrap(ctx, `"${def.quip}"`, 188).forEach((l, i) =>
            drawText(ctx, l, cx, box.y + 44 + i * 9, '#9a9aa8', 'center'),
          );
          if (cur.pityHit) drawText(ctx, 'Pity!', cx + 90, box.y + 13, '#ffc83a', 'right');
          if (cur.guaranteed) drawText(ctx, 'Guaranteed!', cx + 90, box.y + 13, '#4aa0ff', 'right');
        }
      }

      // Tray (x10).
      if (tenMode && (phase === 'spin' || phase === 'tray' || shown.length > 0)) {
        const cell = { w: Math.min(36, Math.floor((width - 8) / 5)), h: 46 };
        const cols = 5;
        const rows = Math.ceil(10 / cols);
        const x0 = Math.floor((width - cols * cell.w) / 2);
        const y0 = Math.min(cy + 36, height - 22 - 12 - rows * (cell.h + 2) - 10);
        for (let i = 0; i < 10; i++) {
          const rx = x0 + (i % cols) * cell.w;
          const ry = y0 + Math.floor(i / cols) * (cell.h + 2);
          const r = shown[i];
          drawPanel(
            ctx,
            { x: rx + 1, y: ry, w: cell.w - 2, h: cell.h },
            false,
            r ? cb(RARITY_COLOR[r.rarity]) : null,
          );
          if (!r) continue;
          const def = COMPANION_BY_ID.get(r.id);
          if (!def) continue;
          drawCompanion(ctx, atlas, def, rx + cell.w / 2, ry + 30, t, 1, 1, 24);
          drawText(
            ctx,
            def.name.length > 8 ? def.name.slice(0, 8) : def.name,
            rx + cell.w / 2,
            ry + 40,
            '#fff',
            'center',
          );
          if (r.isNew) drawText(ctx, 'NEW', rx + cell.w / 2, ry + 9, '#7dff9a', 'center');
        }
        if (phase === 'tray') {
          const gain = shown.reduce((s, r) => s + r.refund, 0);
          drawText(
            ctx,
            gain > 0
              ? `Click to continue  (+${gain} Emeralds from duplicates)`
              : 'Click to continue',
            cx,
            y0 + rows * (cell.h + 2) + 8,
            '#ffd84a',
            'center',
          );
        }
      }

      // Buttons.
      buttons.begin();
      const by = height - 22;
      const bw = Math.min(78, Math.floor((width - 12 - 18) / 4));
      const gap = 6;
      const x0 = Math.floor((width - (4 * bw + 3 * gap)) / 2);
      const canOne = data.currencies.spawnEggs >= 1;
      const canTen = data.currencies.rareSpawnEggs >= 1;
      buttons.add({ x: x0, y: by, w: bw, h: 16 }, 'Pull x1', () => startPull(1), busy(), {
        key: 'pull1',
        icon: 'egg',
        variant: canOne ? 'primary' : 'normal',
        tooltip: 'Spend 1 Spawn Egg for one companion.',
      });
      buttons.add(
        { x: x0 + bw + gap, y: by, w: bw, h: 16 },
        'Pull x10',
        () => startPull(10),
        busy(),
        {
          key: 'pull10',
          icon: 'egg_rare',
          variant: canTen ? 'gold' : 'normal',
          tooltip: 'Spend 1 Rare Spawn Egg for ten pulls, at least one Rare.',
        },
      );
      buttons.add(
        { x: x0 + 2 * (bw + gap), y: by, w: bw, h: 16 },
        showRates ? 'Hide rates' : 'Rates',
        () => {
          showRates = !showRates;
        },
        false,
        { key: 'rates', icon: 'info' },
      );
      buttons.add({ x: x0 + 3 * (bw + gap), y: by, w: bw, h: 16 }, 'Back', onBack, false, {
        key: 'back',
      });
      buttons.draw(view);
      if (message) drawText(ctx, message, cx, by - 5, '#ff9a9a', 'center');
      else if (phase === 'idle') {
        drawText(
          ctx,
          'Click the cage or press Space to skip animations.',
          cx,
          by - 5,
          UI.faint,
          'center',
        );
      }

      ratesRect = { x: Math.floor(width / 2) - 96, y: 54, w: 192, h: 100 };
      if (showRates) {
        drawPanel(ctx, ratesRect);
        drawText(ctx, 'Drop rates', width / 2, ratesRect.y + 12, '#ffd84a', 'center');
        let y = ratesRect.y + 24;
        for (const r of [...RARITY_ORDER].reverse() as CompanionRarity[]) {
          ctx.fillStyle = cb(RARITY_COLOR[r]);
          ctx.fillRect(ratesRect.x + 8, y - 6, 5, 6);
          drawText(ctx, RARITY_LABEL[r], ratesRect.x + 18, y, cb(RARITY_COLOR[r]));
          drawText(ctx, `${OVERWORLD_BANNER.rates[r]}%`, ratesRect.x + 100, y, '#fff');
          drawText(
            ctx,
            `dupe +${DUPE_EMERALDS[r]}`,
            ratesRect.x + ratesRect.w - 10,
            y,
            '#9a9aa8',
            'right',
          );
          y += 11;
        }
        drawText(
          ctx,
          'x10: at least one Rare. Pity: Legendary at 60.',
          width / 2,
          ratesRect.y + ratesRect.h - 8,
          '#9a9aa8',
          'center',
        );
      }
      const tip = pills.find((p) => inRect(p.r, mx, my));
      if (tip && !buttons.over(mx, my))
        drawTooltip(ctx, tooltipLines(tip.tip), mx, my, width, height);
    },
    onMove(x, y) {
      mx = x;
      my = y;
      buttons.move(x, y);
    },
    onClick(x, y) {
      if (buttons.click(x, y) || buttons.over(x, y)) return;
      if (showRates && inRect(ratesRect, x, y)) return;
      skip();
    },
    onKey(code) {
      if (code === 'Escape' && !busy()) onBack();
      else if (code === 'Space' || code === 'Enter') skip();
    },
  };
}
