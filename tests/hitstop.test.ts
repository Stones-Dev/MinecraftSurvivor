import { describe, expect, it } from 'vitest';
import {
  BIG_KILL_PAUSE_STEPS,
  GLOBAL_COOLDOWN_STEPS,
  HERO_HIT_PAUSE_STEPS,
  HitStop,
  hitStunSteps,
} from '../src/core/hitstop';
import type { InputSource } from '../src/core/input';
import { RunState } from '../src/game';
import { damageEnemy, hurtPlayer } from '../src/systems/combat';
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

describe('hit-stop scheduler (pure)', () => {
  it('victim hit-stun is 2 steps, 4 on a crit', () => {
    expect(hitStunSteps(false)).toBe(2);
    expect(hitStunSteps(true)).toBe(4);
  });

  it('is off until enabled, so the simulation never pauses by itself', () => {
    const h = new HitStop();
    expect(h.heroHurt(40)).toBe(false);
    expect(h.kill(true)).toBe(false);
    expect(h.tickGlobal()).toBe(false);
  });

  it('a hero hit over 15 HP pauses 3 steps; 15 or less does not', () => {
    const h = new HitStop();
    h.globalEnabled = true;
    expect(h.heroHurt(15)).toBe(false);
    expect(h.heroHurt(16)).toBe(true);
    const skipped: boolean[] = [];
    for (let i = 0; i < 5; i++) skipped.push(h.tickGlobal());
    expect(skipped).toEqual([true, true, true, false, false]);
    expect(HERO_HIT_PAUSE_STEPS).toBe(3);
  });

  it('a killing blow on an elite or boss pauses 5 steps; a normal kill does not', () => {
    const h = new HitStop();
    h.globalEnabled = true;
    expect(h.kill(false)).toBe(false);
    expect(h.kill(true)).toBe(true);
    let n = 0;
    while (h.tickGlobal()) n++;
    expect(n).toBe(BIG_KILL_PAUSE_STEPS);
  });

  it('keeps 150 ms (9 steps) between global pauses, counted from the end of the pause', () => {
    const h = new HitStop();
    h.globalEnabled = true;
    expect(h.kill(true)).toBe(true);
    let steps = 0;
    // Run until the next request is allowed.
    for (;;) {
      h.tickGlobal();
      steps++;
      if (h.cooldown === 0) break;
    }
    expect(steps).toBe(BIG_KILL_PAUSE_STEPS + GLOBAL_COOLDOWN_STEPS);
    expect(h.heroHurt(30)).toBe(true);
    // A second request during a pause or its cooldown is refused.
    h.tickGlobal();
    expect(h.kill(true)).toBe(false);
  });

  it('is deterministic: the same requests give the same skipped steps', () => {
    const play = (): string => {
      const h = new HitStop();
      h.globalEnabled = true;
      let out = '';
      for (let i = 0; i < 60; i++) {
        if (i % 7 === 0) h.heroHurt(20);
        if (i % 11 === 0) h.kill(true);
        out += h.tickGlobal() ? '1' : '0';
      }
      return out;
    };
    expect(play()).toBe(play());
    expect(play()).toContain('1');
  });

  it('the swing hold lasts 2 steps and does not stack', () => {
    const h = new HitStop();
    h.holdSwing();
    h.holdSwing();
    expect([h.consumeSwingHold(), h.consumeSwingHold(), h.consumeSwingHold()]).toEqual([
      true,
      true,
      false,
    ]);
  });
});

describe('hit-stop in the simulation', () => {
  it('a direct hit stuns the victim for 2 steps (movement and animation stand still), once per flash window', () => {
    const run = new RunState(7);
    const z = makeEnemy(run, 'zombie', run.player.x + 120, run.player.y, false);
    if (!z) throw new Error('no zombie');
    run.enemies.push(z);
    damageEnemy(run, z, 1, z.x - 10, z.y, 0);
    expect(z.hitStun).toBe(2);
    const input = new StillInput();
    const x0 = z.x;
    const anim0 = z.animT;
    run.update(1 / 60, input);
    run.update(1 / 60, input);
    expect(z.x).toBe(x0);
    expect(z.animT).toBe(anim0);
    run.update(1 / 60, input);
    expect(z.animT).toBeGreaterThan(anim0);
    // A second hit while the flash is still on does not stun again.
    z.hitStun = 0;
    damageEnemy(run, z, 1, z.x - 10, z.y, 0);
    expect(z.hitStun).toBe(0);
  });

  it('damage-over-time ticks never stun, and bosses never freeze', () => {
    const run = new RunState(8);
    const z = makeEnemy(run, 'zombie', run.player.x + 120, run.player.y, false);
    const boss = makeEnemy(run, 'raid_captain', run.player.x + 160, run.player.y, false);
    if (!z || !boss) throw new Error('no enemy');
    damageEnemy(run, z, 1, z.x, z.y, 0, true);
    expect(z.hitStun).toBe(0);
    damageEnemy(run, boss, 1, boss.x - 5, boss.y, 0);
    expect(boss.hitStun).toBe(0);
  });

  it('a heavy hit (axe crit) stuns 4 steps', () => {
    const run = new RunState(9);
    const z = makeEnemy(run, 'zombie', run.player.x + 120, run.player.y, false);
    if (!z) throw new Error('no zombie');
    damageEnemy(run, z, 1, z.x - 10, z.y, 0, false, true);
    expect(z.hitStun).toBe(4);
  });

  it('the hero swing holds its frame when a sword lands a hit', () => {
    const run = new RunState(10);
    run.weapons = [newWeapon('sword')];
    const z = makeEnemy(run, 'zombie', run.player.x + 20, run.player.y, false);
    if (!z) throw new Error('no zombie');
    z.hp = z.maxHp = 5000;
    run.enemies.push(z);
    const input = new StillInput();
    const trace: number[] = [];
    for (let i = 0; i < 30; i++) {
      run.update(1 / 60, input);
      trace.push(run.player.swingT);
    }
    // swingT counts down from 0.33; with the hold it is flat for two steps right after the swing starts.
    let flat = 0;
    for (let i = 1; i < trace.length; i++) {
      const a = trace[i - 1] ?? 0;
      const b = trace[i] ?? 0;
      if (a > 0 && Math.abs(a - b) < 1e-9) flat++;
    }
    expect(flat).toBeGreaterThanOrEqual(2);
  });

  it('a hero hit over 15 HP asks for a global pause only when the screen enabled it', () => {
    const run = new RunState(11);
    run.player.maxHp = run.player.hp = 200;
    hurtPlayer(run, 30);
    expect(run.hitStop.globalLeft).toBe(0);
    run.player.iframes = 0;
    run.hitStop.globalEnabled = true;
    hurtPlayer(run, 30);
    expect(run.hitStop.globalLeft).toBe(HERO_HIT_PAUSE_STEPS);
  });

  it('killing an elite asks for a 5 step pause, a plain mob does not', () => {
    const run = new RunState(12);
    run.hitStop.globalEnabled = true;
    const z = makeEnemy(run, 'zombie', run.player.x + 50, run.player.y, false);
    const el = makeEnemy(run, 'zombie', run.player.x + 60, run.player.y, false);
    if (!z || !el) throw new Error('no zombie');
    el.elite = true;
    damageEnemy(run, z, 9999, z.x - 5, z.y, 0);
    expect(run.hitStop.globalLeft).toBe(0);
    damageEnemy(run, el, 9999, el.x - 5, el.y, 0);
    expect(run.hitStop.globalLeft).toBe(BIG_KILL_PAUSE_STEPS);
  });
});
