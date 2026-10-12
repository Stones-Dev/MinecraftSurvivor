import { describe, expect, it } from 'vitest';
import type { InputSource } from '../../src/core/input';
import { Projectile } from '../../src/entities/projectile';
import { RunState } from '../../src/game';
import { hurtPlayer } from '../../src/systems/combat';
import { makeEnemy } from '../../src/systems/spawner';
import { newWeapon } from '../../src/weapons';
import { shield } from '../../src/weapons/shield';
import type { WeaponState } from '../../src/weapons/types';

class IdleInput implements InputSource {
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

const FRAME = 1 / 60;

function setup(seed: number, w: WeaponState): RunState {
  const run = new RunState(seed);
  run.spawnMult = 0;
  run.weapons = [w];
  return run;
}

function stepSeconds(run: RunState, seconds: number): void {
  const input = new IdleInput();
  const steps = Math.round(seconds / FRAME);
  for (let i = 0; i < steps; i++) run.update(FRAME, input);
}

describe('shield', () => {
  it('has five levels that each upgrade the previous one', () => {
    expect(shield.levels).toHaveLength(5);
    for (let i = 1; i < 5; i++) {
      const prev = shield.levels[i - 1];
      const cur = shield.levels[i];
      if (!prev || !cur) throw new Error('missing level');
      expect(cur.dmg).toBeGreaterThan(prev.dmg);
      expect(cur.cd).toBeLessThan(prev.cd);
    }
  });

  it('blocks exactly one hit, then recharges after its cooldown', () => {
    const run = setup(1, newWeapon('shield'));
    stepSeconds(run, FRAME);
    expect(run.shield.has).toBe(true);
    expect(run.shield.ready).toBe(true);
    expect(run.shield.cd).toBe(8);

    const hpBefore = run.player.hp;
    expect(hurtPlayer(run, 20)).toBe(0);
    expect(run.player.hp).toBe(hpBefore);
    expect(run.shield.ready).toBe(false);

    // Once the i-frames are over, the next hit goes through because the shield is recharging.
    stepSeconds(run, 1);
    const hpMid = run.player.hp;
    expect(hurtPlayer(run, 20)).toBeGreaterThan(0);
    expect(run.player.hp).toBeLessThan(hpMid);

    // 8 s after the block the shield is ready again.
    stepSeconds(run, 6);
    expect(run.shield.ready).toBe(false);
    stepSeconds(run, 1.5);
    expect(run.shield.ready).toBe(true);
    stepSeconds(run, 0.5);
    const hpBlock = run.player.hp;
    expect(hurtPlayer(run, 20)).toBe(0);
    expect(run.player.hp).toBe(hpBlock);
  });

  it('returns thorns damage to the attacker that hit the hero', () => {
    const run = setup(2, newWeapon('shield'));
    stepSeconds(run, FRAME);
    const z = makeEnemy(run, 'zombie', run.player.x + 10, run.player.y, false);
    if (!z) throw new Error('zombie definition missing');
    run.enemies.push(z);
    expect(hurtPlayer(run, 20, z)).toBe(0);
    expect(z.hp).toBe(z.maxHp - 10);
  });

  it('evolved Spiked Shield reflects projectiles, hits harder and recharges faster', () => {
    const w = newWeapon('shield');
    w.level = 5;
    w.evolved = true;
    const run = setup(3, w);
    stepSeconds(run, FRAME);
    expect(run.shield.reflect).toBe(true);
    expect(run.shield.cd).toBeCloseTo(3.2, 6);
    expect(run.shield.thorns).toBeCloseTo(45, 6);

    const z = makeEnemy(run, 'zombie', run.player.x + 10, run.player.y, false);
    if (!z) throw new Error('zombie definition missing');
    // Tough dummy so the 45 thorns do not overkill it (a dead enemy's HP is clamped to 0).
    z.maxHp = 200;
    z.hp = 200;
    run.enemies.push(z);
    hurtPlayer(run, 20, z);
    expect(z.hp).toBe(200 - 45);

    // Remove the attacker so its contact hits cannot disturb the recharge check.
    run.enemies = [];
    stepSeconds(run, 3.5);
    expect(run.shield.ready).toBe(true);
  });

  it('evolved Spiked Shield turns a hostile projectile around', () => {
    const w = newWeapon('shield');
    w.level = 5;
    w.evolved = true;
    const run = setup(4, w);
    stepSeconds(run, FRAME);
    expect(run.shield.ready).toBe(true);
    const shot = new Projectile(run.player.x, run.player.y - 6, 0, 0, 2, 10, 0, false, 2);
    run.projectiles.push(shot);
    stepSeconds(run, FRAME);
    expect(shot.friendly).toBe(true);
    expect(run.shield.ready).toBe(false);
    expect(run.player.hp).toBe(run.player.maxHp);
  });
});
