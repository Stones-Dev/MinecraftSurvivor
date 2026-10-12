import { describe, expect, it } from 'vitest';
import type { InputSource } from '../src/core/input';
import { spawnDecoy } from '../src/abilities/decoys';
import { RunState } from '../src/game';
import { updateOrbiters } from '../src/systems/combat';
import { updateInteract } from '../src/systems/interact';
import { updateRift } from '../src/systems/rift';
import { makeEnemy, ringPoint } from '../src/systems/spawner';
import { findBiomeGround } from '../src/world/world';

const idle: InputSource = {
  moveVector: () => ({ x: 0, y: 0 }),
  pausePressed: () => false,
  confirmPressed: () => false,
  cancelPressed: () => false,
  activePressed: () => false,
  endStep() {},
};

function step(run: RunState, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    run.update(1 / 60, idle);
    if (run.offer) run.offer = null;
  }
}

function enterRift(run: RunState): void {
  run.rift.portal = { x: run.player.x + 2, y: run.player.y, left: 45 };
  step(run, 0.1);
  expect(run.rift.active).toBe(true);
}

describe('orbiter re-hit memory', () => {
  it('prunes only expired entries instead of clearing everyone at once', () => {
    const run = new RunState(3);
    run.time = 100;
    const hitAt = new Map<number, number>();
    for (let id = 1000; id < 1100; id++) hitAt.set(id, run.time - 0.1); // fresh: still on cooldown
    for (let id = 2000; id < 2010; id++) hitAt.set(id, run.time - 50); // stale
    run.orbiters.push({
      owner: 'blaze_rods',
      angle: 0,
      radius: 0,
      speed: 0,
      dmg: 1,
      size: 10,
      knock: 0,
      rehit: 1,
      burn: false,
      style: 'rod',
      x: 0,
      y: 0,
      hitAt,
    });
    run.hash.clear();
    const e = makeEnemy(run, 'zombie', run.player.x, run.player.y - 6, false);
    if (!e) throw new Error('no zombie');
    run.hash.insert(e);
    updateOrbiters(run, 0);
    expect(hitAt.size).toBeGreaterThan(100);
    expect(hitAt.has(1000)).toBe(true);
    expect(hitAt.has(2000)).toBe(false);
  });
});

describe('interact', () => {
  it('drops this frame hit points even when the hero is dead', () => {
    const run = new RunState(3);
    run.hitPoints.push(1, 2, 3, 4);
    run.player.dead = true;
    updateInteract(run, 1 / 60);
    expect(run.hitPoints).toHaveLength(0);
  });
});

describe('rift edge cases', () => {
  it('a hero who dies on the same step as the last foe escapes alive, with no reward', () => {
    const run = new RunState(7, 10);
    enterRift(run);
    for (const e of run.rift.foes) e.hp = 0;
    run.player.dead = true;
    run.status = 'dead';
    updateRift(run, 1 / 60);
    expect(run.rift.active).toBe(false);
    expect(run.player.dead).toBe(false);
    expect(run.status).toBe('playing');
    expect(run.rareSpawnEggs).toBe(0);
  });

  it('overworld decoys wait in the stash and are back after the rift', () => {
    const run = new RunState(7, 10);
    spawnDecoy(run, run.player.x + 30, run.player.y, 60);
    expect(run.decoys).toHaveLength(1);
    const mine = run.decoys[0];
    enterRift(run);
    expect(run.decoys).toHaveLength(0);
    run.rift.timer = 0.01;
    for (const e of run.enemies) e.stunT = 999;
    run.player.iframes = 99;
    step(run, 0.1);
    expect(run.rift.active).toBe(false);
    expect(run.decoys).toEqual([mine]);
  });

  it('flushes callbacks queued in the arena on leave and keeps the overworld queue intact', () => {
    const run = new RunState(7, 10);
    const log: string[] = [];
    run.later(5, () => log.push('overworld'));
    enterRift(run);
    expect(run.scheduled).toHaveLength(0);
    run.later(30, () => log.push('arena'));
    run.rift.timer = 0.01;
    for (const e of run.enemies) e.stunT = 999;
    run.player.iframes = 99;
    step(run, 0.1);
    expect(run.rift.active).toBe(false);
    expect(log).toEqual(['arena']);
    expect(run.scheduled).toHaveLength(1);
    step(run, 6);
    expect(log).toEqual(['arena', 'overworld']);
  });
});

describe('spawn ring', () => {
  it('never offers lava, nor water to land mobs, around lakes in many seeds', () => {
    let tested = 0;
    for (let seed = 1; seed <= 40; seed++) {
      for (const biome of ['swamp', 'plains', 'snowy_taiga', 'mushroom_fields'] as const) {
        const run = new RunState(seed);
        const spot = findBiomeGround(run.world, biome);
        if (!spot) continue;
        run.player.x = spot.x;
        run.player.y = spot.y;
        for (let i = 0; i < 48; i++) {
          const pt = ringPoint(run, (i / 48) * Math.PI * 2, 6);
          if (!pt) continue;
          tested++;
          const surface = run.world.surface(pt.x, pt.y);
          expect(surface).not.toBe('lava');
          expect(surface).not.toBe('water');
        }
      }
    }
    expect(tested).toBeGreaterThan(1000);
  });

  it('lets aquatic mobs use water points', () => {
    let water = 0;
    for (let seed = 1; seed <= 40 && water === 0; seed++) {
      const run = new RunState(seed);
      const spot = findBiomeGround(run.world, 'swamp');
      if (!spot) continue;
      run.player.x = spot.x;
      run.player.y = spot.y;
      for (let i = 0; i < 48; i++) {
        const pt = ringPoint(run, (i / 48) * Math.PI * 2, 6, true);
        if (pt && run.world.surface(pt.x, pt.y) === 'water') water++;
      }
    }
    expect(water).toBeGreaterThan(0);
  });
});
