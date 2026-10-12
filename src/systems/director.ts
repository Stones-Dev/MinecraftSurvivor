/**
 * Run director: bosses (5:00, 10:00, 15:00), mini-bosses, Golden Hour, Raids, thunderstorms,
 * the victory at 15:00 and the Endless loop afterwards (BRIEF sections 7 and 10).
 */
import { ITEM_IDS } from '../data/items';
import { MINI_BOSSES } from '../data/enemies';
import type { Enemy } from '../entities/enemy';
import { boltPoints, makeFx } from '../entities/fx';
import type { RunState } from '../game';
import { damageEnemy, hurtPlayer } from './combat';
import { giveItem } from './items';
import { makeEnemy, ringPoint } from './spawner';

export const BOSS_SCHEDULE = [
  { at: 300, id: 'raid_captain' },
  { at: 600, id: 'wither' },
  { at: 900, id: 'warden' },
] as const;

/** After the Warden, a boss returns every 5 minutes with growing strength. */
const ENDLESS_FIRST = 1200;
const ENDLESS_EVERY = 300;

export class DirectorState {
  nextBoss = 0;
  endlessBoss = 0;
  minis: { at: number; id: string; done: boolean }[] = [];
  goldenAt = 0;
  goldenUntil = 0;
  raidAt = 0;
  raidUntil = 0;
  raidSpawnT = 0;
  bannerDone = false;
  /** Index of the boss the Parrot already warned about. */
  squawked = -1;
  /** Game time at which the next Endless boss arrives. */
  nextEndlessAt = ENDLESS_FIRST;
  raidAngle = 0;
  weatherCheckAt = 120;
  stormUntil = 0;
  strikeT = 0;
  /** Set by the rift/NPC modules. */
  riftAt = 75;
  traderAt = 0;
  villagerAt = 0;
}

export function initDirector(run: RunState): void {
  const d = run.director;
  const r = run.rng.events;
  d.minis = [
    { at: r.range(150, 270), id: r.pick(MINI_BOSSES), done: false },
    { at: r.range(340, 560), id: r.pick(MINI_BOSSES), done: false },
  ];
  d.goldenAt = r.range(180, 280);
  d.raidAt = r.range(230, 290);
  d.traderAt = r.range(200, 300);
  d.villagerAt = r.range(150, 240);
  // Starting mid-run (debug start time): skip what already passed.
  while (d.nextBoss < BOSS_SCHEDULE.length && (BOSS_SCHEDULE[d.nextBoss]?.at ?? 0) < run.time - 5)
    d.nextBoss++;
  for (const m of d.minis) if (m.at < run.time) m.done = true;
}

function spawnBoss(run: RunState, id: string, power: number): void {
  const e = makeEnemy(run, id, 0, 0, false);
  if (!e) return;
  const pt = ringPoint(run, run.rng.events.range(0, Math.PI * 2), e.radius);
  const p = run.player;
  e.x = pt ? pt.x : p.x + 200;
  e.y = pt ? pt.y : p.y;
  e.maxHp *= power;
  e.hp = e.maxHp;
  e.dmg *= 1 + (power - 1) * 0.5;
  e.cd = 2;
  run.enemies.push(e);
  run.announce(`${e.def.name} approaches!`, '#ff6b6b', 4);
  run.emit('boss');
}

/** Called when anything dies with a reward. */
export function onEnemyKilled(run: RunState, e: Enemy): void {
  if (e.riftFoe) return;
  if (e.boss === 'boss') {
    run.bossKills++;
    run.rareSpawnEggs++;
    giveItem(run, run.rng.drops.pick(ITEM_IDS));
    run.announce(`${e.def.name} defeated!`, '#ffd84a', 4);
    if (e.def.boss === 'warden' && !run.won) {
      run.won = true;
      run.director.nextEndlessAt = Math.max(ENDLESS_FIRST, run.time + 60);
      run.announce('NIGHT SURVIVED!', '#7dff9a', 6);
    }
  } else if (e.boss === 'mini') {
    run.miniKills++;
    run.spawnEggs++;
    if (run.rng.drops.chance(0.3)) giveItem(run, run.rng.drops.pick(ITEM_IDS));
  }
  if (e.banner) {
    run.emeraldsPicked += Math.round(run.rng.drops.range(12, 28) * run.mods.lootMult);
    if (run.rng.drops.chance(0.5)) giveItem(run, run.rng.drops.pick(ITEM_IDS));
    run.fx.push(
      makeFx('text', e.x, e.y - 30, 1.2, { text: 'Banner chest!', vy: -14, color: '#ffd84a' }),
    );
  }
}

function lightning(run: RunState, x: number, y: number): void {
  run.fx.push(
    makeFx('bolt', 0, 0, 0.35, {
      pts: boltPoints(x + 6, y - 150, x, y, 10, () => run.rng.fx.float()),
    }),
  );
  run.emit('explode');
  run.flash = 0.25;
  run.shake = Math.max(run.shake, 4);
  const r = 22;
  const p = run.player;
  if (!p.dead && Math.hypot(p.x - x, p.y - y) < r + p.radius) hurtPlayer(run, 30);
  for (const e of run.enemies) {
    if (e.dying || Math.hypot(e.x - x, e.y - y) > r + e.radius) continue;
    if (e.def.id === 'creeper' && !e.charged) {
      e.charged = true;
      e.maxHp *= 2;
      e.hp = e.maxHp;
      run.fx.push(
        makeFx('text', e.x, e.y - 20, 1, { text: 'Charged!', vy: -12, color: '#6ad0ff' }),
      );
    } else {
      damageEnemy(run, e, 60, x, y, 0);
    }
  }
}

export function updateDirector(run: RunState, dt: number): void {
  if (run.player.dead || run.rift.active) return;
  const d = run.director;
  const t = run.time;

  // Bosses.
  const next = BOSS_SCHEDULE[d.nextBoss];
  if (next && run.pet?.def.effect === 'parrot' && d.squawked !== d.nextBoss && t >= next.at - 3) {
    d.squawked = d.nextBoss;
    run.announce('SQUAWK! A boss is coming!', '#ff9a6a', 3);
  }
  if (next && t >= next.at) {
    spawnBoss(run, next.id, 1);
    d.nextBoss++;
  } else if (!next && run.won && t >= d.nextEndlessAt) {
    d.nextEndlessAt = t + ENDLESS_EVERY;
    const id = BOSS_SCHEDULE[d.endlessBoss % BOSS_SCHEDULE.length]?.id ?? 'warden';
    spawnBoss(run, id, 1 + 0.5 * (d.endlessBoss + 1));
    d.endlessBoss++;
  }
  const bossAlive = run.enemies.some((e) => e.boss === 'boss' && !e.dying);
  const endless = run.won ? 1 + Math.max(0, t - 900) / 600 : 1;
  run.spawnMult = (bossAlive ? 0.25 : 1) * endless;

  // Mini-bosses.
  for (const m of d.minis) {
    if (m.done || t < m.at) continue;
    m.done = true;
    const e = makeEnemy(run, m.id, 0, 0, false);
    if (!e) continue;
    const pt = ringPoint(run, run.rng.events.range(0, Math.PI * 2), e.radius);
    e.x = pt ? pt.x : run.player.x + 200;
    e.y = pt ? pt.y : run.player.y;
    e.cd = 1.5;
    run.enemies.push(e);
    run.announce(`${e.def.name} appears!`, '#ffb347', 3);
  }

  // Golden Hour: double XP and emeralds for 30 s.
  if (t >= d.goldenAt && d.goldenUntil <= t && !bossAlive) {
    d.goldenUntil = t + 30;
    d.goldenAt = t + run.rng.events.range(240, 360);
    run.announce('GOLDEN HOUR! Double XP and emeralds', '#ffd84a', 4);
    run.recomputeStats();
  } else if (d.goldenUntil > 0 && t >= d.goldenUntil) {
    d.goldenUntil = 0;
    run.recomputeStats();
  }

  // Raid: a 30 s horde from one side every 4-5 minutes; the banner carrier drops a chest.
  if (t >= d.raidAt && d.raidUntil <= t && !bossAlive) {
    d.raidUntil = t + 30;
    d.raidAt = t + run.rng.events.range(240, 300);
    d.raidAngle = run.rng.events.range(0, Math.PI * 2);
    d.bannerDone = false;
    d.raidSpawnT = 0;
    run.announce('RAID! Pillagers incoming', '#ff6b6b', 4);
    run.emit('hiss');
  }
  if (d.raidUntil > t) {
    d.raidSpawnT -= dt;
    if (d.raidSpawnT <= 0) {
      d.raidSpawnT = 1.6;
      const last = d.raidUntil - t < 3 && !d.bannerDone;
      for (let i = 0; i < 3; i++) {
        const id = run.rng.events.chance(0.6) ? 'pillager' : 'vindicator';
        const e = makeEnemy(run, id, 0, 0, false);
        const pt = ringPoint(run, d.raidAngle + run.rng.events.range(-0.5, 0.5), 6);
        if (!e || !pt) continue;
        e.x = pt.x;
        e.y = pt.y;
        if (last && i === 0) {
          d.bannerDone = true;
          e.banner = true;
          e.elite = true;
          e.maxHp *= 1.6;
          e.hp = e.maxHp;
        }
        run.enemies.push(e);
      }
    }
  }

  // Thunderstorms (rare): telegraphed lightning that hurts everyone; creepers hit become Charged.
  if (t >= d.weatherCheckAt) {
    d.weatherCheckAt = t + 60;
    if (d.stormUntil <= t && !bossAlive && run.rng.events.chance(0.12)) {
      d.stormUntil = t + 60;
      d.strikeT = 2;
      run.announce('Thunderstorm!', '#9fb4ff', 4);
    }
  }
  run.storm = d.stormUntil > t;
  run.chargedBonus = run.storm ? 0.03 : 0;
  if (run.storm) {
    d.strikeT -= dt;
    if (d.strikeT <= 0) {
      d.strikeT = run.rng.events.range(3.5, 6);
      const p = run.player;
      const onHero = run.rng.events.chance(0.25);
      const x = onHero ? p.x : p.x + run.rng.events.range(-120, 120);
      const y = onHero ? p.y : p.y + run.rng.events.range(-90, 90);
      run.telegraphs.push({ kind: 'circle', x, y, x2: 0, y2: 0, r: 22, t: 0, dur: 1.0 });
      run.later(1.0, () => lightning(run, x, y));
    }
  }
}
