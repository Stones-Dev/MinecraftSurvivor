import { describe, expect, it } from 'vitest';
import { Camera } from '../src/core/camera';
import type { InputSource } from '../src/core/input';
import { STEP } from '../src/core/loop';
import { PetState } from '../src/entities/ally';
import { Player } from '../src/entities/player';
import { RunState } from '../src/game';
import { PET_SIDE_DELAY, petTargetOffset, updatePet, type PetSide } from '../src/systems/allies';
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

  it('a standing hero turns to the attack direction, a moving hero keeps its body facing', () => {
    const p = new Player();
    p.aim(-1);
    p.update(STEP, keys(0, 0), world, 'plains');
    expect(p.facing).toBe(-1);
    // Running right while shooting left: the body follows the movement, the aim is only recorded.
    const q = new Player();
    for (let i = 0; i < 12; i++) q.update(STEP, keys(1, 0), world, 'plains');
    for (let i = 0; i < 40; i++) {
      q.aim(-1);
      q.update(STEP, keys(1, 0), world, 'plains');
      expect(q.facing).toBe(1);
    }
    expect(q.aimFacing).toBe(-1);
    expect(q.attackFacing).toBe(-1);
    // Vertical movement keeps the last horizontal facing; attacks do not flip it either.
    for (let i = 0; i < 12; i++) {
      q.aim(-1);
      q.update(STEP, keys(0, 1), world, 'plains');
    }
    expect(q.facing).toBe(1);
    // Released keys, the aim is fresh: face it; afterwards the last facing is kept.
    const r = new Player();
    r.aim(1);
    for (let i = 0; i < 30; i++) r.update(STEP, keys(-1, 0), world, 'plains');
    expect(r.facing).toBe(-1);
    for (let i = 0; i < 20; i++) r.update(STEP, keys(0, 0), world, 'plains');
    r.aim(1);
    r.update(STEP, keys(0, 0), world, 'plains');
    expect(r.facing).toBe(1);
    for (let i = 0; i < 40; i++) r.update(STEP, keys(0, 0), world, 'plains');
    expect(r.facing).toBe(1);
    expect(r.attackFacing).toBe(1);
  });

  it('never flickers the body facing while shooting across the direction of travel', () => {
    const p = new Player();
    let flips = 0;
    let last = p.facing;
    for (let i = 0; i < 300; i++) {
      if (i % 12 === 0) p.aim(i % 24 === 0 ? 1 : -1); // a weapon firing every 0.2 s at alternating targets
      p.update(STEP, keys(-1, 0), world, 'plains');
      if (p.facing !== last) flips++;
      last = p.facing;
    }
    expect(flips).toBeLessThanOrEqual(1); // the single turn to the left at the start
    expect(p.facing).toBe(-1);
  });

  /** Seconds until the velocity has reversed from full speed one way to full speed the other. */
  function reversalTime(speedMult: number): number {
    const p = new Player();
    p.speedMult = speedMult;
    for (let i = 0; i < 30; i++) p.update(STEP, keys(1, 0), world, 'plains');
    expect(p.vx).toBeCloseTo(p.speed * speedMult, 3);
    let steps = 0;
    while (p.vx > -p.speed * speedMult + 0.01 && steps < 200) {
      p.update(STEP, keys(-1, 0), world, 'plains');
      steps++;
    }
    return steps * STEP;
  }

  it('reverses in about a tenth of a second at any speed multiplier', () => {
    for (const m of [1, 1.3, 1.6, 2]) {
      const t = reversalTime(m);
      expect(t).toBeGreaterThan(0.03);
      expect(t).toBeLessThanOrEqual(0.1);
    }
    // And the slide while reversing at base speed stays under 4 px (it was about 7 px).
    const p = new Player();
    for (let i = 0; i < 30; i++) p.update(STEP, keys(1, 0), world, 'plains');
    const x0 = p.x;
    let maxX = x0;
    for (let i = 0; i < 12; i++) {
      p.update(STEP, keys(-1, 0), world, 'plains');
      maxX = Math.max(maxX, p.x);
    }
    expect(maxX - x0).toBeLessThan(4);
  });

  it('turns a right angle faster than it accelerates from rest', () => {
    const p = new Player();
    for (let i = 0; i < 30; i++) p.update(STEP, keys(1, 0), world, 'plains');
    let steps = 0;
    while (Math.abs(p.vx) > 0.01 || p.vy < p.speed - 0.01) {
      p.update(STEP, keys(0, 1), world, 'plains');
      if (++steps > 100) break;
    }
    expect(steps * STEP).toBeLessThanOrEqual(0.15);
  });

  it('keeps the slippery ice rates (no turn boost on ice)', () => {
    const ice = {
      surface: () => 'ice',
      collide: (x: number, y: number) => ({ x, y }),
    } as unknown as World;
    const p = new Player();
    for (let i = 0; i < 120; i++) p.update(STEP, keys(1, 0), ice, 'snowy_taiga');
    expect(p.vx).toBeCloseTo(p.speed, 3);
    for (let i = 0; i < 6; i++) p.update(STEP, keys(-1, 0), ice, 'snowy_taiga');
    expect(p.vx).toBeGreaterThan(p.speed * 0.5); // still sliding after 0.1 s
    const q = new Player();
    for (let i = 0; i < 120; i++) q.update(STEP, keys(1, 0), ice, 'snowy_taiga');
    for (let i = 0; i < 6; i++) q.update(STEP, keys(0, 0), ice, 'snowy_taiga');
    expect(q.vx).toBeGreaterThan(q.speed * 0.8);
  });

  it('drops the velocity component into a solid prop so the hero slides instead of running in place', () => {
    const wall = {
      surface: () => 'grass',
      // A solid half-plane at x >= 95 (the hero's centre is held there).
      collide: (x: number, y: number) => ({ x: Math.min(x, 95), y }),
    } as unknown as World;
    const p = new Player();
    p.x = 80;
    for (let i = 0; i < 60; i++) p.update(STEP, keys(1, 0.5), wall, 'plains');
    expect(p.x).toBeCloseTo(95, 3);
    expect(p.vx).toBeLessThanOrEqual(1e-6);
    expect(p.vy).toBeGreaterThan(0); // still slides along the wall
    const q = new Player();
    q.x = 80;
    for (let i = 0; i < 60; i++) q.update(STEP, keys(1, 0), wall, 'plains');
    expect(q.vx).toBeCloseTo(0, 6);
    expect(q.moving).toBe(false); // pressed into a wall: no walk cycle
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

describe('pet follow', () => {
  const fresh = (): PetSide => ({ side: -1, flipT: 0, off: -18 });

  it('keeps its side on a quick turn-back and changes only after sustained movement, sliding there', () => {
    const st = fresh();
    // The hero runs right: the pet trails on the left.
    for (let i = 0; i < 30; i++) petTargetOffset(st, 72, 1, STEP);
    expect(st.side).toBe(-1);
    // 0.2 s of a turn-back, then right again: no change of side.
    for (let i = 0; i < 12; i++) petTargetOffset(st, -72, -1, STEP);
    for (let i = 0; i < 30; i++) petTargetOffset(st, 72, 1, STEP);
    expect(st.side).toBe(-1);
    expect(st.off).toBeCloseTo(-18, 6);
    // Sustained movement to the left: the side flips after the delay and the offset slides (no jump).
    let prev = st.off;
    let maxJump = 0;
    let flippedAt = -1;
    for (let i = 0; i < 120; i++) {
      const off = petTargetOffset(st, -72, -1, STEP);
      maxJump = Math.max(maxJump, Math.abs(off - prev));
      prev = off;
      if (flippedAt < 0 && st.side === 1) flippedAt = i * STEP;
    }
    expect(flippedAt).toBeGreaterThanOrEqual(PET_SIDE_DELAY - 0.02);
    expect(maxJump).toBeLessThan(1.5); // 60 px/s at 60 Hz is 1 px per step
    expect(st.off).toBeCloseTo(18, 6);
  });

  it('stays put when the hero stands still and starts on the side behind the facing', () => {
    const st = fresh();
    for (let i = 0; i < 120; i++) petTargetOffset(st, 0, -1, STEP);
    expect(st.side).toBe(-1);
    expect(petTargetOffset({ side: 1, flipT: 0, off: 0 }, 0, 1, STEP, true)).toBe(-18);
    expect(petTargetOffset({ side: 1, flipT: 0, off: 0 }, 0, -1, STEP, true)).toBe(18);
  });

  it('does not walk through solid props', () => {
    const run = new RunState(9);
    const pet = new PetState(run.pet?.def ?? ({ effect: 'none' } as never), 1, 0, 0);
    run.pet = pet;
    const wall = { x: 40, y: 0, radius: 6 };
    run.world.collide = (x: number, y: number) => {
      const dx = x - wall.x;
      const dy = y - wall.y;
      const d = Math.hypot(dx, dy);
      const min = wall.radius + 3;
      return d >= min || d < 1e-6
        ? { x, y }
        : { x: wall.x + (dx / d) * min, y: wall.y + (dy / d) * min };
    };
    run.player.x = 120;
    run.player.y = -8; // the trailing point is at (102, 0), behind the wall for a pet at the origin
    pet.x = 20;
    pet.y = 0;
    for (let i = 0; i < 240; i++) {
      updatePet(run, STEP);
      expect(Math.hypot(pet.x - wall.x, pet.y - wall.y)).toBeGreaterThanOrEqual(
        wall.radius + 3 - 1e-6,
      );
    }
  });
});
