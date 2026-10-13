/**
 * A deterministic scripted hero for the Ender Dragon fight (tests and the balance numbers in
 * docs/DECISIONS.md): fixed seeds, fixed builds, a small steering script (dodge telegraphs, pools and the rim,
 * clear the crystals, then work on the dragon) and a fixed 60 Hz step. The sim bots never reach the End.
 */
import type { InputSource } from '../../src/core/input';
import type { PassiveId } from '../../src/data/upgrades';
import { RunState } from '../../src/game';
import { debugEnterEnd, END_ISLAND_PX } from '../../src/systems/endDimension';
import { newWeapon } from '../../src/weapons';
import type { WeaponId } from '../../src/weapons/types';
import { segDist2 } from '../../src/core/geom';

export class ScriptInput implements InputSource {
  x = 0;
  y = 0;
  moveVector(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }
  pausePressed(): boolean {
    return false;
  }
  confirmPressed(): boolean {
    return false;
  }
  cancelPressed(): boolean {
    return false;
  }
  activePressed(): boolean {
    return false;
  }
  endStep(): void {}
}

export interface Build {
  weapons: { id: WeaponId; level: number; evolved?: boolean }[];
  passives: [PassiveId, number][];
  armorTier: number;
  swordTier: number;
  baseMaxHp: number;
  /** Game time (s) the run starts at: sets the dragon's HP/damage scale like the real run. */
  time: number;
}

export const STRONG: Build = {
  weapons: [
    { id: 'sword', level: 5, evolved: true },
    { id: 'bow', level: 5, evolved: true },
    { id: 'tnt', level: 5 },
    { id: 'blaze_rods', level: 5 },
  ],
  passives: [
    ['sharpness', 5],
    ['power', 5],
    ['quick_charge', 4],
    ['protection', 4],
  ],
  armorTier: 5,
  swordTier: 5,
  baseMaxHp: 220,
  time: 960,
};

export const MID: Build = {
  weapons: [
    { id: 'sword', level: 3 },
    { id: 'bow', level: 3 },
    { id: 'tnt', level: 2 },
  ],
  passives: [
    ['sharpness', 3],
    ['power', 3],
    ['protection', 2],
  ],
  armorTier: 3,
  swordTier: 3,
  baseMaxHp: 150,
  time: 960,
};

export function buildRun(build: Build, seed = 21): RunState {
  const run = new RunState(seed, build.time);
  run.weapons = build.weapons.map((w) => {
    const s = newWeapon(w.id);
    s.level = w.level;
    s.evolved = w.evolved ?? false;
    return s;
  });
  for (const [id, level] of build.passives) run.passives.set(id, level);
  run.armorTier = build.armorTier;
  run.swordTier = build.swordTier;
  run.baseMaxHp = build.baseMaxHp;
  run.recomputeStats();
  run.player.hp = run.player.maxHp;
  return run;
}

/** Steering: avoid ground warnings, pools and the rim; clear crystals; then hit the dragon. */
export function steer(run: RunState, input: ScriptInput): void {
  const p = run.player;
  const end = run.end;
  const dragon = end.dragon;
  let fx = 0;
  let fy = 0;
  let danger = false;
  for (const t of run.telegraphs) {
    if (t.kind === 'line') {
      const half = (t.w ?? 9) / 2 + 22;
      const d2 = segDist2(t.x, t.y, t.x2, t.y2, p.x, p.y);
      if (d2 < half * half) {
        const ux = t.x2 - t.x;
        const uy = t.y2 - t.y;
        const l = Math.hypot(ux, uy) || 1;
        // Step sideways, away from the lane.
        const side = (p.x - t.x) * -uy + (p.y - t.y) * ux >= 0 ? 1 : -1;
        fx += (-uy / l) * side * 3;
        fy += (ux / l) * side * 3;
        danger = true;
      }
    } else if (t.kind === 'circle') {
      const dx = p.x - t.x;
      const dy = p.y - t.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < t.r + 20) {
        fx += (dx / d) * 3;
        fy += (dy / d) * 3;
        danger = true;
      }
    } else {
      const dx = p.x - t.x;
      const dy = p.y - t.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < t.r + 26) {
        fx += (dx / d) * 3;
        fy += (dy / d) * 3;
        danger = true;
      }
    }
  }
  for (const z of run.zones) {
    if (z.friendly) continue;
    const dx = p.x - z.x;
    const dy = p.y - z.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < z.r + 14) {
      // Away from the pool, with a pull toward the middle of the island (never into a pillar or the rim).
      const cr = Math.hypot(p.x, p.y) || 1;
      fx += (dx / d) * 2.5 - (p.x / cr) * 1.5;
      fy += (dy / d) * 2.5 - (p.y / cr) * 1.5;
      danger = true;
    }
  }
  const rim = Math.hypot(p.x, p.y);
  if (rim > END_ISLAND_PX - 150) {
    fx -= (p.x / rim) * 4;
    fy -= (p.y / rim) * 4;
    danger = true;
  }
  if (!danger) {
    // Offence: crystals first, then the dragon.
    const crystal = end.crystals
      .filter((c) => !c.done && !c.e.dying)
      .sort(
        (a, b) => Math.hypot(a.e.x - p.x, a.e.y - p.y) - Math.hypot(b.e.x - p.x, b.e.y - p.y),
      )[0];
    let tx = 0;
    let ty = 0;
    if (crystal) {
      tx = crystal.e.x;
      ty = crystal.e.y + 38;
    } else if (dragon && !dragon.dying) {
      const perched = end.brain.mode === 'perch' || end.brain.mode === 'stunned';
      if (perched) {
        // Stand in front of the head (melee crit side), close enough for the sword.
        tx = dragon.x + Math.cos(end.brain.face) * 38;
        ty = dragon.y + Math.sin(end.brain.face) * 38;
      } else {
        tx = dragon.x * 0.5;
        ty = dragon.y * 0.5 + 40;
      }
    }
    const dx = tx - p.x;
    const dy = ty - p.y;
    const d = Math.hypot(dx, dy);
    if (d > 6) {
      fx += dx / d;
      fy += dy / d;
    }
  }
  const l = Math.hypot(fx, fy);
  input.x = l > 0.05 ? fx / l : 0;
  input.y = l > 0.05 ? fy / l : 0;
}

/** Take the first card of any level-up offer (the fight is short; the build is fixed). */
export function clearOffers(run: RunState): void {
  if (run.offer) run.offer = null;
  run.pendingLevelups = 0;
  run.pendingItem = null;
}

export interface FightResult {
  seconds: number;
  dragonDead: boolean;
  heroDead: boolean;
  phaseAt: Record<number, number>;
  minHpFrac: number;
  voidFalls: number;
}

/** Fight until the dragon dies, the hero dies or `cap` seconds pass. */
export function fight(
  run: RunState,
  cap = 600,
  onStep?: (run: RunState, t: number) => void,
): FightResult {
  const input = new ScriptInput();
  const phaseAt: Record<number, number> = { 1: 0 };
  let minHp = 1;
  let t = 0;
  const dt = 1 / 60;
  let n = 0;
  while (t < cap && run.status !== 'dead') {
    if (n % 2 === 0) steer(run, input);
    run.update(dt, input);
    clearOffers(run);
    n++;
    t += dt;
    onStep?.(run, t);
    const b = run.end.brain;
    if (phaseAt[b.phase] === undefined) phaseAt[b.phase] = t;
    minHp = Math.min(minHp, run.player.hp / run.player.maxHp);
    if (run.end.deathT >= 0) break;
  }
  return {
    seconds: t,
    dragonDead: run.end.deathT >= 0,
    heroDead: run.status === 'dead',
    phaseAt,
    minHpFrac: minHp,
    voidFalls: run.end.voidFalls,
  };
}

export function endRun(build: Build, seed = 21, pct = 100): RunState {
  const run = buildRun(build, seed);
  debugEnterEnd(run, pct);
  return run;
}
