import type { View } from '../core/canvas';
import { PASSIVES } from '../data/upgrades';
import { ITEMS } from '../data/items';
import { WEAPONS } from '../weapons';
import type { RunState } from '../game';
import { xpToNext } from '../systems/economy';
import { drawIcon } from './icons';
import { drawText } from './panel';

function clock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function slot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  icon: Parameters<typeof drawIcon>[1],
  level: number,
): void {
  ctx.fillStyle = '#101014';
  ctx.fillRect(x, y, 16, 16);
  ctx.fillStyle = '#3a3a44';
  ctx.fillRect(x + 1, y + 1, 14, 14);
  drawIcon(ctx, icon, x + 2, y + 2);
  drawText(ctx, String(level), x + 15, y + 15, '#ffe27a', 'right');
}

/** Canvas HUD: hearts, XP bar, timer, counters, weapon and passive slots, low-HP vignette. */
export function drawHud(view: View, run: RunState): void {
  const { ctx, width, height } = view;
  const p = run.player;

  // XP bar across the top.
  const need = xpToNext(run.level);
  ctx.fillStyle = '#101014';
  ctx.fillRect(0, 0, width, 6);
  ctx.fillStyle = '#1f3a1f';
  ctx.fillRect(1, 1, width - 2, 4);
  ctx.fillStyle = '#7ddc4a';
  ctx.fillRect(1, 1, Math.floor((width - 2) * Math.min(1, run.xp / need)), 4);
  drawText(ctx, `Lv ${run.level}`, 4, 15, '#d8ffc0');

  // Hearts: 10 hearts, each worth a tenth of max HP.
  for (let i = 0; i < 10; i++) {
    const v = p.hp - (i * p.maxHp) / 10;
    const part = v / (p.maxHp / 10);
    drawIcon(
      ctx,
      part >= 0.75 ? 'heart' : part >= 0.25 ? 'heart_half' : 'heart_empty',
      4 + i * 11,
      20,
    );
  }

  drawText(ctx, clock(run.time), width / 2, 16, '#fff', 'center');
  drawIcon(ctx, 'skull', width - 54, 8);
  drawText(ctx, String(run.kills), width - 40, 17, '#fff');
  drawIcon(ctx, 'emerald', width - 54, 22);
  drawText(ctx, String(run.emeraldsPicked), width - 40, 31, '#7dff9a');

  // Weapon slots (bottom-left) and passive slots above them.
  const y0 = height - 20;
  run.weapons.forEach((w, i) => slot(ctx, 4 + i * 18, y0, WEAPONS[w.id].icon, w.level));
  run
    .passiveList()
    .forEach((ps, i) => slot(ctx, 4 + i * 18, y0 - 18, PASSIVES[ps.id].icon, ps.level));

  if (run.item) {
    const def = ITEMS[run.item];
    const x = width - 22;
    const y = height - 22;
    slot(ctx, x, y, def.icon, 0);
    ctx.fillStyle = '#3a3a44';
    ctx.fillRect(x + 12, y + 12, 3, 3);
    if (run.itemCd > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      const h = Math.ceil(14 * Math.min(1, run.itemCd / Math.max(1, def.cooldown)));
      ctx.fillRect(x + 1, y + 15 - h, 14, h);
      drawText(ctx, String(Math.ceil(run.itemCd)), x + 8, y + 12, '#fff', 'center');
    } else if (def.active) {
      drawText(ctx, 'SPACE', x + 8, y - 3, '#ffe27a', 'center');
    }
  }

  if (p.hp / p.maxHp < 0.3 && !p.dead) {
    const pulse = 0.35 + 0.15 * Math.sin(run.time * 6);
    const g = ctx.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.35,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.62,
    );
    g.addColorStop(0, 'rgba(160,0,0,0)');
    g.addColorStop(1, `rgba(160,0,0,${pulse.toFixed(2)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  }
}
