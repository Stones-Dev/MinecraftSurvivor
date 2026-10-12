import { describe, expect, it } from 'vitest';
import type { InputSource } from '../../src/core/input';
import { RunState, type Zone } from '../../src/game';
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

/** Walks straight east. */
class Walk extends Still {
  override moveVector(): { x: number; y: number } {
    return { x: 1, y: 0 };
  }
}

/** Steps the simulation and records every zone seen (zones expire, so sample each step). */
function play(run: RunState, steps: number, input: InputSource): Set<Zone> {
  const zones = new Set<Zone>();
  for (let i = 0; i < steps; i++) {
    run.update(1 / 60, input);
    for (const z of run.zones) zones.add(z);
  }
  return zones;
}

describe('Lava Bucket', () => {
  it('leaves burning patches along the path the hero walks', () => {
    const run = new RunState(1);
    run.weapons = [newWeapon('lava_bucket')];
    const x0 = run.player.x;
    const y0 = run.player.y;
    const zones = play(run, 240, new Walk());
    const walked = Math.hypot(run.player.x - x0, run.player.y - y0);
    const patches = [...zones].filter((z) => z.kind === 'burn');
    expect(walked).toBeGreaterThan(30);
    expect(patches.length).toBeGreaterThan(5);
    expect(patches.every((z) => z.friendly && z.slowF === 1)).toBe(true);
    expect(patches.every((z) => z.r === 10)).toBe(true);
  });

  it('does not drop patches while standing still', () => {
    const run = new RunState(1);
    run.weapons = [newWeapon('lava_bucket')];
    const zones = play(run, 120, new Still());
    expect([...zones].some((z) => z.kind === 'burn')).toBe(false);
  });

  it('evolved Magma Trail has wider and longer-lasting patches', () => {
    const run = new RunState(1);
    const w = newWeapon('lava_bucket');
    w.level = 5;
    w.evolved = true;
    run.weapons = [w];
    const patches = [...play(run, 240, new Walk())].filter((z) => z.kind === 'burn');
    expect(patches.length).toBeGreaterThan(5);
    expect(Math.max(...patches.map((z) => z.r))).toBeCloseTo(16 * 1.5, 5);
    expect(Math.max(...patches.map((z) => z.dur))).toBeCloseTo(4 * 1.6, 5);
  });

  it('never fires on its own (the trail is the weapon)', () => {
    const run = new RunState(1);
    const w = newWeapon('lava_bucket');
    expect(WEAPONS.lava_bucket.fire(run, w, weaponLevel('lava_bucket', 1))).toBe(false);
  });
});
