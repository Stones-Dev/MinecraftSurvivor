import { abilityById, abilityCooldown } from '../abilities';
import { cb, cbAlpha, reduceFlash, textScale } from '../core/accessibility';
import type { View } from '../core/canvas';
import { PASSIVES } from '../data/upgrades';
import { ITEMS } from '../data/items';
import { WEAPONS } from '../weapons';
import type { RunState } from '../game';
import { xpToNext } from '../systems/economy';
import { getMarkers } from '../systems/npcs';
import { drawIcon } from './icons';
import { drawText, drawTextPlate } from './panel';
import { HUD_TEXT, LOW_HP_FRACTION, lowHpVignetteAlpha } from './hudModel';

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
  drawTextPlate(ctx, `Lv ${run.level}`, 4, 15, HUD_TEXT.level);

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
  // Biome mob effects the hero should notice: husk hunger (no regeneration) and frost slowness.
  const statusX = 4 + 10 * 11 + 3;
  if (p.hungerT > 0) drawTextPlate(ctx, 'Hunger', statusX, 28, HUD_TEXT.hunger);
  if (p.slowT > 0)
    drawTextPlate(ctx, 'Slow', statusX + (p.hungerT > 0 ? 40 : 0), 28, HUD_TEXT.slow);

  // Accessibility text scale 2: the timer and the counters are drawn double size (menus stay 1x).
  const big = textScale() === 2;
  if (big) {
    drawTextPlate(ctx, clock(run.time), width / 2, 23, HUD_TEXT.timer, 'center', 2);
    drawIcon(ctx, 'skull', width - 62, 10);
    drawTextPlate(ctx, String(run.kills), width - 48, 24, HUD_TEXT.kills, 'left', 2);
    drawIcon(ctx, 'emerald', width - 62, 32);
    drawTextPlate(ctx, String(run.emeraldsPicked), width - 48, 46, HUD_TEXT.emeralds, 'left', 2);
  } else {
    drawTextPlate(ctx, clock(run.time), width / 2, 16, HUD_TEXT.timer, 'center');
    drawIcon(ctx, 'skull', width - 54, 8);
    drawTextPlate(ctx, String(run.kills), width - 40, 17, HUD_TEXT.kills);
    drawIcon(ctx, 'emerald', width - 54, 22);
    drawTextPlate(ctx, String(run.emeraldsPicked), width - 40, 31, HUD_TEXT.emeralds);
  }

  // Weapon slots (bottom-left) and passive slots above them.
  const y0 = height - 20;
  run.weapons.forEach((w, i) => slot(ctx, 4 + i * 18, y0, WEAPONS[w.id].icon, w.level));
  run
    .passiveList()
    .forEach((ps, i) => slot(ctx, 4 + i * 18, y0 - 18, PASSIVES[ps.id].icon, ps.level));

  drawMarkers(view, run, camX, camY);
  if (run.rift.active) {
    const left = Math.max(0, Math.ceil(run.rift.timer));
    drawTextPlate(
      ctx,
      `Rift ${Math.floor(left / 60)}:${(left % 60).toString().padStart(2, '0')}`,
      width / 2,
      big ? 36 : 26,
      HUD_TEXT.rift,
      'center',
    );
  }
  // Boss bar and announcements under the timer.
  const boss = run.enemies.find((e) => e.boss === 'boss' && !e.dying);
  let by = (run.rift.active ? 32 : 24) + (big ? 10 : 0);
  if (boss) {
    const w = 160;
    const x = Math.floor((width - w) / 2);
    ctx.fillStyle = '#101014';
    ctx.fillRect(x - 1, by, w + 2, 7);
    ctx.fillStyle = cb('#5a1a1a');
    ctx.fillRect(x, by + 1, w, 5);
    ctx.fillStyle = cb('#e04040');
    ctx.fillRect(x, by + 1, Math.max(0, Math.floor((w * boss.hp) / boss.maxHp)), 5);
    drawTextPlate(ctx, boss.def.name, width / 2, by + 16, cb(HUD_TEXT.boss), 'center');
    by += 20;
  }
  for (const b of run.banners) {
    ctx.globalAlpha = Math.min(1, (b.dur - b.t) * 2, b.t * 4 + 0.2);
    drawTextPlate(ctx, b.text, width / 2, by + 8, b.color, 'center');
    ctx.globalAlpha = 1;
    by += 11;
  }
  if (run.director.goldenUntil > run.time) {
    const sy = big ? 52 : 36;
    drawIcon(ctx, 'star', width - (big ? 62 : 54), sy);
    drawTextPlate(
      ctx,
      `${Math.ceil(run.director.goldenUntil - run.time)}s`,
      width - (big ? 48 : 40),
      sy + 9,
      HUD_TEXT.golden,
    );
  }

  const ab = abilityById(run.abilityId);
  if (ab) {
    const x = width - 42;
    const y = height - 22;
    slot(ctx, x, y, ab.icon, 0);
    const total = abilityCooldown(run, ab);
    if (run.ability.cd > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      const h = Math.ceil(14 * Math.min(1, run.ability.cd / total));
      ctx.fillRect(x + 1, y + 15 - h, 14, h);
      drawText(ctx, String(Math.ceil(run.ability.cd)), x + 8, y + 12, '#fff', 'center');
    } else {
      drawTextPlate(ctx, 'Q', x + 8, y - 3, HUD_TEXT.abilityKey, 'center');
    }
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
      drawTextPlate(ctx, 'SPACE', x + 8, y - 3, HUD_TEXT.itemKey, 'center');
    }
  }

  // Low HP: a red edge vignette that stays still with "reduce flashing" and otherwise swells slowly and softly.
  if (p.hp / p.maxHp < LOW_HP_FRACTION && !p.dead) {
    const pulse = lowHpVignetteAlpha(run.time, reduceFlash());
    const g = ctx.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.35,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.62,
    );
    g.addColorStop(0, cbAlpha('#a00000', 0));
    g.addColorStop(1, cbAlpha('#a00000', Number(pulse.toFixed(2))));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  }
}
