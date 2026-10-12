/** Auto-fire weapons: Sword (arc), Bow (arrows at the nearest enemy), TNT (timed mines). */
import { Enemy } from '../entities/enemy';
import { makeFx } from '../entities/fx';
import { Projectile } from '../entities/projectile';
import { type WeaponId, weaponLevel } from '../data/weapons';
import type { RunState } from '../game';
import { damageEnemy } from './combat';

export interface WeaponState {
  id: WeaponId;
  level: number;
  cd: number;
}

const near: Enemy[] = [];

function nearestEnemy(run: RunState, range: number): Enemy | null {
  const p = run.player;
  run.hash.query(p.x, p.y, range, near);
  let best: Enemy | null = null;
  let bestD = Infinity;
  for (const e of near) {
    if (e.dying) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

function swingSword(run: RunState, level: number): boolean {
  const s = weaponLevel('sword', level);
  const p = run.player;
  const target = nearestEnemy(run, s.area + 14);
  if (!target) return false;
  const angle = Math.atan2(target.y - p.y, target.x - p.x);
  p.facing = Math.cos(angle) >= 0 ? 1 : -1;
  p.swingT = 0.33;
  run.emit('swing');
  const half = level >= 5 ? 1.4 : 1.1;
  const hits: Enemy[] = [];
  run.hash.query(p.x, p.y, s.area, hits);
  for (const e of hits) {
    if (e.dying) continue;
    const a = Math.atan2(e.y - p.y, e.x - p.x);
    let diff = Math.abs(a - angle);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    if (diff <= half) damageEnemy(run, e, s.dmg * run.dmgMult, p.x, p.y, 70);
  }
  run.fx.push(
    makeFx('arc', p.x, p.y - 8, 0.22, {
      a0: angle - half,
      a1: angle + half,
      r: s.area,
      color: '#e9f4ff',
    }),
  );
  return true;
}

function shootBow(run: RunState, level: number): boolean {
  const s = weaponLevel('bow', level);
  const target = nearestEnemy(run, 230);
  if (!target) return false;
  const p = run.player;
  const base = Math.atan2(target.y - 4 - (p.y - 8), target.x - p.x);
  p.facing = Math.cos(base) >= 0 ? 1 : -1;
  run.emit('bow');
  for (let i = 0; i < s.count; i++) {
    const a = base + (i - (s.count - 1) / 2) * 0.14;
    run.projectiles.push(
      new Projectile(
        p.x,
        p.y - 8,
        Math.cos(a) * 220,
        Math.sin(a) * 220,
        2,
        s.dmg * run.dmgMult,
        s.pierce,
        true,
        1.3,
      ),
    );
  }
  return true;
}

function dropTnt(run: RunState, level: number): boolean {
  const s = weaponLevel('tnt', level);
  if (!nearestEnemy(run, 150)) return false;
  const p = run.player;
  run.emit('tnt');
  for (let i = 0; i < s.count; i++) {
    run.mines.push({
      x: p.x + (i === 0 ? 0 : run.rng.ai.range(-16, 16)),
      y: p.y + (i === 0 ? 4 : run.rng.ai.range(-8, 14)),
      fuse: 1.0,
      area: s.area,
      dmg: s.dmg * run.dmgMult,
    });
  }
  return true;
}

export function updateWeapons(run: RunState, dt: number): void {
  if (run.player.dead) return;
  for (const w of run.weapons) {
    w.cd -= dt;
    if (w.cd > 0) continue;
    const fired =
      w.id === 'sword'
        ? swingSword(run, w.level)
        : w.id === 'bow'
          ? shootBow(run, w.level)
          : dropTnt(run, w.level);
    // Without a target, poll again soon instead of burning the cooldown.
    w.cd = fired ? weaponLevel(w.id, w.level).cd * run.cdMult : 0.1;
  }
}
