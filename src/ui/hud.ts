import type { View } from '../core/canvas';
import { PASSIVES } from '../data/upgrades';
import { ITEMS } from '../data/items';
import { WEAPONS } from '../weapons';
import type { RunState } from '../game';
import { xpToNext } from '../systems/economy';
import { getMarkers } from '../systems/npcs';
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
/** Arrows at the screen edge pointing to off-screen targets (Charged mobs, portal, flag, trader). */
function drawMarkers(view: View, run: RunState, camX: number, camY: number): void {
  const { ctx, width, height } = view;
  const cx = width / 2;
  const cy = height / 2;
  for (const m of getMarkers(run)) {
    const sx = m.x - camX;
    const sy = m.y - camY;
    if (sx > 8 && sx < width - 8 && sy > 8 && sy < height - 8) continue;
    const dx = sx - cx;
    const dy = sy - cy;
    const k = Math.min(
      (cx - 12) / Math.max(1, Math.abs(dx)),
      (cy - 16) / Math.max(1, Math.abs(dy)),
    );
    const ax = cx + dx * k;
    const ay = cy + dy * k;
    const a = Math.atan2(dy, dx);
    ctx.fillStyle = '#101014';
    ctx.beginPath();
    ctx.moveTo(ax + Math.cos(a) * 7, ay + Math.sin(a) * 7);
    ctx.lineTo(ax + Math.cos(a + 2.5) * 6, ay + Math.sin(a + 2.5) * 6);
    ctx.lineTo(ax + Math.cos(a - 2.5) * 6, ay + Math.sin(a - 2.5) * 6);
    ctx.fill();
    ctx.fillStyle = m.color;
    ctx.beginPath();
    ctx.moveTo(ax + Math.cos(a) * 5, ay + Math.sin(a) * 5);
    ctx.lineTo(ax + Math.cos(a + 2.5) * 4, ay + Math.sin(a + 2.5) * 4);
    ctx.lineTo(ax + Math.cos(a - 2.5) * 4, ay + Math.sin(a - 2.5) * 4);
    ctx.fill();
  }
}

export function drawHud(view: View, run: RunState, camX = 0, camY = 0): void {
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

  drawMarkers(view, run, camX, camY);
  if (run.rift.active) {
    const left = Math.max(0, Math.ceil(run.rift.timer));
    drawText(
      ctx,
      `Rift ${Math.floor(left / 60)}:${(left % 60).toString().padStart(2, '0')}`,
      width / 2,
      26,
      '#ff9a3a',
      'center',
    );
  }
  // Boss bar and announcements under the timer.
  const boss = run.enemies.find((e) => e.boss === 'boss' && !e.dying);
  let by = run.rift.active ? 32 : 24;
  if (boss) {
    const w = 160;
    const x = Math.floor((width - w) / 2);
    ctx.fillStyle = '#101014';
    ctx.fillRect(x - 1, by, w + 2, 7);
    ctx.fillStyle = '#5a1a1a';
    ctx.fillRect(x, by + 1, w, 5);
    ctx.fillStyle = '#e04040';
    ctx.fillRect(x, by + 1, Math.max(0, Math.floor((w * boss.hp) / boss.maxHp)), 5);
    drawText(ctx, boss.def.name, width / 2, by + 16, '#ffd0d0', 'center');
    by += 20;
  }
  for (const b of run.banners) {
    ctx.globalAlpha = Math.min(1, (b.dur - b.t) * 2, b.t * 4 + 0.2);
    drawText(ctx, b.text, width / 2, by + 8, b.color, 'center');
    ctx.globalAlpha = 1;
    by += 11;
  }
  if (run.director.goldenUntil > run.time) {
    drawIcon(ctx, 'star', width - 54, 36);
    drawText(ctx, `${Math.ceil(run.director.goldenUntil - run.time)}s`, width - 40, 45, '#ffd84a');
  }

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
