import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import {
  chestIndexFromId,
  chestRng,
  chestTable,
  type LootDrop,
  resolveRangedWeapon,
  rollLoot,
} from '../src/data/lootTables';
import { Pickup } from '../src/entities/pickup';
import { Projectile } from '../src/entities/projectile';
import { RunState } from '../src/game';
import { updateProjectiles } from '../src/systems/combat';
import { updateInteract } from '../src/systems/interact';
import {
  ARROW_DMG,
  newPuzzle,
  newWire,
  POISON_DPS,
  POISON_S,
  PULL_DWELL_S,
  pullLever,
  stepWire,
  templeState,
  VOLLEY_ARROWS,
  VOLLEY_GAP_S,
  WIRE_CLICK_S,
  marksOrder,
  type WireEvent,
} from '../src/systems/jungleTemple';
import {
  BOGGED_DEFS,
  newTrial,
  stepTrial,
  trialState,
  WAVE_HP,
  WIND_R,
  WIND_TELE_S,
} from '../src/systems/trialChamber';
import {
  enemiesOf,
  isStructureEnemy,
  MAX_STRUCTURE_ENEMIES,
  spawnCount,
  spawnStructureEnemy,
  structureEnemyCount,
} from '../src/systems/structureEnemies';
import {
  badOmenLeft,
  BAD_OMEN_S,
  captiveReward,
  grantBadOmen,
  GUARD_DESPAWN_PX,
  heroLeft,
  HERO_S,
  newRaid,
  outpostRun,
  OUTPOST_CAPTAIN,
  RAID_BETWEEN_S,
  RAID_FORGET_PX,
  RAID_INTRO_S,
  RAID_WAVES,
  raidState,
  updatePillagerOutpost,
  stepRaid,
  type RaidEvent,
  waveSize,
} from '../src/systems/pillagerOutpost';
import {
  SERVICE_COST,
  serviceCost,
  structureStatusTags,
  updateVillageLife,
} from '../src/systems/structureInteract';
import { ENEMY_CAP, updateSpawner } from '../src/systems/spawner';
import { ACHIEVEMENT_BY_ID } from '../src/data/achievements';
import { MISSION_BY_ID } from '../src/data/missions';
import { biomeAtTile } from '../src/world/biomeMap';
import { defaultSave } from '../src/core/save';
import { evaluateAchievements } from '../src/systems/achievements';
import { applyRunToMissions, ensureMissions } from '../src/systems/missions';
import { mergeRunIntoSave } from '../src/systems/runStats';
import { isStructureId, startAtStructure } from '../src/systems/structureDebug';
import { STRUCTURE_BY_ID, STRUCTURE_DEFS } from '../src/world/structures/registry';
import { EDGE_MARGIN, StructureIndex } from '../src/world/structures';
import { MAT, materialName, materialBase, MATERIAL_COUNT } from '../src/world/blocks';
import { propPixels } from '../src/world/propSprites';
import { applyOverlay } from '../src/world/structures';
import { genChunkBiomes, genTerrain, tileAt, TILE } from '../src/world/terrain';
import { paintChunk } from '../src/world/tilePaint';
import { fightTrial, L1, L3 } from './helpers/trialFight';
import { killEnemy } from '../src/systems/combat';
import { updateEnemies } from '../src/systems/enemyAI';
import { makeEnemy } from '../src/systems/spawner';
import {
  applyPotion,
  CAULDRON_DWELL_S,
  GOOD_SHARE,
  hutRun,
  POTIONS,
  POISON_DPS as WITCH_POISON_DPS,
  REGEN_HP_PER_S,
  REGEN_S,
  regenLeft,
  rollPotion,
  SLOW_S,
} from '../src/systems/witchHut';
import { CAT_AURA_PX, CAT_KEEP_PX } from '../src/systems/structureEnemies';
import { MARK_ORDERS } from '../src/world/structureSprites';
import { MAX_WEAPON_LEVEL } from '../src/weapons';
import { MAX_WEAPONS } from '../src/data/upgrades';
import {
  findNearestStructure,
  type PlacedStructure,
  structuresInRect,
} from '../src/world/structures';
import type { StructureId } from '../src/world/structures';
import { TILE_PX } from '../src/world/terrain';
import { World } from '../src/world/world';

/** Seed with the nearest `id` closest to the start (the debug seeds of the screenshots). */
const SEED = { jungle_temple: 5, trial_chamber: 13, pillager_outpost: 31, witch_hut: 11 } as const;

function nearest(world: World, id: StructureId): PlacedStructure {
  const s = findNearestStructure(world, id, 0, 0, 40000);
  if (!s) throw new Error(`no ${id}`);
  return s;
}

/** The simulation without the spawner and the enemies: projectiles fly, then structure and interaction logic runs. */
function tick(run: RunState, dt: number): void {
  updateProjectiles(run, dt);
  updateInteract(run, dt);
}

function step(
  run: RunState,
  seconds: number,
  fn: (dt: number) => void = (dt) => tick(run, dt),
): void {
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n; i++) {
    run.time += 1 / 60;
    fn(1 / 60);
  }
}

function runAt(id: keyof typeof SEED): { run: RunState; s: PlacedStructure } {
  const run = new RunState(SEED[id], 0);
  const s = nearest(run.world, id);
  run.player.x = s.entryX;
  run.player.y = s.entryY;
  run.player.snap();
  run.baseMaxHp = 1000;
  run.recomputeStats();
  run.player.hp = run.player.maxHp;
  return { run, s };
}

describe('jungle temple: tripwire (pure)', () => {
  const play = (input: (t: number) => { crossed: boolean; cut: boolean }, seconds: number) => {
    const s = newWire();
    const log: { t: number; ev: WireEvent }[] = [];
    for (let i = 0; i < seconds * 60; i++) {
      const t = i / 60;
      for (const ev of stepWire(s, 1 / 60, input(t))) log.push({ t, ev });
    }
    return { s, log };
  };

  it('stays armed until crossed, clicks, then fires three arrows 0.15 s apart and is spent', () => {
    const idle = play(() => ({ crossed: false, cut: false }), 3);
    expect(idle.log).toEqual([]);
    expect(idle.s.phase).toBe('armed');
    const { s, log } = play((t) => ({ crossed: t >= 0.5, cut: false }), 3);
    const click = log.find((e) => e.ev.type === 'click');
    expect(click?.t).toBeCloseTo(0.5, 1);
    const fires = log.filter((e) => e.ev.type === 'fire');
    expect(fires).toHaveLength(VOLLEY_ARROWS);
    expect((fires[0]?.t ?? 0) - (click?.t ?? 0)).toBeGreaterThanOrEqual(WIRE_CLICK_S - 0.03);
    expect((fires[0]?.t ?? 0) - (click?.t ?? 0)).toBeLessThanOrEqual(WIRE_CLICK_S + 0.05);
    expect((fires[2]?.t ?? 0) - (fires[0]?.t ?? 0)).toBeCloseTo(2 * VOLLEY_GAP_S, 1);
    expect(log.filter((e) => e.ev.type === 'spent')).toHaveLength(1);
    expect(s.phase).toBe('spent');
    // One shot only: crossing again does nothing.
    expect(stepWire(s, 1, { crossed: true, cut: false })).toEqual([]);
  });

  it('is cut by a friendly projectile while armed or clicking, but not once the volley began', () => {
    const early = play((t) => ({ crossed: false, cut: t > 1 }), 2);
    expect(early.log.map((e) => e.ev.type)).toEqual(['cut']);
    const clicking = play((t) => ({ crossed: t >= 0, cut: t > 0.3 }), 2);
    expect(clicking.log.map((e) => e.ev.type)).toEqual(['click', 'cut']);
    const late = play((t) => ({ crossed: t >= 0, cut: t > 0.55 }), 2);
    expect(late.log.filter((e) => e.ev.type === 'fire')).toHaveLength(VOLLEY_ARROWS);
    expect(late.log.some((e) => e.ev.type === 'cut')).toBe(false);
  });
});

describe('jungle temple: lever puzzle (pure)', () => {
  it('solves in the plaque order, whatever the order is, and resets on a wrong pull', () => {
    for (const order of MARK_ORDERS) {
      const p = newPuzzle(order);
      const ev1 = pullLever(p, order[0] ?? 0);
      expect(ev1.map((e) => e.type)).toEqual(['pull']);
      // A wrong lever resets everything.
      const wrong = order[2] ?? 0;
      expect(pullLever(p, wrong).map((e) => e.type)).toEqual(['wrong']);
      expect(p.pulled).toEqual([]);
      for (const c of order.slice(0, 2)) pullLever(p, c);
      expect(p.solved).toBe(false);
      const last = pullLever(p, order[2] ?? 0);
      expect(last.map((e) => e.type)).toEqual(['pull', 'solved']);
      expect(p.solved).toBe(true);
      // Nothing happens after the solution.
      expect(pullLever(p, 0)).toEqual([]);
    }
  });

  it('ignores a lever that is already down and knows the six orders', () => {
    const p = newPuzzle([1, 0, 2]);
    pullLever(p, 1);
    expect(pullLever(p, 1)).toEqual([]);
    expect(p.pulled).toEqual([1]);
    expect(new Set(MARK_ORDERS.map((o) => o.join(','))).size).toBe(6);
    for (let v = 0; v < 6; v++) expect(marksOrder(v)).toEqual(MARK_ORDERS[v]);
  });
});

describe('jungle temple in a run', () => {
  it('has a plaque, three coloured levers, two dispenser pairs, a sealed chest room', () => {
    const { s } = runAt('jungle_temple');
    const kinds = (k: string): number => s.props.filter((p) => p.kind === k).length;
    expect(kinds('dispenser')).toBe(4);
    expect(kinds('lever')).toBe(3);
    expect(kinds('lever_on')).toBe(3);
    expect(kinds('color_marks')).toBe(1);
    expect(kinds('stone_door')).toBe(2);
    expect(kinds('chest_jungle')).toBe(1);
    expect(new Set(s.props.filter((p) => p.kind === 'lever').map((p) => p.variant)).size).toBe(3);
    // The dispensers face the corridor: the west one east, the east one west.
    for (const row of new Set(s.props.filter((p) => p.kind === 'dispenser').map((p) => p.y))) {
      const pair = s.props
        .filter((p) => p.kind === 'dispenser' && p.y === row)
        .sort((a, b) => a.x - b.x);
      expect(pair).toHaveLength(2);
      expect(pair[0]?.variant).toBe(0);
      expect(pair[1]?.variant).toBe(1);
    }
  });

  it('a tripwire clicks, fires three arrows at the hero, poisons, and fires once', () => {
    const { run, s } = runAt('jungle_temple');
    const t = (): NonNullable<ReturnType<typeof templeState>> => {
      const x = templeState(run, s.key);
      if (!x) throw new Error('temple not set up');
      return x;
    };
    step(run, 0.1);
    const wire = t().wires[0];
    expect(wire).toBeTruthy();
    if (!wire) return;
    const hp0 = run.player.hp;
    // Stand on the line, then step off it so the arrows have to travel.
    run.player.x = (wire.a.x + wire.b.x) / 2;
    run.player.y = wire.a.y;
    step(run, 0.1);
    expect(wire.state.phase).toBe('click');
    expect(run.events).toContain('click');
    expect(run.projectiles.filter((p) => !p.friendly)).toHaveLength(0);
    // Stay put: all three arrows hit.
    step(run, 1.2);
    expect(wire.state.phase).toBe('spent');
    expect(run.player.hp).toBeLessThan(hp0);
    expect(run.player.dotT).toBeGreaterThan(0);
    expect(run.player.dotKind).toBe('poison');
    expect(run.player.dotDps).toBeGreaterThanOrEqual(POISON_DPS);
    expect(run.player.dotT).toBeLessThanOrEqual(POISON_S + 0.01);
    expect(hp0 - run.player.hp).toBeGreaterThanOrEqual(ARROW_DMG * 0.9);
    expect(hp0 - run.player.hp).toBeLessThanOrEqual(ARROW_DMG * VOLLEY_ARROWS + 1);
    // Crossing again: nothing.
    run.player.dotT = 0;
    const hp1 = run.player.hp;
    run.player.x += 4;
    step(run, 1.2);
    expect(run.player.hp).toBe(hp1);
  });

  it('a friendly arrow through the line cuts the wire: the dispensers jam', () => {
    const { run, s } = runAt('jungle_temple');
    step(run, 0.1);
    const wire = templeState(run, s.key)?.wires[1];
    if (!wire) throw new Error('no wire');
    const mid = (wire.a.x + wire.b.x) / 2;
    const arrow = new Projectile(mid, wire.a.y + 2, 0, -200, 2, 5, 1, true, 1);
    arrow.px = mid;
    arrow.py = wire.a.y + 8;
    run.projectiles.push(arrow);
    step(run, 0.05);
    expect(wire.state.phase).toBe('cut');
    const hp = run.player.hp;
    run.player.x = mid;
    run.player.y = wire.a.y;
    step(run, 2);
    expect(run.player.hp).toBe(hp);
  });

  it('pulling the levers in the plaque order slides the door open; a wrong order resets with no damage', () => {
    const { run, s } = runAt('jungle_temple');
    step(run, 0.1);
    const marks = s.props.find((p) => p.kind === 'color_marks');
    const order = marksOrder(marks?.variant ?? 0);
    const levers = s.props.filter((p) => p.kind === 'lever');
    const at = (colour: number) => {
      const l = levers.find((x) => x.variant % 8 === colour);
      if (!l) throw new Error('lever');
      return l;
    };
    const pull = (colour: number): void => {
      const l = at(colour);
      run.player.x = l.x;
      run.player.y = l.y + 8;
      step(run, PULL_DWELL_S + 0.2);
    };
    const doors = s.props.filter((p) => p.kind === 'stone_door');
    const hp = run.player.hp;
    // Wrong first lever.
    const wrongFirst = [0, 1, 2].find((c) => c !== order[0]) ?? 0;
    pull(wrongFirst);
    expect(run.fx.some((f) => f.text === 'Wrong order!')).toBe(true);
    expect(run.player.hp).toBe(hp);
    for (const l of levers) expect(run.world.isRemoved(l)).toBe(false);
    for (const d of doors) expect(run.world.isRemoved(d)).toBe(false);
    // Now the right order: the first lever goes down (visual swap), the door stays shut until the last.
    pull(order[0] ?? 0);
    expect(run.world.isRemoved(at(order[0] ?? 0))).toBe(true);
    pull(order[1] ?? 0);
    for (const d of doors) expect(run.world.isRemoved(d)).toBe(false);
    pull(order[2] ?? 0);
    for (const d of doors) expect(run.world.isRemoved(d)).toBe(true);
    expect(run.banners.some((b) => b.text.includes('door'))).toBe(true);
  });

  it('opens the chest after the door: a ranged weapon card and emeralds, counted for the missions', () => {
    const { run, s } = runAt('jungle_temple');
    step(run, 0.1);
    const chest = s.props.find((p) => p.kind === 'chest_jungle');
    if (!chest) throw new Error('chest');
    run.player.x = chest.x + 9;
    run.player.y = chest.y;
    const before = run.weapons.map((w) => w.id);
    step(run, 0.1);
    expect(run.world.isRemoved(chest)).toBe(true);
    const after = run.weapons.map((w) => w.id);
    expect(after.length).toBe(before.length + 1);
    expect(['crossbow', 'trident']).toContain(after[after.length - 1]);
    expect(run.emeraldsPicked).toBeGreaterThanOrEqual(35);
    expect(run.stats.struct['chests']).toBe(1);
    expect(run.stats.struct['jungle']).toBe(1);
  });
});

describe('exotic ranged weapon card (pure)', () => {
  const st = (ids: string[], level = 1) => ({
    weapons: ids.map((id) => ({ id, level })),
    maxWeapons: MAX_WEAPONS,
    maxWeaponLevel: MAX_WEAPON_LEVEL,
  });

  it('gives a new crossbow or trident, else raises a ranged weapon, else any weapon, else emeralds', () => {
    const rng = new Rng(3);
    const a = resolveRangedWeapon(st(['sword']), rng);
    expect(a.kind).toBe('weapon');
    // Owning the crossbow gives the trident; owning both raises one of them.
    expect(resolveRangedWeapon(st(['sword', 'crossbow']), rng)).toEqual({
      kind: 'weapon',
      id: 'trident',
    });
    const b = resolveRangedWeapon(st(['sword', 'crossbow', 'trident']), rng);
    expect(b.kind).toBe('upgrade');
    if (b.kind === 'upgrade') expect([1, 2]).toContain(b.index);
    // No free slot: raise the bow before the sword.
    expect(resolveRangedWeapon(st(['sword', 'bow', 'axe', 'tnt']), rng)).toEqual({
      kind: 'upgrade',
      index: 1,
    });
    expect(resolveRangedWeapon(st(['sword', 'axe', 'tnt', 'poison']), rng).kind).toBe('upgrade');
    const maxed = {
      weapons: [{ id: 'sword', level: MAX_WEAPON_LEVEL }],
      maxWeapons: 1,
      maxWeaponLevel: MAX_WEAPON_LEVEL,
    };
    expect(resolveRangedWeapon(maxed, rng)).toEqual({ kind: 'emeralds', n: 40 });
  });

  it('the jungle chest always holds the card and 35-65 emeralds, seeded per chest', () => {
    for (let seed = 0; seed < 40; seed++) {
      const d: LootDrop[] = rollLoot('jungle_chest', new Rng(seed));
      expect(d).toContainEqual({ kind: 'rangedWeapon' });
      const n = d.reduce((a, x) => a + (x.kind === 'emeralds' ? x.n : 0), 0);
      expect(n).toBeGreaterThanOrEqual(35);
      expect(n).toBeLessThanOrEqual(65);
    }
    expect(chestTable('chest_jungle', 0)).toBe('jungle_chest');
    expect(chestTable('vault', 0)).toBe('trial_vault');
    expect(chestTable('chest_legendary', 0)).toBe('legendary_chest');
    expect(rollLoot('jungle_chest', chestRng(5, 's:jungle_temple@1,2:0'))).toEqual(
      rollLoot('jungle_chest', chestRng(5, 's:jungle_temple@1,2:0')),
    );
    expect(chestIndexFromId('s:jungle_temple@1,2:7')).toBe(7);
  });
});

describe('trial chamber: state machine (pure)', () => {
  it('idle -> fight when the hero is in the hall -> key when the wave is gone -> done at the vault with the key', () => {
    const s = newTrial();
    const no = { inside: false, alive: 0, haveKey: false, atVault: false };
    expect(stepTrial(s, 1, no)).toEqual([]);
    expect(stepTrial(s, 1, { ...no, atVault: true })).toEqual([{ type: 'locked', why: 'trial' }]);
    expect(stepTrial(s, 0.1, { ...no, inside: true, alive: 8 })).toEqual([{ type: 'start' }]);
    expect(s.phase).toBe('fight');
    // The fight cannot end in its first moments, and not while enemies stand.
    expect(stepTrial(s, 0.1, { ...no, alive: 0 })).toEqual([]);
    expect(stepTrial(s, 1, { ...no, alive: 3 })).toEqual([]);
    expect(stepTrial(s, 0.1, { ...no, alive: 0 })).toEqual([{ type: 'cleared' }]);
    expect(s.phase).toBe('key');
    expect(stepTrial(s, 1, { ...no, atVault: true })).toEqual([{ type: 'locked', why: 'key' }]);
    expect(stepTrial(s, 1, { ...no, atVault: true, haveKey: true })).toEqual([{ type: 'vault' }]);
    expect(s.phase).toBe('done');
    expect(stepTrial(s, 1, { inside: true, alive: 0, haveKey: true, atVault: true })).toEqual([]);
  });
});

describe('structure enemies', () => {
  it('are bounded, tagged, and do not count against the spawner cap', () => {
    const { run } = runAt('trial_chamber');
    const p = run.player;
    let n = 0;
    for (let i = 0; i < MAX_STRUCTURE_ENEMIES + 5; i++)
      if (spawnStructureEnemy(run, 'skeleton', p.x + i, p.y, 'owner', 'x')) n++;
    expect(n).toBe(MAX_STRUCTURE_ENEMIES);
    expect(structureEnemyCount(run)).toBe(MAX_STRUCTURE_ENEMIES);
    expect(run.enemies.every((e) => isStructureEnemy(e))).toBe(true);
    expect(spawnCount(run)).toBe(0);
    expect(spawnStructureEnemy(run, 'nope', 0, 0, 'owner', 'x')).toBeNull();
    // The trickle and tides still fill the normal cap on top of them.
    run.time = 200;
    for (let i = 0; i < 60 * 60 && spawnCount(run) < ENEMY_CAP - 2; i++) {
      run.time += 1 / 60;
      updateSpawner(run, 1 / 60);
    }
    expect(spawnCount(run)).toBeGreaterThanOrEqual(ENEMY_CAP - 2);
    expect(run.enemies.length).toBeGreaterThan(ENEMY_CAP - 2 + MAX_STRUCTURE_ENEMIES - 1);
    // Far from the hero they are not recycled onto the spawn ring.
    const e = run.enemies.find((x) => isStructureEnemy(x));
    if (!e) throw new Error('no structure enemy');
    e.x += 5000;
    const x = e.x;
    for (let i = 0; i < 60 * 4; i++) updateSpawner(run, 1 / 60);
    expect(e.x).toBe(x);
  });
});

describe('trial chamber in a run', () => {
  /** Put the hero in the hall (two tiles inside the north door) and run the structure logic. */
  function start(): { run: RunState; s: PlacedStructure } {
    const ctx = runAt('trial_chamber');
    const { run, s } = ctx;
    step(run, 0.1); // the doors open, the key is hidden
    run.player.x = (s.tx + 9) * TILE_PX;
    run.player.y = (s.ty + 5.5) * TILE_PX;
    return ctx;
  }

  it('is idle with open doors until the hero walks in; then seals both doors and spawns 6 bogged and 2 breezes', () => {
    const { run, s } = runAt('trial_chamber');
    step(run, 0.1);
    const bars = s.props.filter((p) => p.kind === 'copper_bars');
    expect(bars).toHaveLength(4);
    for (const b of bars) expect(run.world.isRemoved(b)).toBe(true);
    expect(run.world.isRemoved(s.props.find((p) => p.kind === 'trial_key') ?? bars[0]!)).toBe(true);
    // The doorway is open now: the entry tile leads into the hall.
    expect(structureEnemyCount(run)).toBe(0);
    run.player.x = (s.tx + 9) * TILE_PX;
    run.player.y = (s.ty + 5.5) * TILE_PX;
    step(run, 0.1);
    const ts = trialState(run, s.key);
    expect(ts?.state.phase).toBe('fight');
    for (const b of bars) expect(run.world.isRemoved(b)).toBe(false);
    const wave = enemiesOf(run, s.key);
    expect(wave).toHaveLength(8);
    expect(enemiesOf(run, s.key, 'bogged')).toHaveLength(6);
    expect(enemiesOf(run, s.key, 'breeze')).toHaveLength(2);
    const ids = enemiesOf(run, s.key, 'bogged').map((e) => e.def.id);
    expect(ids.sort()).toEqual([...BOGGED_DEFS].sort());
    for (const e of wave) {
      expect(e.stunT).toBeGreaterThan(0);
      expect(e.maxHp).toBeGreaterThan(0);
    }
    expect(spawnCount(run)).toBe(0);
    expect(wave[0]?.maxHp).toBeCloseTo(
      (wave[0]?.def.hp ?? 0) *
        (1 + 0.12 * (run.time / 60)) *
        (wave[0]?.def.id === 'spider' ? WAVE_HP * 1.6 : WAVE_HP),
      0,
    );
    // The doors really are closed: nobody walks out through the north door while it lasts.
    const door = { x: (s.tx + 8.5) * TILE_PX, y: (s.ty + 1.5) * TILE_PX };
    const r = run.world.collide(door.x, door.y, 5);
    expect(Math.hypot(r.x - door.x, r.y - door.y)).toBeGreaterThan(2);
  });

  it('beating the wave opens the doors, ejects the key, and the key opens the vault for a big haul', () => {
    const { run, s } = start();
    step(run, 0.1);
    const ts = trialState(run, s.key);
    expect(ts?.state.phase).toBe('fight');
    const kills0 = run.kills;
    for (const e of enemiesOf(run, s.key)) killEnemy(run, e, true);
    expect(run.kills).toBe(kills0 + 8);
    // Without the key the vault stays shut and says so.
    const vault = s.props.find((p) => p.kind === 'vault');
    const key = s.props.find((p) => p.kind === 'trial_key');
    if (!vault || !key) throw new Error('vault or key');
    step(run, 0.5);
    expect(ts?.state.phase).toBe('key');
    for (const b of s.props.filter((p) => p.kind === 'copper_bars'))
      expect(run.world.isRemoved(b)).toBe(true);
    expect(run.world.isRemoved(key)).toBe(false);
    run.player.x = vault.x + 12;
    run.player.y = vault.y + 6;
    step(run, 0.3);
    expect(run.world.isRemoved(vault)).toBe(false);
    expect(run.fx.some((f) => f.text === 'Needs the Trial Key')).toBe(true);
    // Take the key, then the vault.
    run.player.x = key.x;
    run.player.y = key.y;
    step(run, 0.1);
    expect(run.world.isRemoved(key)).toBe(true);
    expect(ts?.haveKey).toBe(true);
    run.player.x = vault.x + 11;
    run.player.y = vault.y + 6;
    const egg = run.rareSpawnEggs;
    const offers = run.bonusOffers;
    step(run, 0.2);
    expect(run.world.isRemoved(vault)).toBe(true);
    expect(ts?.state.phase).toBe('done');
    expect(run.emeraldsPicked).toBeGreaterThanOrEqual(70);
    expect(run.rareSpawnEggs).toBe(egg + 1);
    expect(run.bonusOffers).toBe(offers + 1);
    // The vault's burst is eight orbs already flying to the hero (kill drops lie where the mobs died).
    const orbs = run.pickups.filter((x: Pickup) => x.kind === 'xp' && x.magnet);
    expect(orbs).toHaveLength(8);
    const xp = orbs.reduce((a, x) => a + x.value, 0);
    expect(xp).toBeCloseTo(run.xpNeeded(), 3);
    expect(run.item ?? run.pendingItem).toBeTruthy();
    expect(run.stats.struct['trial']).toBe(1);
    expect(run.stats.struct['chests']).toBe(1);
  });

  it('a breeze telegraphs a wind burst, then damages and shoves a hero standing in it', () => {
    const { run, s } = start();
    step(run, 0.1);
    const breeze = enemiesOf(run, s.key, 'breeze')[0];
    if (!breeze) throw new Error('breeze');
    // Freeze the rest so only the burst is measured.
    for (const e of enemiesOf(run, s.key)) e.stunT = 99;
    breeze.stunT = 0;
    run.player.x = breeze.x + 60;
    run.player.y = breeze.y;
    const hp = run.player.hp;
    let tele = false;
    for (let i = 0; i < 60 * 12 && !tele; i++) {
      step(run, 1 / 60);
      tele = run.telegraphs.some((t) => t.kind === 'circle' && t.r === WIND_R);
    }
    expect(tele).toBe(true);
    expect(run.player.hp).toBe(hp);
    const before = { x: run.player.x, y: run.player.y };
    const burst = run.telegraphs.find((t) => t.kind === 'circle' && t.r === WIND_R);
    // The hero stands on the telegraphed spot (he did not move): the burst hurts and shoves him off it.
    expect(burst && Math.hypot(burst.x - before.x, burst.y - before.y)).toBeLessThan(WIND_R);
    step(run, WIND_TELE_S + 0.1);
    expect(run.player.hp).toBeLessThan(hp);
    expect(Math.hypot(run.player.x - before.x, run.player.y - before.y)).toBeGreaterThan(5);
  });
});

describe('trial chamber containment (wind bursts cannot throw the hero out)', () => {
  /** Inside the hall rectangle (blueprint tiles 2..15), the hero's centre in px. */
  const inHall = (run: RunState, s: PlacedStructure): boolean =>
    run.player.x >= (s.tx + 2) * TILE_PX &&
    run.player.x < (s.tx + 16) * TILE_PX &&
    run.player.y >= (s.ty + 2) * TILE_PX &&
    run.player.y < (s.ty + 16) * TILE_PX;

  it('a burst that would push the hero through the 1-tile ring wall stops at the wall', () => {
    for (const side of ['north', 'west', 'east', 'south'] as const) {
      const { run, s } = runAt('trial_chamber');
      step(run, 0.1);
      run.player.x = (s.tx + 9) * TILE_PX;
      run.player.y = (s.ty + 5.5) * TILE_PX;
      step(run, 0.1);
      const breeze = enemiesOf(run, s.key, 'breeze')[0];
      if (!breeze) throw new Error('breeze');
      for (const e of enemiesOf(run, s.key)) e.stunT = 99;
      breeze.stunT = 0;
      // The hero hugs the wall; the breeze stands on the inner side, so the shove points into the wall.
      const cx = (s.tx + 5.5) * TILE_PX;
      const cy = (s.ty + 5.5) * TILE_PX;
      const near = 7;
      const [hx, hy, bx, by] =
        side === 'north'
          ? [cx, (s.ty + 2) * TILE_PX + near, cx, (s.ty + 2) * TILE_PX + near + 40]
          : side === 'south'
            ? [cx, (s.ty + 16) * TILE_PX - near, cx, (s.ty + 16) * TILE_PX - near - 40]
            : side === 'west'
              ? [(s.tx + 2) * TILE_PX + near, cy, (s.tx + 2) * TILE_PX + near + 40, cy]
              : [(s.tx + 16) * TILE_PX - near, cy, (s.tx + 16) * TILE_PX - near - 40, cy];
      breeze.x = bx;
      breeze.y = by;
      run.player.x = hx;
      run.player.y = hy;
      let bursts = 0;
      for (let i = 0; i < 60 * 40 && bursts < 2; i++) {
        const tele = run.telegraphs.length;
        step(run, 1 / 60);
        if (tele > 0 && run.telegraphs.length === 0) bursts++;
        // Keep the hero hugging the wall and the breeze where it is for the next burst.
        run.player.hp = run.player.maxHp;
        breeze.x = bx;
        breeze.y = by;
        expect(inHall(run, s)).toBe(true);
        if (bursts === 0 && i % 30 === 0) {
          run.player.x = hx;
          run.player.y = hy;
        }
      }
      expect(bursts, side).toBeGreaterThan(0);
      expect(trialState(run, s.key)?.state.phase).toBe('fight');
    }
  });

  it('puts a hero who somehow got out back into the hall while the doors are barred', () => {
    const { run, s } = runAt('trial_chamber');
    step(run, 0.1);
    run.player.x = (s.tx + 9) * TILE_PX;
    run.player.y = (s.ty + 5.5) * TILE_PX;
    step(run, 0.1);
    expect(trialState(run, s.key)?.state.phase).toBe('fight');
    run.player.x = (s.tx + 9) * TILE_PX;
    run.player.y = (s.ty - 3) * TILE_PX; // outside, north of the ring
    step(run, 0.1);
    expect(inHall(run, s)).toBe(true);
    expect(trialState(run, s.key)?.state.phase).toBe('fight');
  });

  it('a sword bot never strands the trial on seeds 1..30', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const r = fightTrial(seed, L1, 0, { dodge: false, maxSeconds: 90, contain: true });
      expect(r.escaped, `seed ${seed}`).toBe(false);
    }
  });
});

describe('raid (pure)', () => {
  const drive = (
    inputs: (t: number) => { omen: boolean; inVillage: boolean; far: boolean; alive: number },
    seconds: number,
  ) => {
    const s = newRaid();
    const log: { t: number; ev: RaidEvent }[] = [];
    for (let i = 0; i < seconds * 10; i++) {
      const t = i / 10;
      for (const ev of stepRaid(s, 0.1, inputs(t))) log.push({ t, ev });
    }
    return { s, log };
  };

  it('needs Bad Omen and a village to start; then three waves; then won', () => {
    const idle = drive(() => ({ omen: false, inVillage: true, far: false, alive: 0 }), 20);
    expect(idle.log).toEqual([]);
    expect(drive(() => ({ omen: true, inVillage: false, far: false, alive: 0 }), 20).log).toEqual(
      [],
    );
    const r = newRaid();
    const inp = { omen: true, inVillage: true, far: false, alive: 0 };
    expect(stepRaid(r, 0.1, inp)).toEqual([{ type: 'start' }]);
    expect(stepRaid(r, RAID_INTRO_S, inp)).toEqual([{ type: 'wave', wave: 0 }]);
    // Alive raiders keep the wave going.
    expect(stepRaid(r, 5, { ...inp, alive: 2 })).toEqual([]);
    expect(stepRaid(r, 5, inp)).toEqual([]);
    expect(r.phase).toBe('between');
    expect(stepRaid(r, RAID_BETWEEN_S, inp)).toEqual([{ type: 'wave', wave: 1 }]);
    stepRaid(r, 2, inp);
    expect(stepRaid(r, RAID_BETWEEN_S, inp)).toEqual([{ type: 'wave', wave: 2 }]);
    expect(stepRaid(r, 2, inp)).toEqual([{ type: 'won' }]);
    expect(stepRaid(r, 2, { ...inp, far: true })).toEqual([]);
  });

  it('fails when the hero leaves, and waves stay small (the biggest holds a Ravager, 16 alive at most)', () => {
    const r = newRaid();
    const inp = { omen: true, inVillage: true, far: false, alive: 4 };
    stepRaid(r, 0.1, inp);
    expect(stepRaid(r, 0.1, { ...inp, far: true })).toEqual([{ type: 'failed' }]);
    expect(stepRaid(r, 5, inp)).toEqual([]);
    expect(RAID_WAVES).toHaveLength(3);
    for (const w of RAID_WAVES) expect(waveSize(w)).toBeLessThanOrEqual(8);
    expect(RAID_WAVES.reduce((a, w) => a + w.ravager, 0)).toBe(1);
    expect(MAX_STRUCTURE_ENEMIES).toBeGreaterThanOrEqual(Math.max(...RAID_WAVES.map(waveSize)));
  });
});

describe('pillager outpost in a run', () => {
  it('spawns its guards (4-6 Pillagers and a banner Captain) when the hero comes near; they hold their posts', () => {
    const { run, s } = runAt('pillager_outpost');
    run.player.x = s.cx + 300;
    run.player.y = s.cy;
    step(run, 0.1);
    const markers = s.blueprint.actors;
    expect(markers.filter((a) => a.role === 'pillager').length).toBeGreaterThanOrEqual(4);
    expect(markers.filter((a) => a.role === 'pillager').length).toBeLessThanOrEqual(6);
    expect(markers.filter((a) => a.role === 'captain')).toHaveLength(1);
    const pillagers = enemiesOf(run, s.key, 'pillager');
    const captain = enemiesOf(run, s.key, 'captain')[0];
    expect(pillagers).toHaveLength(markers.filter((a) => a.role === 'pillager').length);
    expect(captain?.banner).toBe(true);
    expect(captain?.def.id).toBe(OUTPOST_CAPTAIN.id);
    expect(captain?.def.sprite).toBe('mob.pillager_captain');
    expect(pillagers.every((e) => e.def.id === 'pillager' && !e.banner)).toBe(true);
    // Unprovoked guards stay where they stand, whatever the AI wants.
    const before = [...pillagers, ...(captain ? [captain] : [])].map((e) => [e.x, e.y]);
    step(run, 3, (dt) => {
      for (const e of run.enemies) {
        e.x += 3;
        e.y -= 2;
      }
      updateInteract(run, dt);
    });
    expect([...pillagers, ...(captain ? [captain] : [])].map((e) => [e.x, e.y])).toEqual(before);
    // Hurt one: the whole post wakes up for that one (it may move now).
    const hit = pillagers[0];
    if (!hit) return;
    hit.hp -= 1;
    step(run, 0.1);
    for (const e of run.enemies) e.x += 3;
    step(run, 0.1);
    expect(hit.x).not.toBe(before[0]?.[0]);
  });

  it('does not count the guards against the spawn cap, forgets nobody it killed, and clears when far', () => {
    const { run, s } = runAt('pillager_outpost');
    step(run, 0.1);
    const total = enemiesOf(run, s.key).length;
    expect(total).toBeGreaterThanOrEqual(5);
    expect(spawnCount(run)).toBe(0);
    const victim = enemiesOf(run, s.key, 'pillager')[0];
    if (!victim) throw new Error('victim');
    killEnemy(run, victim, true);
    step(run, 0.1);
    run.player.x = s.cx + GUARD_DESPAWN_PX + 200;
    step(run, 0.1);
    expect(enemiesOf(run, s.key)).toHaveLength(0);
    run.player.x = s.cx;
    step(run, 0.1);
    expect(enemiesOf(run, s.key)).toHaveLength(total - 1);
  });

  it('killing the Captain pays the banner chest and gives Bad Omen for 180 s (a HUD tag)', () => {
    const { run, s } = runAt('pillager_outpost');
    step(run, 0.1);
    const captain = enemiesOf(run, s.key, 'captain')[0];
    if (!captain) throw new Error('captain');
    expect(badOmenLeft(run)).toBe(0);
    expect(structureStatusTags(run)).toEqual([]);
    const gold = run.emeraldsPicked;
    killEnemy(run, captain, true);
    step(run, 0.1);
    expect(run.emeraldsPicked).toBeGreaterThan(gold); // the banner chest of director.ts
    expect(badOmenLeft(run)).toBeGreaterThan(BAD_OMEN_S - 1);
    expect(structureStatusTags(run).map((t) => t.text)).toEqual(['Bad Omen']);
    step(run, BAD_OMEN_S + 1);
    expect(badOmenLeft(run)).toBe(0);
    expect(structureStatusTags(run)).toEqual([]);
  });

  it('the cage frees a captive Toucan or Bat as a run-only pet, or an egg when the pet slot is taken', () => {
    expect(captiveReward(false)).toBe('pet');
    expect(captiveReward(true)).toBe('egg');
    {
      const { run, s } = runAt('pillager_outpost');
      step(run, 0.1);
      const cage = s.props.find((p) => p.kind === 'cage');
      const open = s.props.find((p) => p.kind === 'cage_open');
      if (!cage || !open) throw new Error('cage');
      expect(run.world.isRemoved(open)).toBe(true);
      expect(run.loadout.pet).toBeNull();
      run.player.x = cage.x + 14;
      run.player.y = cage.y;
      step(run, 0.5);
      expect(run.world.isRemoved(cage)).toBe(false);
      step(run, 0.7);
      expect(run.world.isRemoved(cage)).toBe(true);
      expect(run.world.isRemoved(open)).toBe(false);
      expect(['toucan', 'bat']).toContain(run.loadout.pet?.id);
      expect(run.pet?.def.id).toBe(run.loadout.pet?.id);
      expect(run.pet?.def.hover).toBe(true);
    }
    {
      const { run, s } = runAt('pillager_outpost');
      run.loadout.pet = { id: 'wisp', level: 1 };
      step(run, 0.1);
      const cage = s.props.find((p) => p.kind === 'cage');
      if (!cage) throw new Error('cage');
      run.player.x = cage.x + 14;
      run.player.y = cage.y;
      const eggs = run.spawnEggs;
      step(run, 1.2);
      expect(run.spawnEggs).toBe(eggs + 1);
      expect(run.loadout.pet?.id).toBe('wisp');
    }
    {
      // Walking past is free.
      const { run, s } = runAt('pillager_outpost');
      step(run, 0.1);
      const cage = s.props.find((p) => p.kind === 'cage');
      if (!cage) throw new Error('cage');
      for (let i = 0; i < 20; i++) {
        run.player.x = cage.x + 60 - i * 6;
        run.player.y = cage.y + 30;
        step(run, 0.1);
      }
      expect(run.world.isRemoved(cage)).toBe(false);
    }
  });
});

describe('raid bookkeeping stays small and cheap', () => {
  function village(): { run: RunState; v: PlacedStructure } {
    const run = new RunState(11, 0);
    const v = nearest(run.world, 'village');
    run.player.x = v.entryX;
    run.player.y = v.entryY;
    run.player.snap();
    return { run, v };
  }

  /** `run.enemies` that counts how often it is iterated (one full scan of the enemies per count). */
  function countScans(run: RunState): () => number {
    const arr: RunState['enemies'] = [];
    let n = 0;
    const iter = arr[Symbol.iterator].bind(arr);
    arr[Symbol.iterator] = () => {
      n++;
      return iter();
    };
    run.enemies = arr;
    return () => n;
  }

  it('does not scan the enemies for an idle, won or failed raid', () => {
    const { run, v } = village();
    step(run, 0.1);
    expect(raidState(run, v.key)?.phase).toBe('idle');
    const scans = countScans(run);
    for (let i = 0; i < 30; i++) updatePillagerOutpost(run, 1 / 60);
    expect(scans()).toBe(0);
  });

  it('drops an idle raid when the hero is far away and rebuilds it on return; a won raid stays', () => {
    const { run, v } = village();
    step(run, 0.1);
    expect(raidState(run, v.key)).toBeDefined();
    const far = { x: v.cx + RAID_FORGET_PX + 400, y: v.cy };
    run.player.x = far.x;
    run.player.y = far.y;
    run.player.snap();
    step(run, 0.5);
    expect(raidState(run, v.key)).toBeUndefined();
    run.player.x = v.entryX;
    run.player.y = v.entryY;
    step(run, 0.5);
    expect(raidState(run, v.key)?.phase).toBe('idle');
    // A finished raid keeps its result however far the hero goes (no second raid, the chest stays out).
    const r = raidState(run, v.key);
    if (!r) throw new Error('raid');
    r.phase = 'won';
    run.player.x = far.x;
    run.player.y = far.y;
    step(run, 0.5);
    expect(raidState(run, v.key)?.phase).toBe('won');
  });

  it('the raid map does not grow with every village the hero walks past', () => {
    const run = new RunState(11, 0);
    let maxKept = 0;
    for (let i = 0; i < 40; i++) {
      run.player.x = i * 700;
      run.player.y = (i % 5) * 300;
      run.player.snap();
      step(run, 0.3);
      // Only villages within reach of the hero are kept.
      let kept = 0;
      for (const v of structuresInRect(run.world, -1000, -1000, 40 * 700 + 1000, 2500))
        if (v.def.id === 'village' && raidState(run, v.key)) kept++;
      maxKept = Math.max(maxKept, kept);
    }
    expect(maxKept).toBeLessThan(8);
  });
});

describe('raid on a village and Hero of the Village', () => {
  function village(): { run: RunState; v: PlacedStructure } {
    const run = new RunState(11, 0);
    const v = nearest(run.world, 'village');
    run.player.x = v.entryX;
    run.player.y = v.entryY;
    run.player.snap();
    run.baseMaxHp = 5000;
    run.recomputeStats();
    run.player.hp = run.player.maxHp;
    return { run, v };
  }

  it('without Bad Omen a village is just a village', () => {
    const { run, v } = village();
    step(run, 2);
    expect(raidState(run, v.key)?.phase).toBe('idle');
    expect(enemiesOf(run, v.key)).toHaveLength(0);
    // The legendary chest is stamped but hidden.
    const chest = v.props.find((p) => p.kind === 'chest_legendary');
    expect(chest).toBeTruthy();
    expect(chest && run.world.isRemoved(chest)).toBe(true);
  });

  it('Bad Omen + entering the village starts a 3-wave raid; clearing it gives Hero of the Village', () => {
    const { run, v } = village();
    step(run, 0.1);
    grantBadOmen(run);
    run.player.x = v.cx;
    run.player.y = v.cy + 40;
    step(run, 0.2);
    expect(raidState(run, v.key)?.phase).toBe('intro');
    expect(badOmenLeft(run)).toBe(0); // the omen is spent
    step(run, RAID_INTRO_S + 0.3);
    let max = 0;
    for (let wave = 0; wave < RAID_WAVES.length; wave++) {
      const raiders = enemiesOf(run, v.key, 'raider');
      const w = RAID_WAVES[wave];
      if (!w) throw new Error('wave');
      expect(raiders.length, `wave ${wave}`).toBeGreaterThan(0);
      expect(raiders.length).toBeLessThanOrEqual(waveSize(w));
      expect(raiders.filter((e) => e.def.id === 'hoglin')).toHaveLength(w.ravager);
      max = Math.max(max, structureEnemyCount(run, true));
      expect(spawnCount(run)).toBe(0);
      for (const e of raiders) killEnemy(run, e, true);
      step(run, wave + 1 < RAID_WAVES.length ? 1.5 + RAID_BETWEEN_S : 1.5);
    }
    expect(max).toBeLessThanOrEqual(MAX_STRUCTURE_ENEMIES);
    expect(raidState(run, v.key)?.phase).toBe('won');
    expect(heroLeft(run)).toBeGreaterThan(HERO_S - 5);
    expect(structureStatusTags(run).map((t) => t.text)).toContain('Hero');
    expect(run.stats.struct['hero']).toBe(1);
    // The legendary chest is in the plaza now, and holds strong loot.
    const chest = v.props.find((p) => p.kind === 'chest_legendary');
    if (!chest) throw new Error('chest');
    expect(run.world.isRemoved(chest)).toBe(false);
    run.player.x = chest.x + 9;
    run.player.y = chest.y;
    const eggs = run.rareSpawnEggs;
    step(run, 0.1);
    expect(run.world.isRemoved(chest)).toBe(true);
    expect(run.rareSpawnEggs).toBe(eggs + 1);
    expect(run.bonusOffers).toBeGreaterThanOrEqual(2);
    expect(run.emeraldsPicked).toBeGreaterThanOrEqual(90);
    // Services cost half while the buff lasts, and full price after it.
    expect(serviceCost(run, SERVICE_COST.smith)).toBe(30);
    expect(serviceCost(run, SERVICE_COST.cleric)).toBe(13);
    step(run, HERO_S + 1);
    expect(serviceCost(run, SERVICE_COST.smith)).toBe(60);
    expect(structureStatusTags(run)).toEqual([]);
  });

  it('Hero of the Village halves what the Blacksmith charges, in the real service code', () => {
    const { run, v } = village();
    step(run, 0.1);
    grantBadOmen(run);
    run.player.x = v.cx;
    run.player.y = v.cy + 40;
    step(run, RAID_INTRO_S + 0.5);
    for (let i = 0; i < 3; i++) {
      for (const e of enemiesOf(run, v.key, 'raider')) killEnemy(run, e, true);
      step(run, 2 + RAID_BETWEEN_S);
    }
    expect(heroLeft(run)).toBeGreaterThan(0);
    updateVillageLife(run, 0.6);
    const smith = run.npcs.find((n) => n.kind === 'smith');
    if (!smith) throw new Error('smith');
    run.emeraldsPicked = 100;
    run.player.x = smith.x;
    run.player.y = smith.y + 10;
    const life = (dt: number): void => updateVillageLife(run, dt);
    step(run, 1, life);
    expect(run.emeraldsPicked).toBe(100 - 30);
    expect(run.weapons[0]?.level).toBe(2);
  });

  it('a raid is abandoned when the hero leaves the village: raiders vanish, no Hero', () => {
    const { run, v } = village();
    step(run, 0.1);
    grantBadOmen(run);
    run.player.x = v.cx;
    run.player.y = v.cy + 40;
    step(run, RAID_INTRO_S + 0.5);
    expect(enemiesOf(run, v.key, 'raider').length).toBeGreaterThan(0);
    run.player.x = v.cx + 1000;
    step(run, 0.2);
    expect(raidState(run, v.key)?.phase).toBe('failed');
    expect(enemiesOf(run, v.key)).toHaveLength(0);
    expect(heroLeft(run)).toBe(0);
    void outpostRun;
  });
});

describe('witch hut: potions (pure)', () => {
  it('seven in ten are good, three in ten bad, over the whole roll range', () => {
    expect(GOOD_SHARE).toBeCloseTo(0.7, 5);
    const counts = new Map<string, number>();
    const N = 10000;
    let good = 0;
    for (let i = 0; i < N; i++) {
      const p = rollPotion((i + 0.5) / N);
      counts.set(p.id, (counts.get(p.id) ?? 0) + 1);
      if (p.good) good++;
    }
    expect(good / N).toBeCloseTo(0.7, 2);
    for (const p of POTIONS) expect((counts.get(p.id) ?? 0) / N).toBeCloseTo(p.weight / 100, 2);
    expect(POTIONS.filter((p) => p.good).map((p) => p.id)).toEqual(['regen', 'speed', 'strength']);
    expect(POTIONS.filter((p) => !p.good).map((p) => p.id)).toEqual(['slow', 'poison']);
    expect(rollPotion(0).id).toBe('regen');
    expect(rollPotion(0.9999).id).toBe('poison');
  });
});

describe('witch hut in a run', () => {
  it('spawns the Swamp Witch as a guard that wakes when the hero comes close, and a dead one stays dead', () => {
    const { run, s } = runAt('witch_hut');
    run.player.x = s.cx;
    run.player.y = s.cy + 300;
    step(run, 0.1);
    const witch = enemiesOf(run, s.key, 'witch')[0];
    expect(witch?.def.id).toBe('swamp_witch');
    expect(spawnCount(run)).toBe(0);
    const home = witch ? [witch.x, witch.y] : [];
    step(run, 1, (dt) => {
      if (witch) witch.x += 2;
      updateInteract(run, dt);
    });
    expect(witch ? [witch.x, witch.y] : []).toEqual(home);
    if (!witch) return;
    killEnemy(run, witch, true);
    step(run, 0.1);
    run.player.x = s.cx + 2000;
    step(run, 0.1);
    run.player.x = s.cx;
    step(run, 0.5);
    expect(enemiesOf(run, s.key, 'witch')).toHaveLength(0);
  });

  it('the cauldron bubbles, costs nothing, brews once per hut and swaps to the empty one', () => {
    const { run, s } = runAt('witch_hut');
    step(run, 0.1);
    const full = s.props.find((p) => p.kind === 'cauldron');
    const empty = s.props.find((p) => p.kind === 'cauldron_empty');
    if (!full || !empty) throw new Error('cauldron');
    expect(run.world.isRemoved(empty)).toBe(true);
    // Bubbles rise while it is unused.
    step(run, 1);
    expect(run.fx.some((f) => f.kind === 'spark' && f.color === '#8cff6a')).toBe(true);
    // Walking past does nothing.
    run.player.x = full.x + 40;
    run.player.y = full.y;
    step(run, 2);
    expect(run.world.isRemoved(full)).toBe(false);
    const gold = run.emeraldsPicked;
    run.player.x = full.x;
    run.player.y = full.y + 12;
    step(run, CAULDRON_DWELL_S + 0.2);
    expect(run.world.isRemoved(full)).toBe(true);
    expect(run.world.isRemoved(empty)).toBe(false);
    expect(run.emeraldsPicked).toBe(gold);
    expect(run.stats.struct['brew']).toBe(1);
    expect(hutRun(run, s.key)?.used).toBe(true);
    // Once only.
    const buffs = JSON.stringify(run.buffs);
    const slow = run.player.slowT;
    step(run, 2);
    expect(JSON.stringify(run.buffs)).toBe(buffs);
    expect(run.player.slowT).toBeLessThanOrEqual(slow);
    expect(run.stats.struct['brew']).toBe(1);
  });

  it('every potion goes through the existing status system', () => {
    const { run } = runAt('witch_hut');
    const t0 = run.time;
    applyPotion(run, 'strength');
    expect(run.buffs.strength).toBeGreaterThan(t0 + 10);
    expect(run.mods.dmg).toBeGreaterThan(1.9);
    applyPotion(run, 'speed');
    expect(run.buffs.speed).toBeGreaterThan(t0 + 15);
    applyPotion(run, 'slow');
    expect(run.player.slowT).toBeCloseTo(SLOW_S, 5);
    applyPotion(run, 'poison');
    expect(run.player.dotKind).toBe('poison');
    expect(run.player.dotDps).toBe(WITCH_POISON_DPS);
    // Regeneration heals over time and shows a HUD tag; poison alone never kills.
    run.player.dotT = 0;
    run.player.hp = 100;
    applyPotion(run, 'regen');
    expect(regenLeft(run)).toBeCloseTo(REGEN_S, 5);
    expect(structureStatusTags(run).map((t) => t.text)).toEqual(['Regen']);
    step(run, 2, (dt) => updateInteract(run, dt));
    expect(run.player.hp).toBeGreaterThan(100 + REGEN_HP_PER_S * 1.8);
    step(run, REGEN_S);
    expect(regenLeft(run)).toBe(0);
  });

  it('the black cat keeps creepers (charged ones too) from approaching or exploding while the hero is near it', () => {
    const live = (
      id: string,
      near: boolean,
    ): { fused: boolean; dist: number; exploded: boolean } => {
      const { run, s } = runAt('witch_hut');
      step(run, 0.1);
      const cat = s.props.find((p) => p.kind === 'black_cat');
      if (!cat) throw new Error('cat');
      // Near the cat, or far from every hut.
      run.player.x = near ? cat.x + 20 : cat.x + 900;
      run.player.y = near ? cat.y + 40 : cat.y;
      run.player.snap();
      const e = makeEnemy(run, id, run.player.x + 70, run.player.y + 10, false);
      if (!e) throw new Error(id);
      e.maxHp = e.hp = 1000;
      run.enemies = [e];
      let fused = false;
      let exploded = false;
      const hp0 = run.player.hp;
      for (let i = 0; i < 60 * 4; i++) {
        run.time += 1 / 60;
        run.hash.clear();
        run.hash.insert(e);
        updateEnemies(run, 1 / 60);
        updateInteract(run, 1 / 60);
        if (e.state === 'fuse') fused = true;
        if (e.dying || run.player.hp < hp0) exploded = true;
      }
      return { fused, dist: Math.hypot(e.x - run.player.x, e.y - run.player.y), exploded };
    };
    for (const id of ['creeper', 'charged_creeper']) {
      const away = live(id, false);
      expect(away.fused, `${id} far from the cat`).toBe(true);
      expect(away.exploded, `${id} far from the cat`).toBe(true);
      const calm = live(id, true);
      expect(calm.fused, `${id} near the cat`).toBe(false);
      expect(calm.exploded, `${id} near the cat`).toBe(false);
      expect(calm.dist).toBeGreaterThan(CAT_KEEP_PX * 0.7);
    }
    expect(CAT_AURA_PX).toBe(150);
  });
});

const NEW_IDS = ['jungle_temple', 'trial_chamber', 'pillager_outpost', 'witch_hut'] as const;

describe('the four new structures in the registry and the world', () => {
  it('are registered with sensible biomes, spacing, chance and a start distance beyond the village and the temple', () => {
    const biomes: Record<(typeof NEW_IDS)[number], string[]> = {
      jungle_temple: ['jungle'],
      trial_chamber: ['plains', 'dark_forest', 'forest'],
      pillager_outpost: ['plains', 'snowy_taiga', 'forest'],
      witch_hut: ['swamp'],
    };
    const size = {
      jungle_temple: [12, 14],
      trial_chamber: [18, 18],
      pillager_outpost: [10, 10],
      witch_hut: [7, 7],
    };
    for (const id of NEW_IDS) {
      const d = STRUCTURE_BY_ID[id];
      expect(isStructureId(id)).toBe(true);
      expect([...d.allowedBiomes].sort()).toEqual(biomes[id].sort());
      expect([d.width, d.height]).toEqual(size[id]);
      expect(d.minDistFromSpawn).toBeGreaterThanOrEqual(80);
      expect(d.minDistFromSpawn).toBeGreaterThan(STRUCTURE_BY_ID.village.minDistFromSpawn);
      expect(d.minDistFromSpawn).toBeGreaterThan(STRUCTURE_BY_ID.desert_temple.minDistFromSpawn);
      expect(d.spacing).toBeGreaterThan(Math.max(d.width, d.height) + 2 * EDGE_MARGIN);
      expect(d.chance).toBeGreaterThan(0.3);
      expect(d.chance).toBeLessThanOrEqual(1);
      expect(d.name.length).toBeGreaterThan(5);
      expect(STRUCTURE_DEFS).toContain(d);
    }
    expect(STRUCTURE_BY_ID.witch_hut.allowWaterNear).toBe(true);
    expect(STRUCTURE_BY_ID.village.allowWaterNear).toBeUndefined();
  });

  it('is plausibly dense without flooding: about one or more per 100x100 tiles of its biomes, and rarely more than six', () => {
    const R = 400;
    const seeds = [1, 2, 3, 4, 5, 6];
    for (const id of NEW_IDS) {
      const d = STRUCTURE_BY_ID[id];
      let n = 0;
      let area = 0;
      for (const seed of seeds) {
        n += new StructureIndex(seed)
          .inTileRect(-R, -R, R, R)
          .filter((p) => p.def.id === id).length;
        for (let y = -R; y < R; y += 8)
          for (let x = -R; x < R; x += 8)
            if (d.allowedBiomes.includes(biomeAtTile(x, y, seed))) area += 64;
      }
      const per10k = (n / area) * 10000;
      console.log(
        `${id}: ${n} in ${seeds.length} worlds, ${per10k.toFixed(2)} per 100x100 tiles of its biomes`,
      );
      expect(per10k, id).toBeGreaterThanOrEqual(0.9);
      expect(per10k, id).toBeLessThanOrEqual(6);
    }
  });

  it('every one is found within 360 tiles of the start in most worlds, never inside the starting meadow', () => {
    for (const id of NEW_IDS) {
      let found = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const w = new World(seed);
        const p = w.structures?.nearest(id, 0, 0, 360 * TILE_PX);
        if (!p) continue;
        found++;
        expect(Math.hypot(p.cx, p.cy) / TILE_PX).toBeGreaterThan(
          STRUCTURE_BY_ID[id].minDistFromSpawn,
        );
      }
      expect(found, id).toBeGreaterThanOrEqual(14);
    }
  });

  it('witch huts may stand in the shallows (never in lava, at most half wet); others keep their dry margin', () => {
    let wet = 0;
    let huts = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const idx = new StructureIndex(seed);
      for (const p of idx
        .inTileRect(-400, -400, 400, 400)
        .filter((q) => q.def.id === 'witch_hut')) {
        huts++;
        let inside = 0;
        for (let y = p.ty - 2; y < p.ty + p.height + 2; y++)
          for (let x = p.tx - 2; x < p.tx + p.width + 2; x++) {
            const t = tileAt(x, y, seed);
            expect(t).not.toBe(TILE.LAVA);
            if (t === TILE.WATER) {
              wet++;
              if (x >= p.tx && x < p.tx + p.width && y >= p.ty && y < p.ty + p.height) inside++;
            }
          }
        expect(inside * 2).toBeLessThanOrEqual(p.width * p.height);
      }
    }
    expect(huts).toBeGreaterThan(20);
    expect(wet).toBeGreaterThan(0); // swamp huts really do stand by (or in) water
  });

  it('the seven new materials exist, differ from each other and paint chunks of every new structure', () => {
    expect(MATERIAL_COUNT).toBe(38);
    const mats = [
      MAT.MOSSY_BRICKS,
      MAT.VINE_COBBLE,
      MAT.TUFF,
      MAT.TUFF_BRICKS,
      MAT.OXIDIZED_COPPER,
      MAT.CUT_COPPER,
      MAT.DARK_OAK_PLANKS,
    ];
    const first = new Set<number>();
    for (const m of mats) {
      expect(materialName(m)).not.toBe('?');
      first.add(materialBase(m)[0] ?? 0);
      expect(new Set(materialBase(m)).size).toBeGreaterThan(3);
    }
    expect(first.size).toBeGreaterThanOrEqual(5);
    for (const id of NEW_IDS) {
      const seed = SEED[id];
      const w = new World(seed);
      const p = nearest(w, id);
      const cx = Math.floor((p.tx + (p.width >> 1)) / 16);
      const cy = Math.floor((p.ty + (p.height >> 1)) / 16);
      const ov = w.structureOverlay(cx, cy);
      expect(ov, id).toBeTruthy();
      if (!ov) continue;
      const terrain = genTerrain(cx, cy, seed);
      const biomes = genChunkBiomes(cx, cy, (x, y) => w.biomeIndexAtTile(x, y));
      applyOverlay(terrain, ov);
      const img = paintChunk(cx, cy, terrain, biomes, seed, ov);
      expect(img.data.length).toBeGreaterThan(0);
    }
  });

  it('the new props have sprites of a sane size', () => {
    const kinds = [
      ...new Set(
        NEW_IDS.flatMap((id) => nearest(new World(SEED[id]), id).props.map((p) => p.kind)),
      ),
    ];
    for (const k of kinds) {
      const px = propPixels(k, 'plains', 0);
      expect(px.buf.w, k).toBeGreaterThanOrEqual(6);
      expect(px.buf.h, k).toBeLessThanOrEqual(72);
    }
    for (const k of [
      'lever',
      'lever_on',
      'cage',
      'cage_open',
      'cauldron',
      'cauldron_empty',
    ] as const) {
      expect(propPixels(k, 'plains', 0).buf.data).not.toEqual(
        propPixels(
          k === 'lever'
            ? 'lever_on'
            : k === 'lever_on'
              ? 'lever'
              : k === 'cage'
                ? 'cage_open'
                : k === 'cage_open'
                  ? 'cage'
                  : k === 'cauldron'
                    ? 'cauldron_empty'
                    : 'cauldron',
          'plains',
          0,
        ).buf.data,
      );
    }
  });

  it('the hut, the temple, the chamber and the outpost can be reached with ?struct= (debug start)', () => {
    for (const id of NEW_IDS) {
      const run = new RunState(SEED[id], 0);
      expect(startAtStructure(run, id, 'door')).toBe(true);
      const p = nearest(run.world, id);
      expect(Math.hypot(run.player.x - p.entryX, run.player.y - p.entryY)).toBeLessThan(1);
      expect(startAtStructure(run, id, 'in')).toBe(true);
      expect(Math.hypot(run.player.x - p.cx, run.player.y - p.cy)).toBeLessThan(10 * TILE_PX);
    }
  });
});

describe('the vault, the key and the gates are reachable once their mechanism has run', () => {
  it('the vault stands on open floor in the north-east corner of the hall', () => {
    const { s } = runAt('trial_chamber');
    const vault = s.props.find((p) => p.kind === 'vault');
    expect(vault).toBeTruthy();
    if (!vault) return;
    expect((vault.x - s.tx * TILE_PX) / TILE_PX).toBeGreaterThan(12);
    expect((vault.y - s.ty * TILE_PX) / TILE_PX).toBeLessThan(4);
  });
});

describe('structure achievements, missions and the stats behind them', () => {
  it('has the four achievements and the daily mission, and they unlock from the run record', () => {
    for (const id of ['jungle_raider', 'trial_passed', 'raid_hero', 'witchs_brew'])
      expect(ACHIEVEMENT_BY_ID.get(id), id).toBeTruthy();
    expect(ACHIEVEMENT_BY_ID.get('jungle_raider')?.name).toBe('Jungle Raider');
    expect(ACHIEVEMENT_BY_ID.get('trial_passed')?.name).toBe('Trial Passed');
    expect(ACHIEVEMENT_BY_ID.get('raid_hero')?.name).toBe('Village Defender');
    expect(ACHIEVEMENT_BY_ID.get('hero_of_the_village')?.name).toBe('Hero of the Village');
    expect(ACHIEVEMENT_BY_ID.get('witchs_brew')?.name).toBe("Witch's Brew");
    const m = MISSION_BY_ID.get('d_struct_chests');
    expect(m?.kind).toBe('daily');
    expect(m?.metric).toBe('struct.chests');
    expect(m?.text).toBe('Open 3 structure chests');

    const { run } = runAt('witch_hut');
    run.stats.structure('chests', 2);
    run.stats.structure('jungle');
    run.stats.structure('trial');
    run.stats.structure('hero');
    run.stats.structure('brew');
    const rec = run.stats.snapshot(run, 1);
    expect(rec.struct).toEqual({ chests: 2, jungle: 1, trial: 1, hero: 1, brew: 1 });
    const save = defaultSave(1000);
    expect(evaluateAchievements(save, 1000, rec).map((a) => a.id)).toEqual([]);
    mergeRunIntoSave(save, rec);
    const got = evaluateAchievements(save, 1000, rec).map((a) => a.id);
    for (const id of ['jungle_raider', 'trial_passed', 'raid_hero', 'witchs_brew'])
      expect(got).toContain(id);
    expect(save.stats.counters['struct.chests']).toBe(2);
    // A run without structure events adds no field.
    const plain = new RunState(1, 0).stats.snapshot(new RunState(1, 0), 1);
    expect('struct' in plain).toBe(false);
  });

  it('the mission counts structure chests across runs', () => {
    const noon = new Date(2026, 9, 12, 12).getTime();
    const save = defaultSave(noon);
    ensureMissions(save, noon);
    const entry = save.missions.daily[0];
    if (!entry) throw new Error('no daily');
    entry.id = 'd_struct_chests';
    entry.progress = 0;
    entry.claimed = false;
    const { run } = runAt('witch_hut');
    run.stats.structure('chests', 2);
    applyRunToMissions(save, run.stats.snapshot(run, 1), noon);
    const progress = (): number | undefined =>
      save.missions.daily.find((e) => e.id === 'd_struct_chests')?.progress;
    expect(progress()).toBe(2);
    run.stats.structure('chests', 5);
    applyRunToMissions(save, run.stats.snapshot(run, 1), noon);
    expect(progress()).toBe(3);
  });
});

describe('the Trial Chamber wave is beatable at level 1-3 with the starter sword (scripted hero)', () => {
  it('beats 6 bogged + 2 breezes at 1:00, 3:00 and 5:00 with most of its health', () => {
    const lines: string[] = [];
    for (const [name, build] of [
      ['level 1, sword 1', L1],
      ['level 3, sword 2 + sharpness', L3],
    ] as const) {
      for (const time of [60, 180, 300]) {
        const rs = [13, 25, 35].map((seed) => fightTrial(seed, build, time, { dodge: false }));
        for (const r of rs) {
          expect(r.won, `${name} at ${time} s: ${JSON.stringify(r)}`).toBe(true);
          expect(r.dead).toBe(false);
          expect(r.hpLeftFrac).toBeGreaterThan(0.35);
        }
        const hp = rs.reduce((a, r) => a + r.hpLeftFrac, 0) / rs.length;
        const sec = rs.reduce((a, r) => a + r.seconds, 0) / rs.length;
        lines.push(
          `${name} @${time}s: 3/3 wins, ${(hp * 100).toFixed(0)}% HP left, ${sec.toFixed(0)} s`,
        );
      }
    }
    console.log(`trial fight (no dodging):\n${lines.join('\n')}`);
  });
});

describe('budgets of the new structures', () => {
  it('bakes the chunks of each new structure inside the 14 ms budget and looks them up in under 1 ms', () => {
    for (const id of NEW_IDS) {
      const seed = SEED[id];
      const w = new World(seed);
      const p = nearest(w, id);
      const chunks: [number, number][] = [];
      for (let cy = Math.floor(p.ty / 16); cy <= Math.floor((p.ty + p.height - 1) / 16); cy++)
        for (let cx = Math.floor(p.tx / 16); cx <= Math.floor((p.tx + p.width - 1) / 16); cx++)
          chunks.push([cx, cy]);
      const bake = (cx: number, cy: number): void => {
        const terrain = genTerrain(cx, cy, seed);
        const biomes = genChunkBiomes(cx, cy, (x, y) => w.biomeIndexAtTile(x, y));
        const ov = w.structureOverlay(cx, cy);
        if (ov) applyOverlay(terrain, ov);
        paintChunk(cx, cy, terrain, biomes, seed, ov);
      };
      for (const [cx, cy] of chunks) bake(cx, cy); // warm the texture caches
      let best = Infinity;
      for (let b = 0; b < 5; b++) {
        const t0 = performance.now();
        for (const [cx, cy] of chunks) bake(cx, cy);
        best = Math.min(best, (performance.now() - t0) / chunks.length);
      }
      console.log(`${id} chunk bake: ${best.toFixed(2)} ms per chunk (${chunks.length} chunks)`);
      expect(best, id).toBeLessThan(14);
    }
    const idx = new StructureIndex(4242);
    const t0 = performance.now();
    let n = 0;
    for (let cy = -20; cy < 20; cy++)
      for (let cx = -20; cx < 20; cx++) {
        idx.chunk(cx, cy);
        n++;
      }
    const per = (performance.now() - t0) / n;
    console.log(
      `structure chunk lookup with ${STRUCTURE_DEFS.length} defs (fresh): ${per.toFixed(3)} ms per chunk`,
    );
    expect(per).toBeLessThan(1);
  });
});
