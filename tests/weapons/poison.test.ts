import { describe, expect, it } from 'vitest';
import type { InputSource } from '../../src/core/input';
import type { Enemy } from '../../src/entities/enemy';
import { RunState, type Zone } from '../../src/game';
import { makeEnemy } from '../../src/systems/spawner';
import { newWeapon, WEAPONS, weaponLevel } from '../../src/weapons';

class Still implements InputSource {
  moveVector(): { x: number; y: number } {
    return { x: 0, y: 0 };
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

function spawnAhead(run: RunState, n: number): Enemy[] {
  const out: Enemy[] = [];
  for (let i = 0; i < n; i++) {
    const e = makeEnemy(run, 'zombie', run.player.x + 60 + i * 12, run.player.y + i * 8, false);
    if (!e) throw new Error('zombie definition missing');
    run.enemies.push(e);
    out.push(e);
  }
  return out;
}

/** Steps the simulation and records every zone seen (zones expire, so sample each step). */
function play(run: RunState, steps: number): Set<Zone> {
  const input = new Still();
  const zones = new Set<Zone>();
  for (let i = 0; i < steps; i++) {
    run.update(1 / 60, input);
    for (const z of run.zones) zones.add(z);
  }
  return zones;
}

describe('Poison Potion', () => {
  it('lands as a friendly poison cloud that damages nearby enemies', () => {
    const run = new RunState(1);
    run.weapons = [newWeapon('poison')];
    const enemies = spawnAhead(run, 3);
    const clouds = [...play(run, 240)].filter((z) => z.kind === 'poison');
    expect(clouds.length).toBeGreaterThan(0);
    expect(clouds.every((z) => z.friendly && z.slowF === 1)).toBe(true);
    expect(enemies.some((e) => e.hp < e.maxHp)).toBe(true);
  });

  it('evolved Wither Cloud is wider, longer and slows', () => {
    const base = new RunState(1);
    base.weapons = [newWeapon('poison')];
    spawnAhead(base, 2);
    const baseCloud = [...play(base, 240)].find((z) => z.kind === 'poison');

    const run = new RunState(1);
    const w = newWeapon('poison');
    w.level = 5;
    w.evolved = true;
    run.weapons = [w];
    spawnAhead(run, 2);
    const wither = [...play(run, 240)].filter((z) => z.kind === 'wither');
    expect(wither.length).toBeGreaterThan(0);
    expect(wither.every((z) => z.slowF === 0.6)).toBe(true);
    expect(baseCloud).toBeDefined();
    const biggest = Math.max(...wither.map((z) => z.r));
    expect(biggest).toBeGreaterThan(46);
  });

  it('does nothing and reports false without enemies in range', () => {
    const run = new RunState(1);
    const w = newWeapon('poison');
    expect(WEAPONS.poison.fire(run, w, weaponLevel('poison', 1))).toBe(false);
    expect(run.projectiles).toHaveLength(0);
  });
});
