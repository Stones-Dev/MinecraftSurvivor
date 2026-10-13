import { describe, expect, it } from 'vitest';
import { aimPointY } from '../src/core/geom';
import type { InputSource } from '../src/core/input';
import { RunState } from '../src/game';
import { makeEnemy } from '../src/systems/spawner';
import { newWeapon } from '../src/weapons';

class StillInput implements InputSource {
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

describe('BUG-16: ranged weapons aim at the centre of mass', () => {
  for (const id of ['bow', 'crossbow', 'snowball', 'trident'] as const) {
    it(`${id}: the first shot is aimed at the capsule middle, not the ankles`, () => {
      const run = new RunState(21);
      run.weapons = [newWeapon(id)];
      const target = makeEnemy(run, 'warden', run.player.x + 100, run.player.y, false);
      if (!target) throw new Error('no target');
      target.hp = target.maxHp = 1e6;
      run.enemies.push(target);
      const p = run.player;
      // Step until the weapon fires.
      for (let i = 0; i < 120 && run.projectiles.length === 0; i++)
        run.update(1 / 60, new StillInput());
      const shot = run.projectiles.find((pr) => pr.friendly);
      expect(shot).toBeDefined();
      if (!shot) return;
      // Direction from the muzzle to the aim point (the fan of a multi-shot weapon is symmetric around it).
      const want = Math.atan2(aimPointY(target) - (p.y - 8), target.x - p.x);
      const angles = run.projectiles
        .filter((pr) => pr.friendly)
        .map((pr) => Math.atan2(pr.vy, pr.vx));
      const mean = angles.reduce((a, b) => a + b, 0) / angles.length;
      expect(mean).toBeCloseTo(want, 1);
      // A Warden's middle is far above its feet: the shot climbs.
      expect(want).toBeLessThan(-0.15);
    });
  }

  it('a bow arrow reaches a Warden at range', () => {
    const run = new RunState(22);
    run.weapons = [newWeapon('bow')];
    const target = makeEnemy(run, 'warden', run.player.x + 120, run.player.y, false);
    if (!target) throw new Error('no target');
    target.speed = 0;
    run.enemies.push(target);
    for (let i = 0; i < 240; i++) run.update(1 / 60, new StillInput());
    expect(target.hp).toBeLessThan(target.maxHp);
  });
});
