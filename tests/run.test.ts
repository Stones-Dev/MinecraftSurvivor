import { describe, expect, it } from 'vitest';
import type { InputSource } from '../src/core/input';
import { Player } from '../src/entities/player';
import { RunState } from '../src/game';
import { applyCard, buildOffer, finishOffer, gainXp } from '../src/systems/levelup';
import { ENEMY_CAP, tideCount, trickleRate } from '../src/systems/spawner';
import { newWeapon } from '../src/weapons';
import { World } from '../src/world/world';

class ScriptedInput implements InputSource {
  private t = 0;
  moveVector(): { x: number; y: number } {
    this.t += 1 / 60;
    return { x: Math.cos(this.t * 0.7), y: Math.sin(this.t * 0.7) };
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

describe('player damage', () => {
  it('applies armor as dmg * 100 / (100 + armor) and grants i-frames', () => {
    const p = new Player();
    p.armor = 100;
    expect(p.hurt(40)).toBe(20);
    expect(p.hurt(40)).toBe(0); // invulnerable right after a hit
    p.iframes = 0;
    p.hp = 5;
    p.armor = 0;
    p.hurt(50);
    expect(p.dead).toBe(true);
    expect(p.hp).toBe(0);
  });
});

describe('spawner curves', () => {
  it('grows with time and tides get bigger', () => {
    expect(trickleRate(0)).toBeCloseTo(0.384, 2);
    expect(trickleRate(600)).toBeGreaterThan(trickleRate(60) * 4);
    expect(tideCount(600)).toBeGreaterThan(tideCount(0));
  });
});

describe('level-ups', () => {
  it('offers three distinct cards, applies them and chains queued level-ups', () => {
    const run = new RunState(7);
    gainXp(run, 100); // enough for several levels
    expect(run.level).toBeGreaterThan(2);
    expect(run.offer).not.toBeNull();
    const offer = run.offer ?? [];
    expect(offer).toHaveLength(3);
    expect(new Set(offer.map((c) => `${c.kind}:${c.id}`)).size).toBe(3);
    const queued = run.pendingLevelups;
    const card = offer.find((c) => c.kind === 'weapon') ?? offer[0];
    if (!card) throw new Error('empty offer');
    applyCard(run, card);
    finishOffer(run);
    expect(run.pendingLevelups).toBe(queued - 1);
    expect(run.offer === null).toBe(run.pendingLevelups === 0);
    expect(buildOffer(run)).toHaveLength(3);
  });

  it('is reproducible for a seed', () => {
    const a = new RunState(11);
    const b = new RunState(11);
    expect(buildOffer(a).map((c) => c.id)).toEqual(buildOffer(b).map((c) => c.id));
  });
});

describe('headless run simulation', () => {
  it('runs 3 simulated minutes deterministically without errors, spawning and killing enemies', () => {
    const simulate = (): { kills: number; enemies: number; level: number } => {
      const run = new RunState(42, 0);
      run.weapons = [newWeapon('sword'), newWeapon('bow'), newWeapon('tnt')];
      const input = new ScriptedInput();
      for (let i = 0; i < 60 * 180; i++) {
        run.update(1 / 60, input);
        if (run.offer) {
          const card = run.offer[0];
          if (card) applyCard(run, card);
          finishOffer(run);
        }
        if (run.status === 'dead') break;
        expect(run.enemies.length).toBeLessThanOrEqual(ENEMY_CAP + 10 + 12);
      }
      return { kills: run.kills, enemies: run.enemies.length, level: run.level };
    };
    const a = simulate();
    expect(a.kills).toBeGreaterThan(5);
    expect(simulate()).toEqual(a); // same seed, same outcome
  });
});

describe('world collision for enemies', () => {
  it('overlapsSolid agrees with collide', () => {
    const world = new World(5);
    const tree = world
      .propsInRect(-2000, -2000, 2000, 2000, 'plains')
      .find((p) => p.kind === 'tree');
    if (!tree) throw new Error('no tree');
    expect(world.overlapsSolid(tree.x, tree.y, 1, 'plains')).toBe(true);
    expect(world.overlapsSolid(0, 0, 1, 'plains')).toBe(false);
  });
});
