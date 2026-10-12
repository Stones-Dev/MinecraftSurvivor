import { describe, expect, it } from 'vitest';
import type { InputSource } from '../src/core/input';
import { RunState } from '../src/game';
import { killEnemy } from '../src/systems/combat';
import { spawnTrader } from '../src/systems/npcs';
import { BOSS_SCHEDULE } from '../src/systems/director';
import { makeEnemy } from '../src/systems/spawner';
import { BIOMES } from '../src/world/biomes';
import { genProps } from '../src/world/props';
import { tileAt, TILE } from '../src/world/terrain';

class Still implements InputSource {
  dx = 0;
  dy = 0;
  moveVector(): { x: number; y: number } {
    return { x: this.dx, y: this.dy };
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

function step(run: RunState, seconds: number, input = new Still()): void {
  for (let i = 0; i < seconds * 60; i++) {
    run.update(1 / 60, input);
    if (run.offer) run.offer = null;
  }
}

describe('bosses and victory', () => {
  it('spawns the Raid Captain at 5:00, slows tides while it lives and rewards its death', () => {
    const run = new RunState(3, 299.5);
    run.player.maxHp = run.player.hp = 99999;
    step(run, 2);
    const boss = run.enemies.find((e) => e.def.id === 'raid_captain');
    expect(boss).toBeDefined();
    expect(run.spawnMult).toBeCloseTo(0.25);
    if (!boss) return;
    boss.hp = 1;
    killEnemy(run, boss, true);
    expect(run.bossKills).toBe(1);
    expect(run.rareSpawnEggs).toBe(1);
    expect(run.won).toBe(false);
  });

  it('the Warden at 15:00 ends the night and Endless keeps scaling', () => {
    expect(BOSS_SCHEDULE.map((b) => b.id)).toEqual(['raid_captain', 'wither', 'warden']);
    const run = new RunState(3, 899.5);
    run.player.maxHp = run.player.hp = 99999;
    step(run, 2);
    const warden = run.enemies.find((e) => e.def.id === 'warden');
    expect(warden).toBeDefined();
    if (!warden) return;
    killEnemy(run, warden, true);
    expect(run.won).toBe(true);
    step(run, 1);
    expect(run.spawnMult).toBeGreaterThanOrEqual(1);
  });

  it('boss patterns run for a while without errors', () => {
    for (const t of [299.5, 599.5, 899.5]) {
      const run = new RunState(5, t);
      run.player.maxHp = run.player.hp = 99999;
      step(run, 25);
      expect(Number.isFinite(run.player.x)).toBe(true);
      expect(run.enemies.some((e) => e.boss === 'boss')).toBe(true);
    }
  });
});

describe('nether rift', () => {
  it('enters on touching the portal, fights in the arena and returns with a reward', () => {
    const run = new RunState(7, 10);
    run.player.maxHp = run.player.hp = 99999;
    const home = { x: run.player.x, y: run.player.y };
    run.rift.portal = { x: home.x + 4, y: home.y, left: 45 };
    step(run, 0.1);
    expect(run.rift.active).toBe(true);
    expect(run.world).toBe(run.arenaWorld);
    expect(run.biome()).toBe('nether');
    expect(run.enemies.length).toBeGreaterThan(0);
    for (const e of run.enemies) killEnemy(run, e, true);
    step(run, 2);
    expect(run.rift.active).toBe(false);
    expect(run.world).toBe(run.overworld);
    expect(run.rareSpawnEggs).toBe(1);
    expect(Math.hypot(run.player.x - home.x, run.player.y - home.y)).toBeLessThan(2);
  });

  it('times out after 90 s with 30% HP and no reward', () => {
    const run = new RunState(7, 10);
    run.rift.portal = { x: run.player.x + 2, y: run.player.y, left: 45 };
    step(run, 0.1);
    expect(run.rift.active).toBe(true);
    run.player.hp = run.player.maxHp;
    // Nothing kills the foes; make them harmless by freezing them far away.
    for (const e of run.enemies) e.stunT = 999;
    run.rift.timer = 0.2;
    step(run, 0.5);
    expect(run.rift.active).toBe(false);
    expect(run.player.hp).toBeCloseTo(run.player.maxHp * 0.3, 0);
    expect(run.rareSpawnEggs).toBe(0);
  });

  it('keeps the hero inside the arena wall', () => {
    const run = new RunState(7, 10);
    run.rift.portal = { x: run.player.x, y: run.player.y, left: 45 };
    step(run, 0.1);
    const input = new Still();
    input.dx = 1;
    step(run, 8, input);
    expect(Math.hypot(run.player.x, run.player.y)).toBeLessThanOrEqual((22 - 1) * 16);
  });
});

describe('interactables and hazards', () => {
  it('trader sells an item for 100 emeralds and refuses without them', () => {
    const run = new RunState(2, 10);
    spawnTrader(run);
    const trader = run.npcs.find((n) => n.kind === 'trader');
    expect(trader).toBeDefined();
    if (!trader) return;
    trader.state = 'idle';
    trader.x = run.player.x + 4;
    trader.y = run.player.y;
    trader.t = 2;
    step(run, 0.2);
    expect(run.item).toBeNull();
    run.emeraldsPicked = 130;
    trader.t = 2;
    step(run, 0.3);
    expect(run.item).not.toBeNull();
    expect(run.emeraldsPicked).toBe(30);
  });

  it('walking into an ore mines it and pays out', () => {
    const run = new RunState(11, 10);
    const ore = findProp(run, 'ore');
    run.player.x = ore.x - 4;
    run.player.y = ore.y;
    const before = run.emeraldsPicked + run.pickups.length + run.player.hp;
    step(run, 2);
    expect(run.world.isRemoved(ore)).toBe(true);
    expect(run.emeraldsPicked + run.pickups.length + run.player.hp).toBeGreaterThanOrEqual(
      before - 1,
    );
  });

  it('opening a chest gives emeralds', () => {
    const run = new RunState(13, 10);
    const chest = findProp(run, 'chest');
    run.player.x = chest.x;
    run.player.y = chest.y + 2;
    step(run, 0.5);
    expect(run.world.isRemoved(chest)).toBe(true);
    expect(run.emeraldsPicked).toBeGreaterThanOrEqual(4);
  });

  it('lava burns the hero in the desert but not elsewhere', () => {
    const run = new RunState(17, 3 * 240 + 10); // desert
    expect(run.biome()).toBe('desert');
    const lava = findTile(run.seed, TILE.LAVA);
    run.player.maxHp = run.player.hp = 500;
    run.player.x = lava.x;
    run.player.y = lava.y;
    step(run, 1.5);
    expect(run.player.hp).toBeLessThan(500);
    const plains = new RunState(17, 10);
    plains.player.maxHp = plains.player.hp = 500;
    plains.player.x = lava.x;
    plains.player.y = lava.y;
    step(plains, 1.5);
    expect(plains.player.hp).toBeGreaterThanOrEqual(499);
  });

  it('ice is slippery: the hero keeps sliding after the input stops', () => {
    const run = new RunState(19, 2 * 240 + 10); // snowy taiga: water is ice
    expect(BIOMES[run.biome()].iceWater).toBe(true);
    const ice = findTile(run.seed, TILE.WATER);
    run.player.x = ice.x;
    run.player.y = ice.y;
    const input = new Still();
    input.dx = 1;
    step(run, 0.5, input);
    const x0 = run.player.x;
    step(run, 0.3);
    expect(run.player.x - x0).toBeGreaterThan(3);
  });

  it('desert and taiga generate their own props', () => {
    let cactus = 0;
    let spruce = 0;
    for (let cy = -3; cy <= 3; cy++) {
      for (let cx = -3; cx <= 3; cx++) {
        cactus += genProps(cx, cy, 8, 'desert').filter((p) => p.kind === 'cactus').length;
        spruce += genProps(cx, cy, 8, 'snowy_taiga').filter(
          (p) => p.kind === 'tree' && p.variant % 8 === 3,
        ).length;
      }
    }
    expect(cactus).toBeGreaterThan(5);
    expect(spruce).toBeGreaterThan(5);
  });

  it('every enemy definition can be spawned and simulated for 20 s', () => {
    const run = new RunState(23, 700);
    run.player.maxHp = run.player.hp = 99999;
    const ids = [
      'zombie',
      'skeleton',
      'spider',
      'creeper',
      'slime_big',
      'cave_spider',
      'husk',
      'stray',
      'drowned',
      'enderman',
      'witch',
      'silverfish',
      'endermite',
      'phantom',
      'pillager',
      'vindicator',
      'evoker',
      'vex',
      'blaze',
      'magma_cube_medium',
      'piglin',
      'zombie_piglin',
      'hoglin',
      'wither_skeleton',
      'ghast',
      'guardian',
      'shulker',
      'vindicator_captain',
      'piglin_brute',
      'elder_guardian',
      'charged_creeper',
    ];
    ids.forEach((id, i) => {
      const e = makeEnemy(
        run,
        id,
        run.player.x + 70 + (i % 5) * 12,
        run.player.y + (i - 15) * 6,
        false,
      );
      expect(e, id).not.toBeNull();
      if (e) run.enemies.push(e);
    });
    step(run, 20);
    expect(Number.isFinite(run.player.x)).toBe(true);
    expect(run.player.hp).toBeLessThan(99999); // someone hit the hero
  });
});

function findProp(run: RunState, kind: string) {
  const found = run.world
    .propsInRect(-3000, -3000, 3000, 3000, 'plains')
    .find((p) => p.kind === kind && Math.hypot(p.x, p.y) > 150);
  if (!found) throw new Error(`no ${kind} found`);
  return found;
}

function findTile(seed: number, code: number): { x: number; y: number } {
  for (let r = 20; r < 400; r++) {
    for (let a = 0; a < 40; a++) {
      const tx = Math.round(Math.cos((a / 40) * Math.PI * 2) * r);
      const ty = Math.round(Math.sin((a / 40) * Math.PI * 2) * r);
      if (tileAt(tx, ty, seed) === code) return { x: tx * 16 + 8, y: ty * 16 + 8 };
    }
  }
  throw new Error(`no tile ${code}`);
}
