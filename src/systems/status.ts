/** Status effects on enemies: burn, poison, wither (damage over time) and slow, freeze, stun, levitate (control). */
import type { Enemy } from '../entities/enemy';
import type { RunState } from '../game';
import { damageEnemy } from './combat';

export type StatusKind = 'burn' | 'poison' | 'wither' | 'slow' | 'freeze' | 'stun' | 'levitate';

/** `power` is damage per second for DoTs and the speed factor (0..1) for slow/levitate. */
export function applyStatus(e: Enemy, kind: StatusKind, dur: number, power = 0): void {
  if (e.dying || dur <= 0) return;
  switch (kind) {
    case 'burn':
      e.burnT = Math.max(e.burnT, dur);
      e.burnDps = Math.max(e.burnDps, power);
      break;
    case 'poison':
      e.poisonT = Math.max(e.poisonT, dur);
      e.poisonDps = Math.max(e.poisonDps, power);
      break;
    case 'wither':
      e.witherT = Math.max(e.witherT, dur);
      e.witherDps = Math.max(e.witherDps, power);
      break;
    case 'slow':
    case 'levitate':
      e.slowF = e.slowT > 0 ? Math.min(e.slowF, power) : power;
      e.slowT = Math.max(e.slowT, dur);
      break;
    case 'freeze':
      e.freezeT = Math.max(e.freezeT, dur);
      e.stunT = Math.max(e.stunT, dur);
      break;
    case 'stun':
      e.stunT = Math.max(e.stunT, dur);
      break;
  }
}

/** Advance timers and deal damage-over-time ticks (every 0.5 s). The last tick of an expiring effect still lands. */
export function tickStatus(run: RunState, e: Enemy, dt: number): void {
  // DoT strength at the start of the step, before timers can expire it.
  const dps =
    (e.burnT > 0 ? e.burnDps : 0) +
    (e.poisonT > 0 ? e.poisonDps : 0) +
    (e.witherT > 0 ? e.witherDps : 0);
  e.burnT = Math.max(0, e.burnT - dt);
  e.poisonT = Math.max(0, e.poisonT - dt);
  e.witherT = Math.max(0, e.witherT - dt);
  e.slowT = Math.max(0, e.slowT - dt);
  e.stunT = Math.max(0, e.stunT - dt);
  e.freezeT = Math.max(0, e.freezeT - dt);
  if (e.slowT <= 0) e.slowF = 1;
  if (dps > 0) {
    e.statusAcc += dt;
    while (e.statusAcc >= 0.5 - 1e-6 && !e.dying) {
      e.statusAcc -= 0.5;
      damageEnemy(run, e, dps * 0.5, e.x, e.y, 0, true);
    }
  }
  if (e.burnT <= 0) e.burnDps = 0;
  if (e.poisonT <= 0) e.poisonDps = 0;
  if (e.witherT <= 0) e.witherDps = 0;
  if (e.burnT <= 0 && e.poisonT <= 0 && e.witherT <= 0) e.statusAcc = 0;
}
