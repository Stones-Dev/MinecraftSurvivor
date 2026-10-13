/**
 * The Spawner (gacha) screen: a pixel-art mob spawner cage, x1 / x10 pulls, pity counter and rates.
 * Layout comes from `spawnerLayout` (compact below 150 px of height); keyboard and gamepad: arrows / d-pad
 * move the focus ring over the buttons, Enter / A presses one (or skips an animation), Esc / B goes back.
 */
import type { App } from '../app';
import type { View } from '../core/canvas';
import {
  COMPANION_BY_ID,
  COMPANIONS,
  DUPE_EMERALDS,
  RARITY_LABEL,
  RARITY_ORDER,
  type CompanionRarity,
} from '../data/companions';
import {
  EGG_PRICE,
  OVERWORLD_BANNER,
  type PullResult,
  buyEggs,
  spendAndPull,
} from '../systems/gacha';
import { equipToasts, keyToNav, type NavEvent } from './hubModel';
import type { IconName } from './icons';
import {
  UI,
  drawPanel,
  drawText,
  drawTooltip,
  fitText,
  inRect,
  textWidth,
  tooltipLines,
  wrap,
  type Rect,
} from './panel';
import type { Screen } from './router';
import { spawnerLayout } from './spawnerLayout';
import { pushToast } from './toast';
import {
  Buttons,
  PadNav,
  drawCompanion,
  drawPill,
  drawRarity,
  drawTitle,
  rarityColor,
} from './widgets';

type Phase = 'idle' | 'spin' | 'reveal' | 'tray';

const SPIN_ONE = 1.7;
const SPIN_TEN = 0.42;

/** Cheap deterministic jitter in [0, 1) for lightning and flames. */
function jitter(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

interface CageBox {
  cx: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Tallest flame (px above the interior). */
  flame: number;
}

function drawCage(
  ctx: CanvasRenderingContext2D,
  c: CageBox,
  t: number,
  color: string,
  heat: number,
): void {
  const bottom = c.y + c.h;
  // Stone base.
  ctx.fillStyle = '#101014';
  ctx.fillRect(c.x - 6, bottom, c.w + 12, 8);
  ctx.fillStyle = '#4a4a54';
  ctx.fillRect(c.x - 5, bottom, c.w + 10, 6);
  ctx.fillStyle = '#62626e';
  ctx.fillRect(c.x - 5, bottom, c.w + 10, 1);
  // Dark interior.
  ctx.fillStyle = '#0c0c12';
  ctx.fillRect(c.x, c.y, c.w, c.h);
  // Glow behind the bars, stronger with heat.
  ctx.globalAlpha = 0.12 + 0.3 * heat;
  ctx.fillStyle = color;
  ctx.fillRect(c.x, c.y, c.w, c.h);
  ctx.globalAlpha = 1;
  // Flames along the top edge (never taller than `flame`, so they stay under the header).
  const n = 9;
  const step = (c.w - 4) / (n - 1);
  for (let i = 0; i < n; i++) {
    const fx = c.x + i * step;
    const h = Math.round(
      2 + (c.flame - 2) * heat * (0.35 + 0.65 * jitter(i * 3.1 + Math.floor(t * 14))),
    );
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(fx), c.y - h, 4, h);
    ctx.fillStyle = '#fff6c8';
    ctx.fillRect(Math.round(fx + 1), c.y - Math.round(h * 0.5), 2, Math.round(h * 0.5));
  }
}

/** Two jagged bolts either side of the cage, from `y0` down to `y1` (legendary pulls). */
function drawLightning(
  ctx: CanvasRenderingContext2D,
  cx: number,
  half: number,
  y0: number,
  y1: number,
  t: number,
): void {
  ctx.fillStyle = '#fff3a8';
  const seg = 7;
  const count = Math.max(2, Math.ceil((y1 - y0) / seg));
  for (let b = 0; b < 2; b++) {
    let x = cx + (b === 0 ? -half : half);
    let y = y0;
    const seed = Math.floor(t * 18) + b * 7;
    for (let s = 0; s < count; s++) {
      const nx = x + (jitter(seed + s) - 0.5) * 10 + (b === 0 ? 1.5 : -1.5);
      ctx.fillRect(
        Math.round(Math.min(x, nx)),
        Math.round(y),
        Math.max(2, Math.round(Math.abs(nx - x))),
        Math.min(seg, Math.round(y1 - y)),
      );
      x = nx;
      y += seg;
    }
  }
}

function drawBars(ctx: CanvasRenderingContext2D, c: CageBox): void {
  ctx.fillStyle = '#2a2a32';
  for (let i = 0; i < 6; i++) ctx.fillRect(Math.round(c.x + (i * (c.w - 2)) / 5), c.y, 2, c.h);
  // Frame.
  ctx.fillStyle = '#7b7b88';
  ctx.fillRect(c.x - 2, c.y - 2, c.w + 4, 3);
  ctx.fillRect(c.x - 2, c.y + c.h - 3, c.w + 4, 3);
  ctx.fillRect(c.x - 2, c.y - 2, 3, c.h + 2);
  ctx.fillRect(c.x + c.w - 1, c.y - 2, 3, c.h + 2);
  ctx.fillStyle = '#a6a6b4';
  ctx.fillRect(c.x - 2, c.y - 2, c.w + 4, 1);
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

/** Embers drifting up from the bottom of `area` in the glow colour. */
function drawEmbers(
  ctx: CanvasRenderingContext2D,
  area: Rect,
  t: number,
  color: string,
  heat: number,
): void {
  ctx.fillStyle = color;
  const n = 6 + Math.floor(heat * 10);
  const rise = area.h + 14;
  for (let i = 0; i < n; i++) {
    const life = (t * (12 + jitter(i) * 10) + i * 17) % rise;
    const x = area.x + jitter(i * 3.7) * area.w + Math.sin(t * 2 + i) * 3;
    const y = area.y + area.h - 4 - life;
    ctx.globalAlpha = Math.max(0, 1 - life / rise) * 0.8;
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }
  ctx.globalAlpha = 1;
}

/**
 * The Legendary pity meter: a dark trough with the label on top and the progress as a strip along the
 * bottom, so the text never sits on the bright fill (it was unreadable on yellow).
 */
function drawPityBar(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  frac: number,
  color: string,
  pity: number,
  max: number,
): void {
  ctx.fillStyle = '#06060a';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = '#16161e';
  ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  const label = [`Legendary pity ${pity}/${max}`, `Pity ${pity}/${max}`, `${pity}/${max}`].find(
    (s) => textWidth(s) <= r.w - 6,
  );
  drawText(ctx, label ?? `${pity}/${max}`, r.x + Math.floor(r.w / 2), r.y + 9, '#fff', 'center');
  const fw = Math.round((r.w - 4) * Math.max(0, Math.min(1, frac)));
  ctx.fillStyle = '#2c2c38';
  ctx.fillRect(r.x + 2, r.y + r.h - 5, r.w - 4, 3);
  if (fw > 0) {
    ctx.fillStyle = color;
    ctx.fillRect(r.x + 2, r.y + r.h - 5, fw, 3);
  }
}

export function spawnerScreen(app: App, onBack: () => void): Screen {
  const { atlas } = app;
  const buttons = new Buttons();
  const pad = new PadNav();
  let phase: Phase = 'idle';
  let t = 0;
  let spinT = 0;
  let queue: PullResult[] = [];
  let shown: PullResult[] = [];
  let cur: PullResult | null = null;
  let tenMode = false;
  let showRates = false;
  let message = '';
  let messageOk = false;
  /** Auto-equip toasts of the current pull batch; they wait for the reveal so they do not spoil the spin. */
  let pendingToasts: ReturnType<typeof equipToasts> = [];
  let ratesRect = { x: 0, y: 0, w: 0, h: 0 };
  let pills: { r: Rect; tip: string }[] = [];
  let mx = -1;
  let my = -1;

  const save = () => app.data();

  const flushToasts = (): void => {
    for (const t of pendingToasts) {
      pushToast({ text: t.text, icon: 'egg', color: rarityColor(t.rarity) });
    }
    pendingToasts = [];
  };

  const buyEgg = (): void => {
    if (phase === 'spin' || phase === 'reveal') return;
    const data = save();
    if (buyEggs(data, 1) < 1) {
      message = `You need ${EGG_PRICE} Emeralds.`;
      messageOk = false;
      return;
    }
    app.store.save(data);
    app.audio.play('emerald');
    message = '+1 Spawn Egg';
    messageOk = true;
  };

  const startPull = (count: 1 | 10): void => {
    if (phase === 'spin' || phase === 'reveal') return;
    const data = save();
    const results = spendAndPull(data, OVERWORLD_BANNER, count);
    if (!results) {
      message = count === 1 ? 'You need a Spawn Egg.' : 'You need a Rare Spawn Egg.';
      messageOk = false;
      return;
    }
    message = '';
    pendingToasts = equipToasts(results);
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
      flushToasts();
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
      flushToasts();
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
        flushToasts();
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

  /** How far the whole animation is (0..1): the x10 reveal climbs across all ten spins, not once per spin. */
  const spinProgress = (): number => {
    const own = 1 - spinT / (tenMode ? SPIN_TEN : SPIN_ONE);
    if (!tenMode) return own;
    const total = shown.length + 1 + queue.length;
    return (shown.length + own) / total;
  };

  const busy = (): boolean => phase === 'spin' || phase === 'reveal';

  /** One navigation event from the keyboard or a pad. */
  const navigate = (ev: NavEvent): void => {
    if (ev === 'back') {
      if (showRates) showRates = false;
      else if (phase !== 'idle') skip();
      else onBack();
      return;
    }
    if (ev === 'ok') {
      if (phase !== 'idle') skip();
      else if (!buttons.keyboardActive) buttons.focusOn('pull1');
      else if (buttons.activate()) app.audio.play('click');
      return;
    }
    if (ev === 'prev') buttons.nav('left');
    else if (ev === 'next') buttons.nav('right');
    else buttons.nav(ev);
  };

  return {
    update(dt) {
      t += dt;
      for (const ev of pad.poll(dt)) navigate(ev);
      if (phase === 'spin') {
        if (Math.floor(t * 14) !== Math.floor((t - dt) * 14)) app.audio.playSpin(spinProgress());
        spinT -= dt;
        if (spinT <= 0) finishSpin();
      }
    },
    render(view: View) {
      const { ctx, width, height } = view;
      const data = save();
      const L = spawnerLayout(width, height);
      drawTitle(view, 'THE SPAWNER');
      const cx = Math.floor(width / 2);
      const cage = L.cage;
      // Resources (left) and the Legendary pity bar (right) under the header.
      pills = [];
      let px = 6;
      const addPill = (icon: IconName, text: string, color: string, tip: string): void => {
        const r = drawPill(ctx, px, L.rowY + 1, icon, text, color);
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
      const pw = Math.max(48, Math.min(120, width - px - 6 - 4));
      const pityBar = { x: width - 6 - pw, y: L.rowY, w: pw, h: L.rowH };
      drawPityBar(
        ctx,
        pityBar,
        pity / OVERWORLD_BANNER.pity,
        rarityColor('legendary'),
        pity,
        OVERWORLD_BANNER.pity,
      );
      pills.push({
        r: pityBar,
        tip: `A Legendary is guaranteed after ${OVERWORLD_BANNER.pity} pulls without one.`,
      });

      // Cage and the thing inside it (the single-pull reveal replaces the cage with the portrait card).
      let color = '#ff9a3a';
      let heat = 0.15;
      let lightning = false;
      if (phase === 'spin' && cur) {
        const total = tenMode ? SPIN_TEN : SPIN_ONE;
        const prog = 1 - spinT / total;
        color = rarityColor(cur.rarity);
        heat = 0.2 + 0.8 * prog;
        lightning = cur.rarity === 'legendary' && prog > 0.4;
      } else if (phase === 'reveal' && cur) {
        color = rarityColor(cur.rarity);
        heat = Math.max(0.2, 1 - t * 0.6);
        lightning = cur.rarity === 'legendary' && t < 1.4;
      }
      // The tray and the reveal card cover the middle of the screen: no cage or torches behind them.
      const trayUp = tenMode && (phase === 'spin' || phase === 'tray' || shown.length > 0);
      const cageUp = phase !== 'reveal' && !trayUp;
      if (cageUp) {
        const torchDx = Math.floor(cage.w / 2) + 28;
        drawTorch(ctx, cx - torchDx, L.torchY, t);
        drawTorch(ctx, cx + torchDx, L.torchY, t);
      }
      if (cageUp) {
        drawCage(ctx, cage, t, color, heat);
        drawEmbers(ctx, cage, t, color, heat);
        if (lightning) {
          drawLightning(ctx, cx, Math.floor(cage.w / 2) + 12, cage.y - 16, cage.y + cage.h, t);
        }
      }
      if (phase === 'spin' && cageUp) {
        // A whirl of silhouettes: companions cycle faster the closer the spin is to its end.
        const total = tenMode ? SPIN_TEN : SPIN_ONE;
        const prog = 1 - spinT / total;
        const n = Math.floor(t * (6 + 24 * prog));
        const def = COMPANIONS[Math.floor(jitter(n) * COMPANIONS.length)];
        if (def) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(cage.x, cage.y, cage.w, cage.h);
          ctx.clip();
          ctx.translate(cx, cage.y + cage.h - 6);
          ctx.scale(Math.cos(t * (8 + 30 * prog)), 1);
          drawCompanion(ctx, atlas, def, 0, 0, t, 1.2 * Math.max(0.6, cage.h / 46), 0.55);
          ctx.restore();
        }
      }
      if (cageUp) drawBars(ctx, cage);

      // Reveal (x1): the companion pops up above its card.
      if (phase === 'reveal' && cur) {
        const def = COMPANION_BY_ID.get(cur.id);
        if (def) {
          const R = L.reveal;
          const pop = Math.min(1, t * 3);
          const glow = { x: R.cx - 28, y: R.feetY - R.fit, w: 56, h: R.fit };
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.07 * heat;
          ctx.fillRect(glow.x - 10, glow.y - 4, glow.w + 20, glow.h + 8);
          ctx.globalAlpha = 0.1 * heat;
          ctx.fillRect(glow.x, glow.y, glow.w, glow.h);
          ctx.globalAlpha = 1;
          drawEmbers(ctx, glow, t, color, heat);
          if (lightning) drawLightning(ctx, R.cx, 34, L.top, R.feetY, t);
          drawCompanion(ctx, atlas, def, R.cx, R.feetY + (1 - pop) * 8, t, 1 + pop * 0.8, 1, R.fit);
          const box = R.box;
          const tx = box.x + Math.floor(box.w / 2);
          const [l0, l1, l2, l3, l4] = R.lines as [number, number, number, number, number];
          drawPanel(ctx, box, false, rarityColor(cur.rarity));
          drawText(ctx, fitText(def.name, R.textW - 56), tx, box.y + l0, '#fff', 'center');
          drawRarity(ctx, def, tx, box.y + l1, 'center');
          const status = cur.isNew
            ? 'NEW!'
            : cur.shards > 0
              ? `Hero duplicate: +${cur.shards} shards, +${cur.refund} Emeralds`
              : cur.refund > 0
                ? `Max level: +${cur.refund} Emeralds`
                : `Duplicate: level ${cur.level}`;
          drawText(
            ctx,
            fitText(status, R.textW),
            tx,
            box.y + l2,
            cur.isNew ? '#7dff9a' : '#ffd84a',
            'center',
          );
          wrap(ctx, `"${def.quip}"`, R.textW)
            .slice(0, 2)
            .forEach((l, i) =>
              drawText(ctx, l, tx, box.y + (i === 0 ? l3 : l4), '#9a9aa8', 'center'),
            );
          const tag = cur.pityHit
            ? { text: 'Pity!', color: rarityColor('legendary') }
            : cur.guaranteed
              ? { text: 'Guaranteed!', color: rarityColor('rare') }
              : null;
          if (tag) drawText(ctx, tag.text, box.x + box.w - 6, box.y + l0, tag.color, 'right');
        }
      }

      // Tray (x10).
      if (trayUp) {
        const T = L.tray;
        for (let i = 0; i < 10; i++) {
          const rx = T.x + (i % T.cols) * T.cw;
          const ry = T.y + Math.floor(i / T.cols) * (T.ch + 2);
          const r = shown[i];
          const cell = { x: rx + 1, y: ry, w: T.cw - 2, h: T.ch };
          drawPanel(ctx, cell, false, r ? rarityColor(r.rarity) : null);
          if (!r) continue;
          const def = COMPANION_BY_ID.get(r.id);
          if (!def) continue;
          pills.push({ r: cell, tip: `${def.name}${r.isNew ? ' (new)' : ''}` });
          if (T.names) {
            drawCompanion(ctx, atlas, def, rx + T.cw / 2, ry + 30, t, 1, 1, 24);
            drawText(
              ctx,
              def.name.length > 8 ? def.name.slice(0, 8) : def.name,
              rx + T.cw / 2,
              ry + 40,
              '#fff',
              'center',
            );
            if (r.isNew) drawText(ctx, 'NEW', rx + T.cw / 2, ry + 9, '#7dff9a', 'center');
          } else {
            drawCompanion(ctx, atlas, def, rx + T.cw / 2, ry + T.ch - 3, t, 1, 1, T.ch - 6);
            if (r.isNew) {
              ctx.fillStyle = '#7dff9a';
              ctx.fillRect(cell.x + cell.w - 5, cell.y + 3, 3, 3);
            }
          }
        }
        if (phase === 'tray') {
          const gain = shown.reduce((s, r) => s + r.refund, 0);
          const line =
            gain > 0
              ? `Click to continue  (+${gain} Emeralds from duplicates)`
              : 'Click to continue';
          drawText(ctx, fitText(line, width - 8), cx, T.textY, '#ffd84a', 'center');
        }
      }

      // Buttons.
      buttons.begin();
      const B = L.buttons;
      const short = B.w < 62;
      const canOne = data.currencies.spawnEggs >= 1;
      const canTen = data.currencies.rareSpawnEggs >= 1;
      const slot = (i: number): Rect => ({ x: B.x0 + i * (B.w + B.gap), y: B.y, w: B.w, h: B.h });
      const canBuy = data.currencies.emeralds >= EGG_PRICE;
      buttons.add(slot(0), short ? 'x1' : 'Pull x1', () => startPull(1), busy(), {
        key: 'pull1',
        icon: 'egg',
        variant: canOne ? 'primary' : 'normal',
        tooltip: 'Spend 1 Spawn Egg for one companion.',
      });
      buttons.add(slot(1), short ? 'x10' : 'Pull x10', () => startPull(10), busy(), {
        key: 'pull10',
        icon: 'egg_rare',
        variant: canTen ? 'gold' : 'normal',
        tooltip: 'Spend 1 Rare Spawn Egg for ten pulls, at least one Rare.',
      });
      buttons.add(
        slot(2),
        showRates ? (short ? 'Hide' : 'Hide rates') : 'Rates',
        () => {
          showRates = !showRates;
        },
        false,
        { key: 'rates', icon: short ? undefined : 'info', tooltip: 'Drop rates and pity.' },
      );
      buttons.add(slot(3), 'Back', onBack, false, { key: 'back' });
      buttons.add(
        L.buy.rect,
        L.buy.inRow ? 'Buy' : `Buy egg (${EGG_PRICE})`,
        buyEgg,
        busy() || !canBuy,
        {
          key: 'buy',
          icon: 'emerald',
          tooltip: canBuy
            ? `Buy one Spawn Egg for ${EGG_PRICE} Emeralds.`
            : `A Spawn Egg costs ${EGG_PRICE} Emeralds (you have ${data.currencies.emeralds}).`,
        },
      );
      buttons.draw(view);
      if (message)
        drawText(
          ctx,
          fitText(message, width - 12),
          cx,
          L.msgY,
          messageOk ? UI.green : '#ff9a9a',
          'center',
        );
      else if (phase === 'idle' && !showRates && L.hintY !== null) {
        drawText(
          ctx,
          'Click the cage or press Space to skip animations.',
          cx,
          L.hintY,
          UI.faint,
          'center',
        );
      }

      ratesRect = L.rates;
      if (showRates) {
        const rr = ratesRect;
        drawPanel(ctx, rr);
        const pitch = L.compact ? 10 : 11;
        drawText(ctx, 'Drop rates', width / 2, rr.y + (L.compact ? 10 : 12), '#ffd84a', 'center');
        let y = rr.y + (L.compact ? 21 : 24);
        for (const r of [...RARITY_ORDER].reverse() as CompanionRarity[]) {
          ctx.fillStyle = rarityColor(r);
          ctx.fillRect(rr.x + 8, y - 6, 5, 6);
          drawText(ctx, RARITY_LABEL[r], rr.x + 18, y, rarityColor(r));
          drawText(ctx, `${OVERWORLD_BANNER.rates[r]}%`, rr.x + 100, y, '#fff');
          drawText(ctx, `dupe +${DUPE_EMERALDS[r]}`, rr.x + rr.w - 10, y, '#9a9aa8', 'right');
          y += pitch;
        }
        drawText(
          ctx,
          L.compact
            ? 'x10: 1+ Rare. Pity: Legendary at 60.'
            : 'x10: at least one Rare. Pity: Legendary at 60.',
          width / 2,
          rr.y + rr.h - (L.compact ? 4 : 8),
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
      // Only a click that pressed an ENABLED button is swallowed: while a spin runs the pull buttons are
      // disabled, and a cursor resting on one used to eat the click meant to skip the animation.
      if (buttons.click(x, y)) return;
      if (showRates && inRect(ratesRect, x, y)) return;
      skip();
    },
    onKey(code) {
      const ev = keyToNav(code);
      if (ev) navigate(ev);
    },
  };
}
