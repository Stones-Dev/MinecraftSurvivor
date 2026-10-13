import { describe, expect, it } from 'vitest';
import {
  aimPointY,
  BODY_CAP,
  bodyTop,
  drawnHeight,
  enemyBodyTop,
  HERO_BODY_LOW,
  HERO_BODY_TOP,
  segSegDist2,
  sweepHitCapsule,
} from '../src/core/geom';
import { ENEMIES, type EnemyDef } from '../src/data/enemies';

function getEnemyDef(id: string): EnemyDef {
  const def = ENEMIES[id];
  if (!def) throw new Error(`no enemy ${id}`);
  return def;
}
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

  it('caps the body height at 56 px and keeps at least the ankles', () => {
    expect(BODY_CAP).toBe(56);
    expect(bodyTop(40)).toBe(32);
    expect(bodyTop(35)).toBe(28);
    expect(bodyTop(48)).toBeCloseTo(38.4);
    expect(bodyTop(100)).toBe(56);
    expect(bodyTop(2)).toBe(4);
  });

  it('BUG-15: the capsule covers about 80% of the DRAWN height, scale included', () => {
    const captain = getEnemyDef('raid_captain');
    const warden = getEnemyDef('warden');
    for (const def of [captain, warden]) {
      const drawn = drawnHeight(def);
      expect(drawn).toBe((def.height ?? 28) * (def.scale ?? 1));
      expect(drawn).toBeGreaterThan(45);
      expect(enemyBodyTop(def)).toBeCloseTo(Math.min(BODY_CAP, drawn * 0.8));
      expect(enemyBodyTop(def)).toBeGreaterThan(36);
    }
    // An unscaled mob is unchanged.
    const zombie = getEnemyDef('zombie');
    expect(enemyBodyTop(zombie)).toBe(bodyTop(zombie.height ?? 28));
  });

  it('aimPointY is the middle of the hit capsule, above the feet and inside the body', () => {
    for (const id of ['zombie', 'skeleton', 'raid_captain', 'warden', 'silverfish']) {
      const def = getEnemyDef(id);
      const e = { y: 200, def };
      const y = aimPointY(e);
      expect(y).toBeCloseTo(200 - (4 + enemyBodyTop(def)) / 2);
      expect(y).toBeLessThanOrEqual(200 - 4);
      expect(y).toBeGreaterThanOrEqual(200 - enemyBodyTop(def));
    }
    // A zombie is aimed at the waist (about 12-14 px up), not the ankles.
    expect(200 - aimPointY({ y: 200, def: getEnemyDef('zombie') })).toBeGreaterThan(10);
  });

  it('the hero hurtbox runs from the ankles to the shoulders', () => {
    expect(HERO_BODY_LOW).toBe(4);
    expect(HERO_BODY_TOP).toBe(22);
    const hit = (y: number): boolean =>
      sweepHitCapsule(-40, y, 40, y, 2, 0, -HERO_BODY_LOW, -HERO_BODY_TOP, 5);
    expect(hit(-6)).toBe(true);
    expect(hit(-20)).toBe(true);
    expect(hit(-35)).toBe(false);
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

  it('BUG-15: an arrow at the shoulders of a Raid Captain hits it, one above the head misses', () => {
    const run = new RunState(5);
    const boss = makeEnemy(run, 'raid_captain', 100, 100, false);
    if (!boss) throw new Error('no captain');
    run.enemies.push(boss);
    boss.x = 100;
    boss.y = 100;
    const hp = boss.hp;
    run.projectiles.push(arrowAt(40, 100 - 38, 240)); // 38 px up: the old 32 px cap missed it
    for (let i = 0; i < 40; i++) step(run);
    expect(boss.hp).toBeLessThan(hp);
    const hp2 = boss.hp;
    run.projectiles.push(arrowAt(40, 100 - 75, 240));
    for (let i = 0; i < 40; i++) step(run);
    expect(boss.hp).toBe(hp2);
  });

  it('the hero is hit anywhere from the ankles to the shoulders, not above the head', () => {
    const shotAt = (dy: number): number => {
      const run = new RunState(4);
      const pl = run.player;
      const hp = pl.hp;
      run.projectiles.push(new Projectile(pl.x - 40, pl.y + dy, 240, 0, 2, 5, 0, false, 2));
      for (let i = 0; i < 40; i++) step(run);
      return hp - pl.hp;
    };
    expect(shotAt(-6)).toBeGreaterThan(0); // ankles
    expect(shotAt(-18)).toBeGreaterThan(0); // torso, a miss before the capsule
    expect(shotAt(-22)).toBeGreaterThan(0); // shoulders
    expect(shotAt(-40)).toBe(0); // well above the head
    expect(shotAt(20)).toBe(0); // well below the feet
  });
});
