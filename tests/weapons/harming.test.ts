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

describe('Splash Harming', () => {
  it('lobs potions that splash-damage the enemies around the target', () => {
    const run = new RunState(1);
    run.weapons = [newWeapon('harming')];
    const enemies = spawnAhead(run, 3);
    const zones = play(run, 240);
    expect(enemies.some((e) => e.hp < e.maxHp)).toBe(true);
    expect([...zones].some((z) => z.kind === 'harm')).toBe(false);
  });

  it('leaves a friendly harm pool when evolved (Lingering Harming)', () => {
    const run = new RunState(1);
    const w = newWeapon('harming');
    w.level = 5;
    w.evolved = true;
    run.weapons = [w];
    const enemies = spawnAhead(run, 3);
    const pools = [...play(run, 240)].filter((z) => z.kind === 'harm');
    expect(pools.length).toBeGreaterThan(0);
    expect(pools.every((z) => z.friendly)).toBe(true);
    expect(enemies.some((e) => e.hp < e.maxHp)).toBe(true);
  });

  it('does nothing and reports false without enemies in range', () => {
    const run = new RunState(1);
    const w = newWeapon('harming');
    expect(WEAPONS.harming.fire(run, w, weaponLevel('harming', 1))).toBe(false);
    expect(run.projectiles).toHaveLength(0);
  });
});
