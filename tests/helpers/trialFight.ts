/**
 * A deterministic scripted hero for the Trial Chamber wave (tests/structures2.test.ts and the numbers in
 * docs/DECISIONS.md): fixed seeds and builds, a fixed 60 Hz step, only the wave in the sealed hall (natural
 * spawns are removed every step so the number is the wave's alone).
 */
import type { InputSource } from '../../src/core/input';
import { RunState } from '../../src/game';
import { isStructureEnemy } from '../../src/systems/structureEnemies';
import { trialState } from '../../src/systems/trialChamber';
import { newWeapon } from '../../src/weapons';
import type { PassiveId } from '../../src/data/upgrades';
import { TILE_PX } from '../../src/world/terrain';

class Pad implements InputSource {
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

export interface HeroBuild {
  /** The hero's level (cosmetic: the build below carries the strength) and the sword's level. */
  level: number;
  swordLevel: number;
  passives: [PassiveId, number][];
}

/** Starter hero, and a level-3 hero (two level-ups: a better sword and a passive). */
export const L1: HeroBuild = { level: 1, swordLevel: 1, passives: [] };
export const L3: HeroBuild = { level: 3, swordLevel: 2, passives: [['sharpness', 1]] };

export interface FightResult {
  won: boolean;
  dead: boolean;
  seconds: number;
  hpLeftFrac: number;
  damageTaken: number;
  kills: number;
  /** Wave members still standing at the end (id and tile inside the chamber), for diagnosing a stalemate. */
  left: string[];
  /** With `contain`: the hero was found outside the hall during the fight (the trial would be stranded). */
  escaped: boolean;
}

/**
 * Run the trial of the nearest chamber of `seed`. `dodge`: the bot steps out of telegraph circles and lines (a
 * competent player); otherwise it only chases the nearest enemy (a lower bound).
 */
export function fightTrial(
  seed: number,
  build: HeroBuild,
  time: number,
  opts: { dodge: boolean; maxSeconds?: number; contain?: boolean } = { dodge: false },
): FightResult {
  const run = new RunState(seed, time);
  const t = run.world.structures?.nearest('trial_chamber', 0, 0, 40000);
  if (!t) throw new Error(`no trial chamber near the origin of seed ${seed}`);
  run.level = build.level;
  run.weapons = [newWeapon('sword')];
  const sword = run.weapons[0];
  if (sword) sword.level = build.swordLevel;
  for (const [id, lv] of build.passives) run.passives.set(id, lv);
  run.recomputeStats();
  run.player.hp = run.player.maxHp;
  // Walk in through the north door and stop two tiles inside: that starts the trial.
  run.player.x = (t.tx + 8.5) * TILE_PX;
  run.player.y = (t.ty + 4.5) * TILE_PX;
  run.player.snap();
  const pad = new Pad();
  const dt = 1 / 60;
  const hp0 = run.player.maxHp;
  const max = (opts.maxSeconds ?? 120) / dt;
  let steps = 0;
  // Stuck handling: a hero that stops making progress toward the enemy slides along the obstacle for a moment.
  let lastBest = Infinity;
  let stuckT = 0;
  let slideT = 0;
  let slideDir = 1;
  let escaped = false;
  for (; steps < max; steps++) {
    // Only the wave exists.
    run.enemies = run.enemies.filter((e) => isStructureEnemy(e));
    const p = run.player;
    let tx = 0;
    let ty = 0;
    let best = Infinity;
    for (const e of run.enemies) {
      if (e.dying) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < best) {
        best = d;
        tx = e.x - p.x;
        ty = e.y - p.y;
      }
    }
    const len = Math.hypot(tx, ty);
    if (best < lastBest - 0.2 || best < 20) stuckT = 0;
    else stuckT += dt;
    lastBest = best;
    if (stuckT > 0.5 && slideT <= 0) {
      slideT = 0.8;
      slideDir = -slideDir;
      stuckT = 0;
    }
    if (len > 0 && slideT > 0) {
      slideT -= dt;
      pad.x = (-ty / len) * slideDir;
      pad.y = (tx / len) * slideDir;
    } else if (len > 0) {
      // Close in until the sword reaches, then keep stepping in (kiters back away).
      pad.x = len > 18 ? tx / len : 0;
      pad.y = len > 18 ? ty / len : 0;
    } else {
      pad.x = 0;
      pad.y = 0;
    }
    if (opts.dodge) {
      for (const g of run.telegraphs) {
        if (g.kind === 'circle') {
          const dx = p.x - g.x;
          const dy = p.y - g.y;
          const d = Math.hypot(dx, dy);
          if (d < g.r + 10) {
            pad.x = dx / (d || 1);
            pad.y = dy / (d || 1);
          }
        } else if (g.kind === 'line') {
          const lx = g.x2 - g.x;
          const ly = g.y2 - g.y;
          const l2 = lx * lx + ly * ly || 1;
          const u = Math.max(0, Math.min(1, ((p.x - g.x) * lx + (p.y - 6 - g.y) * ly) / l2));
          const cx = g.x + lx * u;
          const cy = g.y + ly * u;
          const d = Math.hypot(p.x - cx, p.y - 6 - cy);
          if (d < 12) {
            // Step across the line (perpendicular to it).
            const nx = -ly / Math.sqrt(l2);
            const ny = lx / Math.sqrt(l2);
            const side = (p.x - cx) * nx + (p.y - 6 - cy) * ny >= 0 ? 1 : -1;
            pad.x = nx * side;
            pad.y = ny * side;
          }
        }
      }
    }
    run.update(dt, pad);
    pad.endStep();
    const ts = trialState(run, t.key);
    if (opts.contain && ts?.state.phase === 'fight') {
      const q = run.player;
      if (
        q.x < (t.tx + 2) * TILE_PX ||
        q.x >= (t.tx + 16) * TILE_PX ||
        q.y < (t.ty + 2) * TILE_PX ||
        q.y >= (t.ty + 16) * TILE_PX
      )
        escaped = true;
    }
    if (run.player.dead || ts?.state.phase === 'key' || ts?.state.phase === 'done') break;
  }
  const ts = trialState(run, t.key);
  return {
    won: ts?.state.phase === 'key' || ts?.state.phase === 'done',
    dead: run.player.dead,
    seconds: steps * dt,
    hpLeftFrac: Math.max(0, run.player.hp) / hp0,
    damageTaken: run.stats.damageTaken,
    kills: run.kills,
    escaped,
    left: run.enemies
      .filter((e) => !e.dying)
      .map(
        (e) =>
          `${e.def.id}@${((e.x - t.tx * TILE_PX) / TILE_PX).toFixed(1)},${((e.y - t.ty * TILE_PX) / TILE_PX).toFixed(1)}`,
      ),
  };
}
