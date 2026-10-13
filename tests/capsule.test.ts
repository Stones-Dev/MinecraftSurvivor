import { describe, expect, it } from 'vitest';
import { bodyTop, segSegDist2, sweepHitCapsule } from '../src/core/geom';
import { Projectile } from '../src/entities/projectile';
import { RunState } from '../src/game';
import { updateProjectiles } from '../src/systems/combat';
import { makeEnemy } from '../src/systems/spawner';

describe('capsule maths', () => {
  it('measures the distance between two segments, zero when they cross', () => {
    expect(segSegDist2(0, 0, 10, 10, 0, 10, 10, 0)).toBe(0); // an X
    expect(segSegDist2(0, 0, 10, 0, 0, 3, 10, 3)).toBe(9); // parallel, 3 apart
    expect(segSegDist2(0, 0, 4, 0, 6, 0, 9, 0)).toBe(4); // collinear, 2 apart
    expect(segSegDist2(0, 0, 0, 0, 3, 4, 3, 4)).toBe(25); // two points
  });

  it('caps the body height at 32 px and keeps at least the ankles', () => {
    expect(bodyTop(40)).toBe(32);
    expect(bodyTop(35)).toBe(28);
    expect(bodyTop(48)).toBe(32);
    expect(bodyTop(2)).toBe(4);
  });

  it('hits a shot at the head and misses one above the head or below the feet', () => {
    // A body at x=0 with feet at y=0: capsule from y=-4 up to y=-28, radius 5, shot radius 2.
    const hit = (y: number): boolean => sweepHitCapsule(-30, y, 30, y, 2, 0, -4, -28, 5);
    expect(hit(-6)).toBe(true); // ankles (the old test)
    expect(hit(-20)).toBe(true); // torso (missed before)
    expect(hit(-28)).toBe(true); // head
    expect(hit(-34)).toBe(true); // within pr + r of the top
    expect(hit(-40)).toBe(false); // above the head
    expect(hit(12)).toBe(false); // well below the feet
    // Vertical flight through the capsule's axis, and one that stops short.
    expect(sweepHitCapsule(0, -60, 0, -20, 1, 0, -4, -28, 5)).toBe(true);
    expect(sweepHitCapsule(0, -60, 0, -40, 1, 0, -4, -28, 5)).toBe(false);
  });
});

describe('projectile vs body hit tests', () => {
  function setup(): { run: RunState; zombie: NonNullable<ReturnType<typeof makeEnemy>> } {
    const run = new RunState(3);
    const zombie = makeEnemy(run, 'zombie', 100, 100, false);
    if (!zombie) throw new Error('no zombie');
    run.enemies.push(zombie);
    zombie.x = 100;
    zombie.y = 100;
    return { run, zombie };
  }
  const arrowAt = (x: number, y: number, vx: number, pierce = 0): Projectile => {
    const p = new Projectile(x, y, vx, 0, 2, 5, pierce, true, 2);
    p.px = x;
    p.py = y;
    return p;
  };
  function step(run: RunState): void {
    run.hash.clear();
    for (const e of run.enemies) run.hash.insert(e);
    updateProjectiles(run, 1 / 60);
  }

  it('an arrow flying at head height hits an enemy standing below it', () => {
    const { run, zombie } = setup();
    const top = bodyTop(zombie.def.height ?? 28);
    const hp = zombie.hp;
    run.projectiles.push(arrowAt(60, 100 - top + 2, 240));
    for (let i = 0; i < 40; i++) step(run);
    expect(zombie.hp).toBeLessThan(hp);
  });

  it('an arrow above the head still misses', () => {
    const { run, zombie } = setup();
    const hp = zombie.hp;
    run.projectiles.push(arrowAt(60, 100 - 60, 240));
    for (let i = 0; i < 40; i++) step(run);
    expect(zombie.hp).toBe(hp);
  });

  it('hits a body once per pass, however long the capsule is (pierce keeps flying)', () => {
    const { run, zombie } = setup();
    let hits = 0;
    const p = arrowAt(60, 100 - 12, 120, 3);
    p.onHit = () => {
      hits++;
    };
    run.projectiles.push(p);
    for (let i = 0; i < 90; i++) step(run);
    expect(hits).toBe(1);
    expect(zombie.hp).toBeLessThan(zombie.maxHp);
    expect(p.pierce).toBe(2);
  });

  it('keeps the hero hit circle at the ankles (hostile shots through the torso are not new hits)', () => {
    const run = new RunState(4);
    const pl = run.player;
    const hp = pl.hp;
    // A hostile arrow flying across the hero's torso passes over the old ankle circle.
    run.projectiles.push(new Projectile(pl.x - 40, pl.y - 24, 240, 0, 2, 5, 0, false, 2));
    for (let i = 0; i < 40; i++) step(run);
    expect(pl.hp).toBe(hp);
    // One at the ankles still hurts.
    run.projectiles.push(new Projectile(pl.x - 40, pl.y - 6, 240, 0, 2, 5, 0, false, 2));
    for (let i = 0; i < 40; i++) step(run);
    expect(pl.hp).toBeLessThan(hp);
  });
});
