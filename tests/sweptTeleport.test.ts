import { describe, expect, it } from 'vitest';
import { blink } from '../src/abilities/blink';
import { frogLeap } from '../src/abilities/frogLeap';
import { HERO_KITS } from '../src/data/heroKits';
import { RunState } from '../src/game';
import { debugEnterEnd, END_START, isVoid, keepOnIsland } from '../src/systems/endDimension';
import { updateItems, useItem } from '../src/systems/items';
import { findNearestStructure, type PlacedStructure } from '../src/world/structures';
import { TILE_PX } from '../src/world/terrain';
import { World } from '../src/world/world';

function trialRun(): { run: RunState; s: PlacedStructure } {
  const run = new RunState(13, 0);
  const s = findNearestStructure(run.world, 'trial_chamber', 0, 0, 40000);
  if (!s) throw new Error('no trial chamber');
  // Just outside the north wall (the ring is tile row 1), clear of the door: the wall ring is tile row 1.
  run.player.x = (s.tx + 6.5) * TILE_PX;
  run.player.y = s.ty * TILE_PX - 1;
  run.player.snap();
  return { run, s };
}

const wallY = (s: PlacedStructure): number => s.ty * TILE_PX + TILE_PX;

describe('World.collideSwept', () => {
  it('is the plain collide in open terrain and in worlds without structures', () => {
    const w = new World(1, { kind: 'nether', r: 40 } as never);
    const a = w.collideSwept(0, 0, 100, 20, 5);
    const b = w.collide(100, 20, 5);
    expect(a).toEqual({ x: b.x, y: b.y });
    const open = new World(7);
    const far = { x: 50_000, y: 50_000 };
    const c = open.collideSwept(far.x, far.y, far.x + 140, far.y, 5);
    expect(c.x).toBeCloseTo(far.x + 140, 6);
  });

  it('stops in front of a 1-tile structure wall instead of tunnelling through it', () => {
    const { run, s } = trialRun();
    const p = run.player;
    // The old behaviour: only the destination was collided, and it lies inside the (free) hall.
    const dest = { x: p.x, y: p.y + 60 };
    const old = run.world.collide(dest.x, dest.y, p.radius);
    expect(old.y).toBeCloseTo(dest.y, 3);
    const r = run.world.collideSwept(p.x, p.y, dest.x, dest.y, p.radius);
    expect(r.y).toBeLessThanOrEqual(wallY(s) - p.radius + 0.1);
    expect(r.y).toBeGreaterThan(p.y); // it did move up to the wall
    // Along the wall (not into it) nothing is lost.
    const side = run.world.collideSwept(p.x, p.y, p.x + 40, p.y, p.radius);
    expect(side.x).toBeCloseTo(p.x + 40, 3);
  });

  it('passes through the open door but not past the barred one', () => {
    const { run, s } = trialRun();
    const p = run.player;
    p.x = (s.tx + 8.5) * TILE_PX; // the doorway column: tiles are free (the bars are props)
    const r = run.world.collideSwept(p.x, p.y, p.x, p.y + 60, p.radius);
    expect(r.y).toBeCloseTo(p.y + 60, 3);
  });
});

describe('teleports are stopped by thin walls', () => {
  it('an Ender Pearl thrown at the hall stops at the ring wall', () => {
    const { run, s } = trialRun();
    run.item = 'ender_pearl';
    run.itemCd = 0;
    run.targetX = run.player.x;
    run.targetY = run.player.y + 140;
    useItem(run, 0, 1);
    expect(run.player.y).toBeLessThanOrEqual(wallY(s) - run.player.radius + 0.1);
    expect(run.itemCd).toBeGreaterThan(0);
  });

  it('an Ender Pearl in open terrain still lands 140 px away', () => {
    const run = new RunState(7, 0);
    run.player.x = 50_000;
    run.player.y = 50_000;
    run.player.snap();
    run.item = 'ender_pearl';
    run.itemCd = 0;
    run.targetX = run.player.x + 300;
    run.targetY = run.player.y;
    useItem(run, 1, 0);
    expect(run.player.x).toBeCloseTo(50_140, 3);
  });

  it('Blink stops at the ring wall', () => {
    const { run, s } = trialRun();
    blink.cast(run, { x: run.player.x, y: run.player.y + 150, moveX: 0, moveY: 0 });
    expect(run.player.y).toBeLessThanOrEqual(wallY(s) - run.player.radius + 0.1);
  });

  it('the Enderman Phase Step never hops through the wall', () => {
    for (let k = 0; k < 12; k++) {
      const { run, s } = trialRun();
      run.player.y = wallY(s) - run.player.radius - 0.2; // hugging the wall from the north
      const y0 = run.player.y;
      run.rng.ai.chance = () => true;
      run.rng.ai.range = () => Math.PI / 2 + (k - 6) * 0.05; // straight south, towards the wall
      expect(HERO_KITS['enderman']?.beforeHurt?.(run, 10, null)).toBe(0);
      expect(run.player.y).toBeLessThanOrEqual(wallY(s) - run.player.radius + 0.1);
      expect(run.player.y).toBeGreaterThanOrEqual(y0 - 40);
    }
  });
});

describe('automatic dashes never end over the End void', () => {
  /** A run in the End with the hero 5 px inside the rim, east of the start. */
  function atRim(): { run: RunState; rimX: number } {
    const run = new RunState(3, 960);
    run.weapons = [];
    run.baseMaxHp = 900;
    run.recomputeStats();
    debugEnterEnd(run, 100);
    let x = END_START.x;
    while (!isVoid(run.world, x, END_START.y)) x += 1;
    run.player.x = x - 6;
    run.player.y = END_START.y;
    run.player.snap();
    return { run, rimX: x };
  }

  it('keepOnIsland stops before the rim and passes everything outside the End', () => {
    const { run, rimX } = atRim();
    const r = keepOnIsland(run, rimX - 20, END_START.y, rimX + 60, END_START.y);
    expect(isVoid(run.world, r.x, r.y)).toBe(false);
    expect(r.x).toBeLessThan(rimX);
    const over = new RunState(3, 0);
    expect(keepOnIsland(over, 0, 0, 500, 500)).toEqual({ x: 500, y: 500 });
  });

  it('a dash (Elytra, Horse sprint, Riptide lunge) towards the void stops at the rim', () => {
    const { run, rimX } = atRim();
    run.dash = { dx: 1, dy: 0, t: 0.3 };
    for (let i = 0; i < 60; i++) {
      updateItems(run, 1 / 60);
      expect(isVoid(run.world, run.player.x, run.player.y)).toBe(false);
    }
    expect(run.dash).toBeNull();
    expect(run.player.x).toBeLessThan(rimX);
    expect(run.end.voidFalls).toBe(0);
  });

  it('a Frog Leap towards the void stops at the rim too', () => {
    const { run, rimX } = atRim();
    frogLeap.cast(run, { x: run.player.x + 200, y: run.player.y, moveX: 0, moveY: 0 });
    for (let i = 0; i < 60; i++) updateItems(run, 1 / 60);
    expect(run.player.x).toBeLessThan(rimX);
    expect(isVoid(run.world, run.player.x, run.player.y)).toBe(false);
  });

  it('the Phase Step hops in the End never land in the void', () => {
    for (let k = 0; k < 24; k++) {
      const { run } = atRim();
      run.rng.ai.chance = () => true;
      run.rng.ai.range = () => (k / 24) * Math.PI * 2;
      HERO_KITS['enderman']?.beforeHurt?.(run, 10, null);
      expect(isVoid(run.world, run.player.x, run.player.y)).toBe(false);
    }
  });

  it('the same dash in the overworld is untouched', () => {
    const run = new RunState(7, 0);
    run.player.x = 50_000;
    run.player.y = 50_000;
    run.dash = { dx: 1, dy: 0, t: 0.2 };
    for (let i = 0; i < 20; i++) updateItems(run, 1 / 60);
    expect(run.player.x).toBeGreaterThan(50_030);
  });
});
