import { describe, expect, it } from 'vitest';
import { Camera } from '../src/core/camera';
import type { InputSource } from '../src/core/input';
import { STEP } from '../src/core/loop';
import { Player } from '../src/entities/player';
import { RunState } from '../src/game';
import { World } from '../src/world/world';

const keys = (x: number, y: number): InputSource => ({
  moveVector: () => ({ x, y }),
  pausePressed: () => false,
  confirmPressed: () => false,
  cancelPressed: () => false,
  activePressed: () => false,
  endStep() {},
});

describe('player movement model', () => {
  const world = new World(77);

  it('accelerates to full speed in about a tenth of a second and brakes quickly', () => {
    const p = new Player();
    const right = keys(1, 0);
    p.update(STEP, right, world, 'plains');
    const first = Math.hypot(p.vx, p.vy);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(p.speed * 0.5); // no instant snap
    for (let i = 0; i < 8; i++) p.update(STEP, right, world, 'plains');
    expect(p.vx).toBeCloseTo(p.speed, 3);
    const stop = keys(0, 0);
    let steps = 0;
    while (Math.hypot(p.vx, p.vy) > 0.01 && steps < 60) {
      p.update(STEP, stop, world, 'plains');
      steps++;
    }
    expect(steps).toBeGreaterThan(1);
    expect(steps).toBeLessThan(10);
  });

  it('keeps diagonal speed equal to straight speed', () => {
    const p = new Player();
    const d = Math.SQRT1_2;
    for (let i = 0; i < 30; i++) p.update(STEP, keys(d, d), world, 'plains');
    expect(Math.hypot(p.vx, p.vy)).toBeCloseTo(p.speed, 3);
  });

  it('advances the walk cycle by distance and reports a footfall every half stride', () => {
    const p = new Player();
    let falls = 0;
    const right = keys(1, 0);
    for (let i = 0; i < 120; i++) {
      p.update(STEP, right, world, 'plains');
      if (p.footfall) falls++;
    }
    // 2 s at 72 px/s is about 144 px, one footfall per 7 px.
    expect(falls).toBeGreaterThan(15);
    expect(falls).toBeLessThan(25);
    const before = p.walkPhase;
    const idle = keys(0, 0);
    for (let i = 0; i < 30; i++) p.update(STEP, idle, world, 'plains');
    expect(Number.isInteger(p.walkPhase / 2)).toBe(true);
    expect(p.walkPhase).toBeGreaterThanOrEqual(before - 1);
  });

  it('lets an attack steer the facing for a moment, then movement takes over again', () => {
    const p = new Player();
    p.aim(-1);
    p.update(STEP, keys(1, 0), world, 'plains');
    expect(p.facing).toBe(-1);
    for (let i = 0; i < 20; i++) p.update(STEP, keys(1, 0), world, 'plains');
    expect(p.facing).toBe(1);
  });
});

describe('render interpolation', () => {
  it('blends the previous and the current step and snaps after a teleport', () => {
    const run = new RunState(5);
    const p = run.player;
    run.update(STEP, keys(1, 0));
    run.update(STEP, keys(1, 0));
    run.interpolate(0);
    expect(p.rx).toBeCloseTo(p.prevX);
    run.interpolate(1);
    expect(p.rx).toBeCloseTo(p.x);
    run.interpolate(0.5);
    expect(p.rx).toBeCloseTo((p.prevX + p.x) / 2);
    p.x += 500;
    p.snap();
    run.interpolate(0.25);
    expect(p.rx).toBeCloseTo(p.x);
  });

  it('a NaN previous x alone marks a teleport on both axes (y does not blend from a stale value)', () => {
    const run = new RunState(5);
    const p = run.player;
    run.update(STEP, keys(0, 0));
    p.prevX = Number.NaN;
    p.prevY = p.y - 400;
    run.interpolate(0.5);
    expect(p.rx).toBeCloseTo(p.x);
    expect(p.ry).toBeCloseTo(p.y);
  });

  it('renders a freshly spawned enemy at its position, not at the origin', () => {
    const run = new RunState(6);
    for (let i = 0; i < 60 * 3; i++) run.update(STEP, keys(0, 0));
    run.interpolate(0.5);
    for (const e of run.enemies) {
      expect(Number.isFinite(e.rx + e.ry)).toBe(true);
      expect(Math.abs(e.rx - e.x)).toBeLessThan(10);
    }
  });
});

describe('camera', () => {
  it('keeps the hero at a fixed on-screen pixel for odd and even views while moving', () => {
    for (const w of [426, 427, 320]) {
      const cam = new Camera();
      const seen = new Set<number>();
      for (let i = 0; i < 200; i++) {
        const x = 100 + i * 0.37;
        cam.follow(x, 50, w, 240, 0, 0, 1 / 60);
        seen.add(Math.round(x) - cam.x);
      }
      expect(seen.size).toBe(1);
    }
  });

  it('leads in the direction of travel with an integer-stable offset', () => {
    const cam = new Camera();
    for (let i = 0; i < 120; i++) cam.follow(i, 0, 426, 240, 72, 0, 1 / 60);
    const lead = cam.x - (Math.round(119) - Math.floor(426 / 2));
    expect(lead).toBeGreaterThan(5);
    expect(lead).toBeLessThanOrEqual(14);
    for (let i = 0; i < 240; i++) cam.follow(119, 0, 426, 240, 0, 0, 1 / 60);
    expect(cam.x).toBe(119 - 213);
  });
});
