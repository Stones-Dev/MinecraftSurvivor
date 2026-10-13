import { describe, expect, it } from 'vitest';
import { defaultSave } from '../src/core/save';
import { hpScale } from '../src/data/enemies';
import {
  CAGED_PILLARS,
  CAGE_HP,
  CRUISE_SPEED,
  CRYSTAL_BLAST_DMG,
  CRYSTAL_STUN,
  DIVE_KNOCK,
  DIVE_WIDTH,
  DRAGON_BASE_HP,
  DRAGON_HP_MULT,
  PHASE2_AT,
  PHASE3_AT,
  cageFactor,
  crystalHealRate,
  diveLine,
  dragonFactor,
  dragonScale,
  inFront,
  isGrounded,
  isMeleeOrigin,
  orbitOmega,
  orbitPoint,
  orbitTheta,
  phaseFor,
} from '../src/entities/bossDragon';
import { Pickup } from '../src/entities/pickup';
import { RunState } from '../src/game';
import { defaultLoadout } from '../src/systems/meta';
import { MusicDirector } from '../src/data/music';
import { damageEnemy, killEnemy } from '../src/systems/combat';
import { xpToNext } from '../src/systems/economy';
import { applyStatus } from '../src/systems/status';
import {
  DEATH_ANIM,
  EGG_EMERALDS,
  END_ISLAND_PX,
  END_START,
  EXIT_PORTAL,
  PILLAR_RADIUS,
  VICTORY_EMERALDS,
  XP_SHOWER_CAP,
  debugEnterEnd,
  dragonStatus,
  enterEnd,
  knockHero,
  leaveEnd,
  spawnEndPortal,
  xpShowerTotal,
} from '../src/systems/endDimension';
import { getMarkers } from '../src/systems/npcs';
import { ensureMissions, applyRunToMissions } from '../src/systems/missions';
import { finishRun } from '../src/systems/runEnd';
import { makeEnemy } from '../src/systems/spawner';
import { finalVictoryLines } from '../src/ui/overlays';
import {
  END_FOUNTAIN_TILES,
  END_ISLAND_TILES,
  END_PILLAR_COUNT,
  TILE,
  endPillarCentre,
  tileAt,
} from '../src/world/terrain';
import { BOSS_SCHEDULE } from '../src/systems/director';
import { endRun, fight, MID, ScriptInput, STRONG } from './helpers/endFight';

function step(run: RunState, seconds: number, input = new ScriptInput()): void {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    run.update(1 / 60, input);
    if (run.offer) {
      run.offer = null;
      run.pendingLevelups = 0;
    }
  }
}

/** A run inside the End with nothing but the dragon and its crystals: no weapons, no companions, lots of HP. */
function plainEnd(pct = 100, seed = 3): RunState {
  const run = new RunState(seed, 960);
  run.weapons = [];
  run.allies = [];
  run.pet = null;
  run.baseMaxHp = 900;
  run.recomputeStats();
  run.player.hp = run.player.maxHp;
  enterEnd(run, pct);
  run.end.brain.spitT = 999;
  return run;
}

/** The dragon's mode as a plain string (loops that wait for a mode change would otherwise be narrowed). */
function modeOf(run: RunState): string {
  return run.end.brain.mode;
}

function dragonOf(run: RunState) {
  const d = run.end.dragon;
  if (!d) throw new Error('no dragon');
  return d;
}

describe('dragon rules (pure)', () => {
  it('phases follow HP, all crystals gone means phase 3, and never go back', () => {
    expect(phaseFor(1, 6)).toBe(1);
    expect(phaseFor(PHASE2_AT + 0.001, 6)).toBe(1);
    expect(phaseFor(PHASE2_AT, 6)).toBe(2);
    expect(phaseFor(PHASE3_AT + 0.001, 6)).toBe(2);
    expect(phaseFor(PHASE3_AT, 6)).toBe(3);
    expect(phaseFor(0.95, 0)).toBe(3);
    // Crystal healing can lift the HP over a threshold again: the phase stays.
    expect(phaseFor(0.9, 6, 2)).toBe(2);
    expect(phaseFor(0.6, 6, 3)).toBe(3);
  });

  it('the flight ellipse moves at the cruise speed everywhere and parameters round-trip', () => {
    for (const th of [0, 0.7, Math.PI / 2, 2.4, 4]) {
      const h = 1e-4;
      const a = orbitPoint(th);
      const b = orbitPoint(th + h);
      const speed = (Math.hypot(b.x - a.x, b.y - a.y) / h) * orbitOmega(th);
      expect(speed).toBeCloseTo(CRUISE_SPEED, 0);
      const p = orbitPoint(th);
      const back = orbitTheta(p.x, p.y);
      expect(Math.cos(back)).toBeCloseTo(Math.cos(th), 5);
      expect(Math.sin(back)).toBeCloseTo(Math.sin(th), 5);
    }
  });

  it('a dive lane runs through the hero and turns inward near the rim', () => {
    const mid = diveLine(0, 0, 0.5, END_ISLAND_PX);
    expect(Math.hypot(mid.ex - mid.sx, mid.ey - mid.sy)).toBeCloseTo(640, 3);
    expect((mid.sx + mid.ex) / 2).toBeCloseTo(0, 5);
    expect(Math.hypot(mid.ux, mid.uy)).toBeCloseTo(1, 5);
    // Hero 112 px from the rim, lane pointing at the rim: flipped, so the knockback goes inward.
    const edge = diveLine(400, 0, 0, END_ISLAND_PX);
    expect(edge.ux).toBeLessThan(0);
    // Pointing away from the rim stays as it is.
    const inward = diveLine(400, 0, Math.PI, END_ISLAND_PX);
    expect(inward.ux).toBeLessThan(0);
  });

  it('flying means out of melee reach, perched means arrows bounce, grounded means everything lands', () => {
    expect(dragonFactor('orbit', true)).toBe(0);
    expect(dragonFactor('orbit', false)).toBe(1);
    expect(dragonFactor('dive', true)).toBe(0);
    expect(dragonFactor('perch', true)).toBe(1);
    expect(dragonFactor('perch', false)).toBeCloseTo(0.15);
    expect(dragonFactor('stunned', false)).toBe(1);
    expect(dragonFactor('stunned', true)).toBe(1);
    expect(dragonFactor('dying', true)).toBe(0);
    expect(isGrounded('perch') && isGrounded('stunned') && !isGrounded('orbit')).toBe(true);
    expect(isMeleeOrigin(10, 10, 10.5, 10, [])).toBe(true);
    expect(isMeleeOrigin(40, 10, 10, 10, [{ x: 40, y: 11 }])).toBe(true);
    expect(isMeleeOrigin(40, 10, 10, 10, [])).toBe(false);
    expect(inFront(0, 5, 0)).toBe(true);
    expect(inFront(0, -5, 1)).toBe(false);
    expect(cageFactor(40, false)).toBe(0.25);
    expect(cageFactor(140, false)).toBe(1);
    expect(cageFactor(0, true)).toBe(1);
  });

  it('crystal healing and the overload scale with the difficulty curve, not with the End multiplier', () => {
    const maxHp = DRAGON_BASE_HP * DRAGON_HP_MULT * hpScale(16);
    expect(dragonScale(maxHp)).toBeCloseTo(hpScale(16), 6);
    expect(crystalHealRate(maxHp)).toBeCloseTo(15 * hpScale(16), 6);
    expect(crystalHealRate(DRAGON_BASE_HP * DRAGON_HP_MULT)).toBeCloseTo(15, 6);
  });

  it('the XP shower is about three levels, capped at 5000', () => {
    const lvl = (level: number, xp = 0): number =>
      xpShowerTotal({ level, xp } as Pick<RunState, 'level' | 'xp'>);
    expect(lvl(20)).toBeCloseTo(xpToNext(20) + xpToNext(21) + xpToNext(22), 5);
    expect(lvl(20, 100)).toBeCloseTo(lvl(20) - 100, 5);
    expect(lvl(5000)).toBe(XP_SHOWER_CAP);
    expect(lvl(1, 0)).toBeGreaterThan(36 - 1);
  });
});

describe('the End island', () => {
  it('is a round end-stone island with a bedrock fountain, obsidian under the pillars and void around', () => {
    expect(tileAt(0, 0, 1, { r: 44, kind: 'end' })).toBe(TILE.BEDROCK);
    expect(tileAt(END_FOUNTAIN_TILES + 1, 0, 1, { r: 44, kind: 'end' })).toBe(TILE.END_STONE);
    expect(tileAt(END_ISLAND_TILES - 2, 0, 1, { r: 44, kind: 'end' })).toBe(TILE.END_STONE);
    expect(tileAt(END_ISLAND_TILES + 1, 0, 1, { r: 44, kind: 'end' })).toBe(TILE.VOID);
    expect(tileAt(0, -END_ISLAND_TILES - 3, 1, { r: 44, kind: 'end' })).toBe(TILE.VOID);
    const c = endPillarCentre(0);
    expect(tileAt(Math.floor(c.x / 16), Math.floor(c.y / 16), 1, { r: 44, kind: 'end' })).toBe(
      TILE.OBSIDIAN,
    );
    // Six pillars on a 180 px ring.
    expect(END_PILLAR_COUNT).toBe(6);
    for (let i = 0; i < END_PILLAR_COUNT; i++) {
      const p = endPillarCentre(i);
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(180, 5);
    }
    // No wall tile anywhere: the rim is the void.
    for (let tx = -50; tx <= 50; tx += 5)
      for (let ty = -50; ty <= 50; ty += 5)
        expect(tileAt(tx, ty, 1, { r: 44, kind: 'end' })).not.toBe(TILE.WALL);
  });

  it('grows no props, and the pillars are solid', () => {
    const run = plainEnd();
    const w = run.world;
    expect(w).toBe(run.endWorld);
    expect(w.propsInRect(-300, -300, 300, 300)).toHaveLength(0);
    const c = endPillarCentre(2);
    const out = w.collide(c.x + 2, c.y, 5);
    expect(Math.hypot(out.x - c.x, out.y - c.y)).toBeGreaterThanOrEqual(PILLAR_RADIUS + 5 - 0.01);
    expect(w.overlapsSolid(c.x, c.y, 1)).toBe(true);
    expect(w.overlapsSolid(0, 90, 1)).toBe(false);
    // The hero cannot walk through a pillar.
    run.player.x = c.x;
    run.player.y = c.y + 60;
    const input = new ScriptInput();
    input.y = -1;
    step(run, 3, input);
    expect(Math.hypot(run.player.x - c.x, run.player.y - c.y)).toBeGreaterThanOrEqual(
      PILLAR_RADIUS + run.player.radius - 0.5,
    );
  });
});

describe('the End portal', () => {
  it('opens where the Warden falls, stays for the run and is marked for the hero', () => {
    expect(BOSS_SCHEDULE.map((b) => b.id)).toContain('warden');
    const run = new RunState(3, 899.5);
    run.player.maxHp = run.player.hp = 99999;
    step(run, 2);
    const warden = run.enemies.find((e) => e.def.id === 'warden');
    expect(warden).toBeDefined();
    if (!warden) return;
    warden.x = run.player.x + 120;
    warden.y = run.player.y;
    killEnemy(run, warden, true);
    expect(run.won).toBe(true);
    const portal = run.end.portal;
    expect(portal).not.toBeNull();
    if (!portal) return;
    expect(Math.hypot(portal.x - warden.x, portal.y - warden.y)).toBeLessThan(170);
    expect(getMarkers(run).some((m) => m.color === '#df7cff' && m.x === portal.x)).toBe(true);
    expect(run.banners.some((b) => b.text.includes('End portal'))).toBe(true);
    // It stays: ten minutes later (Endless going on) it is still there, and a second Warden does not reset it.
    const at = { x: portal.x, y: portal.y };
    spawnEndPortal(run, 0, 0);
    expect(run.end.portal?.x).toBe(at.x);
    for (let i = 0; i < 10; i++) step(run, 20);
    expect(run.end.portal).not.toBeNull();
    expect(run.end.active).toBe(false);
  });

  it('does not swallow a hero who stands where the Warden died, but takes one who walks in', () => {
    const run = new RunState(5, 960);
    run.player.maxHp = run.player.hp = 99999;
    run.spawnMult = 0;
    run.won = true;
    spawnEndPortal(run, run.player.x, run.player.y);
    const portal = run.end.portal;
    if (!portal) throw new Error('no portal');
    run.enemies.length = 0;
    step(run, 1);
    expect(run.end.active).toBe(false);
    // Walk 60 px away, then back in.
    run.player.x = portal.x + 60;
    run.player.y = portal.y;
    step(run, 0.2);
    expect(portal.armed).toBe(true);
    const input = new ScriptInput();
    input.x = -1;
    step(run, 1.2, input);
    expect(run.end.active).toBe(true);
    expect(run.world).toBe(run.endWorld);
  });

  it('is not entered while a rift is open', () => {
    const run = new RunState(5, 960);
    run.won = true;
    spawnEndPortal(run, run.player.x + 80, run.player.y);
    const portal = run.end.portal;
    if (!portal) throw new Error('no portal');
    portal.armed = true;
    run.rift.active = true;
    run.player.x = portal.x;
    run.player.y = portal.y;
    step(run, 0.2);
    expect(run.end.active).toBe(false);
  });
});

describe('entering and leaving the End', () => {
  it('stashes the overworld, freezes it, and gives it back untouched', () => {
    const run = new RunState(9, 700);
    run.player.maxHp = run.player.hp = 99999;
    run.spawnMult = 0;
    run.player.x = 123;
    run.player.y = -45;
    const z = makeEnemy(run, 'zombie', 160, -40, false);
    if (!z) throw new Error('no zombie');
    run.enemies.push(z);
    run.pickups.push(new Pickup('xp', 130, -40, 3));
    run.zones.push({
      x: 100,
      y: -40,
      r: 20,
      t: 0,
      dur: 30,
      dps: 4,
      tick: 0,
      kind: 'burn',
      slowF: 1,
      friendly: false,
    });
    run.telegraphs.push({ kind: 'circle', x: 1, y: 2, x2: 0, y2: 0, r: 9, t: 0, dur: 30 });
    run.later(500, () => undefined);
    const enemies = run.enemies;
    const pickups = run.pickups;
    const zones = run.zones;
    const telegraphs = run.telegraphs;
    const scheduled = run.scheduled;
    const overworld = run.world;
    const zx = z.x;
    enterEnd(run);
    expect(run.end.active).toBe(true);
    expect(run.world).toBe(run.endWorld);
    expect(run.biome()).toBe('nether');
    expect(run.pickups).toHaveLength(0);
    expect(run.zones).toHaveLength(0);
    expect(run.telegraphs).toHaveLength(0);
    expect(run.enemies.map((e) => e.def.id).sort()).toEqual(
      [
        'end_crystal',
        'end_crystal',
        'end_crystal',
        'end_crystal',
        'end_crystal',
        'end_crystal',
        'ender_dragon',
      ].sort(),
    );
    expect(Math.hypot(run.player.x - END_START.x, run.player.y - END_START.y)).toBeLessThan(1);
    // The overworld is frozen: nothing spawns and the zombie does not move.
    step(run, 6);
    expect(z.x).toBe(zx);
    expect(enemies).toHaveLength(1);
    // Companions came along.
    for (const a of run.allies)
      expect(Math.hypot(a.x - run.player.x, a.y - run.player.y)).toBeLessThan(80);
    leaveEnd(run);
    expect(run.end.active).toBe(false);
    expect(run.world).toBe(overworld);
    expect(run.enemies).toBe(enemies);
    expect(run.pickups[0]).toBe(pickups[0]);
    expect(run.zones).toBe(zones);
    expect(run.telegraphs).toBe(telegraphs);
    expect(run.scheduled).toBe(scheduled);
    expect(run.player.x).toBe(123);
    expect(run.player.y).toBe(-45);
    expect(run.endWorld.solids).toHaveLength(0);
    for (const a of run.allies) expect(Math.hypot(a.x - 123, a.y + 45)).toBeLessThan(80);
  });

  it('`?end` style debug entry starts the dragon at a given HP and phase', () => {
    for (const [pct, phase, mode] of [
      [100, 1, 'orbit'],
      [70, 2, 'orbit'],
      [30, 3, 'perch'],
    ] as const) {
      const run = new RunState(2, 960);
      debugEnterEnd(run, pct);
      const d = dragonOf(run);
      expect(d.hp / d.maxHp).toBeCloseTo(pct / 100, 6);
      expect(run.end.brain.phase).toBe(phase);
      expect(run.end.brain.mode).toBe(mode);
    }
    // The dragon's HP follows the Warden's curve (times the End multiplier); the base stays 2500.
    const run = new RunState(2, 960);
    enterEnd(run);
    expect(dragonOf(run).maxHp).toBeCloseTo(DRAGON_BASE_HP * hpScale(16) * DRAGON_HP_MULT, 3);
    expect(dragonOf(run).def.hp).toBe(DRAGON_BASE_HP);
    expect(dragonOf(run).boss).toBe('boss');
    expect(run.end.crystals).toHaveLength(6);
    expect(run.end.crystals.filter((c) => c.caged).map((c) => c.pillar)).toEqual([
      ...CAGED_PILLARS,
    ]);
  });
});

describe('the void', () => {
  it('kills instantly, whatever the armour and the invulnerability', () => {
    const run = plainEnd();
    const p = run.player;
    p.armor = 5000;
    p.iframes = 99;
    p.x = END_ISLAND_PX + 12;
    p.y = 0;
    step(run, 0.1);
    expect(p.dead).toBe(true);
    expect(run.status).toBe('dead');
    expect(run.banners.some((b) => b.text.includes('void'))).toBe(true);
  });

  it('is not entered at the rim itself', () => {
    const run = plainEnd();
    run.player.x = END_ISLAND_PX - 6;
    run.player.y = 0;
    step(run, 0.1);
    expect(run.player.dead).toBe(false);
  });

  it('a Totem of Undying saves the hero once: back to the middle with a tenth of their health', () => {
    const run = plainEnd();
    const p = run.player;
    run.item = 'totem';
    p.x = END_ISLAND_PX + 5;
    p.y = 10;
    step(run, 0.1);
    expect(p.dead).toBe(false);
    expect(run.item).toBeNull();
    expect(Math.hypot(p.x - END_START.x, p.y - END_START.y)).toBeLessThan(2);
    expect(p.hp).toBeCloseTo(p.maxHp * 0.1, 0);
    expect(p.iframes).toBeGreaterThan(1);
    expect(run.end.totemSaves).toBe(1);
    // The second fall is final.
    p.x = -END_ISLAND_PX - 5;
    p.y = 0;
    step(run, 0.1);
    expect(p.dead).toBe(true);
  });

  it('a knockback that carries the hero over the rim is deadly', () => {
    const run = plainEnd();
    const p = run.player;
    p.x = END_ISLAND_PX - 50;
    p.y = 0;
    knockHero(run, 1, 0, DIVE_KNOCK);
    step(run, 0.6);
    expect(p.dead).toBe(true);
  });

  it('companions over the void respawn at the middle instead of falling', () => {
    const run = new RunState(4, 960, {
      ...defaultLoadout(),
      allies: [{ id: 'wolf', level: 1 }],
    });
    expect(run.allies).toHaveLength(1);
    enterEnd(run);
    const a = run.allies[0];
    if (!a) return;
    a.x = END_ISLAND_PX + 40;
    a.y = 0;
    step(run, 0.05);
    expect(Math.hypot(a.x, a.y)).toBeLessThan(END_ISLAND_PX - 20);
    expect(a.downed).toBe(false);
  });
});

describe('damage rules', () => {
  it('melee cannot reach a flying dragon, ranged and blasts can', () => {
    const run = plainEnd();
    const d = dragonOf(run);
    const p = run.player;
    const hp0 = d.hp;
    damageEnemy(run, d, 100, p.x, p.y, 0);
    expect(d.hp).toBe(hp0);
    damageEnemy(run, d, 100, p.x + 90, p.y, 0);
    expect(d.hp).toBe(hp0 - 100);
    damageEnemy(run, d, 100, d.x, d.y, 140);
    expect(d.hp).toBe(hp0 - 200);
  });

  it('perched, arrows bounce (x0.15), melee lands and a hit on the head counts double', () => {
    const run = plainEnd();
    const d = dragonOf(run);
    const p = run.player;
    const b = run.end.brain;
    b.mode = 'perch';
    b.face = Math.PI / 2; // looking south, toward the hero
    d.x = 0;
    d.y = -8;
    p.x = 0;
    p.y = 40;
    const hp0 = d.hp;
    damageEnemy(run, d, 100, p.x + 90, p.y, 0);
    expect(hp0 - d.hp).toBeCloseTo(15, 5);
    const hp1 = d.hp;
    damageEnemy(run, d, 100, p.x, p.y, 0);
    expect(hp1 - d.hp).toBeCloseTo(200, 5);
    // From behind (the tail side) a melee hit is a plain hit.
    p.y = -60;
    const hp2 = d.hp;
    damageEnemy(run, d, 100, p.x, p.y, 0);
    expect(hp2 - d.hp).toBeCloseTo(100, 5);
  });

  it('the dragon cannot be stunned or frozen, crystals can', () => {
    const run = plainEnd();
    const d = dragonOf(run);
    applyStatus(d, 'stun', 5);
    applyStatus(d, 'freeze', 5);
    expect(d.stunT).toBe(0);
    expect(d.freezeT).toBe(0);
    const c = run.end.crystals[0];
    if (!c) throw new Error('no crystal');
    applyStatus(c.e, 'stun', 5);
    expect(c.e.stunT).toBe(5);
  });

  it('a grounded dragon takes everything', () => {
    const run = plainEnd();
    const d = dragonOf(run);
    run.end.brain.mode = 'stunned';
    const p = run.player;
    const hp0 = d.hp;
    damageEnemy(run, d, 50, p.x, p.y, 0);
    damageEnemy(run, d, 50, p.x + 90, p.y, 0);
    expect(hp0 - d.hp).toBeCloseTo(100, 5);
  });
});

describe('crystals', () => {
  it('heal the dragon only while it is hurt, 15 HP/s each (scaled)', () => {
    const run = plainEnd();
    const d = dragonOf(run);
    step(run, 1);
    expect(d.hp).toBe(d.maxHp);
    d.hp = d.maxHp * 0.9;
    const hp0 = d.hp;
    step(run, 1);
    const rate = crystalHealRate(d.maxHp) * 6;
    expect(d.hp - hp0).toBeGreaterThan(rate * 0.9);
    expect(d.hp - hp0).toBeLessThan(rate * 1.1);
  });

  it('a crystal destroyed while it heals makes the dragon explode: 150 damage (scaled) and 3 s on the ground', () => {
    const run = plainEnd();
    const d = dragonOf(run);
    d.hp = d.maxHp * 0.9;
    const crystal = run.end.crystals[0];
    if (!crystal) throw new Error('no crystal');
    // Take the others out of the heal so the arithmetic is clean.
    for (const c of run.end.crystals.slice(1)) c.done = true;
    const hp0 = d.hp;
    killEnemy(run, crystal.e, true);
    step(run, 1 / 60);
    const blast = CRYSTAL_BLAST_DMG * dragonScale(d.maxHp);
    expect(hp0 - d.hp).toBeGreaterThan(blast * 0.99);
    expect(hp0 - d.hp).toBeLessThan(blast * 1.01);
    expect(run.end.brain.mode).toBe('stunned');
    expect(run.end.brain.t).toBeGreaterThan(CRYSTAL_STUN - 0.1);
    // Grounded: melee reaches it now.
    const hp1 = d.hp;
    damageEnemy(run, d, 10, run.player.x, run.player.y, 0);
    expect(hp1 - d.hp).toBe(10);
    step(run, CRYSTAL_STUN + 0.5);
    expect(run.end.brain.mode).not.toBe('stunned');
  });

  it('no overload when the dragon is at full health, and all crystals gone starts phase 3', () => {
    const run = plainEnd();
    const d = dragonOf(run);
    for (const c of run.end.crystals) killEnemy(run, c.e, true);
    step(run, 1 / 60);
    expect(d.hp).toBe(d.maxHp);
    expect(run.end.brain.mode).not.toBe('stunned');
    expect(run.end.crystalsAlive()).toBe(0);
    step(run, 0.1);
    expect(run.end.brain.phase).toBe(3);
    expect(run.end.brain.mode).toBe('landing');
  });

  it('a cage soaks normal hits at a quarter, blasts at full, and then the crystal can be hurt', () => {
    const run = plainEnd();
    const caged = run.end.crystals.find((c) => c.caged);
    if (!caged) throw new Error('no caged crystal');
    const e = caged.e;
    const hp0 = e.hp;
    expect(caged.cageHp).toBe(CAGE_HP);
    damageEnemy(run, e, 20, 0, 0, 40);
    expect(e.hp).toBe(hp0);
    expect(caged.cageHp).toBeCloseTo(CAGE_HP - 5, 5);
    damageEnemy(run, e, CAGE_HP, 0, 0, 140);
    expect(caged.caged).toBe(false);
    expect(e.hp).toBe(hp0);
    damageEnemy(run, e, 10, 0, 0, 40);
    expect(e.hp).toBe(hp0 - 10);
    // The free ones take hits straight away.
    const free = run.end.crystals.find((c) => !c.caged);
    if (!free) throw new Error('no free crystal');
    const f0 = free.e.hp;
    damageEnemy(run, free.e, 10, 0, 0, 0);
    expect(free.e.hp).toBe(f0 - 10);
  });
});

describe('the dragon fights fair', () => {
  it('phase 1 spits a lobbed fireball with a telegraphed landing disc and leaves a 40 px pool for 6 s', () => {
    const run = plainEnd();
    run.end.brain.spitT = 0.05;
    step(run, 0.2);
    expect(run.projectiles.some((p) => p.style === 'fireball' && p.lobDur > 0)).toBe(true);
    const disc = run.telegraphs.find((t) => t.kind === 'circle');
    expect(disc?.r).toBe(40);
    step(run, 1.4);
    const pool = run.zones.find((z) => !z.friendly);
    expect(pool).toBeDefined();
    expect(pool?.r).toBe(40);
    expect(pool?.dur).toBe(6);
    expect(pool?.dps).toBeGreaterThan(0);
  });

  it('phase 2 roars, then telegraphs a steady 60 px lane for 1.8 s before the dive', () => {
    const run = plainEnd();
    const d = dragonOf(run);
    d.hp = d.maxHp * 0.7;
    step(run, 0.1);
    expect(run.end.brain.phase).toBe(2);
    expect(run.end.brain.mode).toBe('roar');
    run.end.brain.diveCd = 0;
    let lane = run.telegraphs.find((t) => t.kind === 'line' && t.w === DIVE_WIDTH);
    for (let i = 0; i < 400 && !lane; i++) {
      step(run, 1 / 60);
      lane = run.telegraphs.find((t) => t.kind === 'line' && t.w === DIVE_WIDTH);
    }
    expect(lane).toBeDefined();
    expect(lane?.steady).toBe(true);
    expect(run.end.brain.mode).toBe('telegraph');
    // No attack lands before the strip has been on the ground for 1.8 s.
    const b = run.end.brain;
    let t = 0;
    while (b.mode === 'telegraph') {
      step(run, 1 / 60);
      t += 1 / 60;
    }
    expect(t).toBeGreaterThan(1.7);
    expect(b.mode).toBe('dive');
    // The lane is still drawn while the dragon flies it.
    expect(lane && lane.t < lane.dur).toBe(true);
  });

  it('a hero who steps out of the lane is not touched; one who stays is hurt, shoved 120 px and given i-frames', () => {
    const lanes = (stay: boolean): { hurt: number; moved: number; iframes: number } => {
      const run = plainEnd(100, 7);
      const d = dragonOf(run);
      d.hp = d.maxHp * 0.7;
      step(run, 0.1);
      run.end.brain.mode = 'orbit';
      run.end.brain.diveCd = 0;
      const p = run.player;
      p.x = 0;
      p.y = 40;
      p.iframes = 0;
      while (modeOf(run) !== 'telegraph') step(run, 1 / 60);
      const b = run.end.brain;
      if (!stay) {
        // 90 px to the side of the lane.
        p.x += -b.dive.uy * 90;
        p.y += b.dive.ux * 90;
      }
      p.iframes = 0;
      const start = { x: p.x, y: p.y };
      const hp0 = p.hp;
      let iframes = 0;
      while (b.mode === 'telegraph') step(run, 1 / 60);
      for (let i = 0; i < 400 && b.mode === 'dive'; i++) {
        step(run, 1 / 60);
        if (p.hp < hp0 && iframes === 0) iframes = p.iframes;
      }
      step(run, 0.4);
      return { hurt: hp0 - p.hp, moved: Math.hypot(p.x - start.x, p.y - start.y), iframes };
    };
    const away = lanes(false);
    expect(away.hurt).toBe(0);
    const stayed = lanes(true);
    expect(stayed.hurt).toBeGreaterThan(40);
    expect(stayed.moved).toBeGreaterThan(DIVE_KNOCK * 0.8);
    expect(stayed.moved).toBeLessThan(DIVE_KNOCK * 1.2);
    expect(stayed.iframes).toBeGreaterThan(0.8);
  });

  it('a ready shield parries the dive and staggers the dragon onto the ground', () => {
    const run = plainEnd(100, 7);
    const d = dragonOf(run);
    d.hp = d.maxHp * 0.7;
    step(run, 0.1);
    run.end.brain.mode = 'orbit';
    run.end.brain.diveCd = 0;
    run.shield = { has: true, ready: true, timer: 0, cd: 8, thorns: 0, reflect: false };
    run.player.x = 0;
    run.player.y = 40;
    const hp0 = run.player.hp;
    for (let i = 0; i < 900 && modeOf(run) !== 'stunned'; i++) step(run, 1 / 60);
    expect(run.end.brain.mode).toBe('stunned');
    expect(run.end.brain.stunnedBy).toBe('shield');
    expect(run.player.hp).toBe(hp0);
    expect(run.shield.ready).toBe(false);
  });

  it('phase 3 comes down to the fountain, perches, and sweeps the half circle behind it', () => {
    const run = plainEnd();
    const d = dragonOf(run);
    d.hp = d.maxHp * 0.35;
    step(run, 0.1);
    const b = run.end.brain;
    expect(b.phase).toBe(3);
    expect(b.mode).toBe('landing');
    // A steady landing disc warns of the slam.
    expect(run.telegraphs.some((t) => t.kind === 'circle' && t.r === 56 && t.steady)).toBe(true);
    for (let i = 0; i < 400 && b.mode !== 'perch'; i++) step(run, 1 / 60);
    expect(b.mode).toBe('perch');
    expect(Math.hypot(d.x, d.y)).toBeLessThan(14);
    let arc = run.telegraphs.find((t) => t.kind === 'arc');
    for (let i = 0; i < 400 && !arc; i++) {
      step(run, 1 / 60);
      arc = run.telegraphs.find((t) => t.kind === 'arc');
    }
    expect(arc).toBeDefined();
    expect((arc?.a1 ?? 0) - (arc?.a0 ?? 0)).toBeCloseTo(Math.PI, 5);
    // After ten seconds it takes off again and flies eight before it comes back.
    for (let i = 0; i < 60 * 14 && b.mode === 'perch'; i++) step(run, 1 / 60);
    expect(b.mode).not.toBe('perch');
    expect(dragonStatus(run.end).text).toContain('Crystals');
  });
});

describe('the dragon falls', () => {
  it('rains XP worth about three levels, lays the egg, opens the exit and ends the run in victory', () => {
    const run = plainEnd();
    run.level = 20;
    run.xp = 0;
    const d = dragonOf(run);
    const total = (level: number, xp: number): number => {
      let s = xp;
      for (let l = 1; l < level; l++) s += xpToNext(l);
      return s;
    };
    const xp0 = total(run.level, run.xp);
    const shower = xpShowerTotal(run);
    const emeralds0 = run.emeraldsPicked;
    const rare0 = run.rareSpawnEggs;
    killEnemy(run, d, true);
    expect(run.end.deathT).toBe(0);
    expect(run.endDragonKilled).toBe(true);
    expect(run.end.brain.mode).toBe('dying');
    step(run, DEATH_ANIM + 0.3);
    expect(run.end.orbsLeft).toBe(0);
    expect(run.end.egg?.taken).toBe(false);
    expect(run.end.exit).not.toBeNull();
    expect(getMarkers(run).filter((m) => m.color === '#df7cff').length).toBeGreaterThanOrEqual(2);
    step(run, 6);
    // Dragon XP (400) plus the shower, all collected.
    expect(total(run.level, run.xp) - xp0).toBeGreaterThan(400 + shower - 5);
    expect(total(run.level, run.xp) - xp0).toBeLessThan(400 + shower + 5);
    expect(run.level - 20).toBeGreaterThanOrEqual(4);
    expect(run.level - 20).toBeLessThanOrEqual(6);
    // The egg: pay-out once.
    const egg = run.end.egg;
    if (!egg) throw new Error('no egg');
    run.player.x = egg.x;
    run.player.y = egg.y + 6;
    step(run, 0.1);
    expect(egg.taken).toBe(true);
    expect(run.dragonEgg).toBe(true);
    expect(run.emeraldsPicked - emeralds0).toBeGreaterThanOrEqual(EGG_EMERALDS);
    const afterEgg = run.emeraldsPicked;
    step(run, 1);
    expect(run.emeraldsPicked).toBe(afterEgg);
    // The exit portal: final victory, overworld restored, bigger payout than the Warden's.
    const overworld = run.end.stash?.world;
    run.player.x = EXIT_PORTAL.x;
    run.player.y = EXIT_PORTAL.y;
    step(run, 0.1);
    expect(run.end.victory).toBe(true);
    expect(run.won).toBe(true);
    expect(run.victoryShown).toBe(true);
    expect(run.end.active).toBe(false);
    expect(run.world).toBe(overworld);
    expect(run.emeraldsPicked - emeralds0).toBeGreaterThanOrEqual(EGG_EMERALDS + VICTORY_EMERALDS);
    expect(run.rareSpawnEggs - rare0).toBeGreaterThanOrEqual(3);
  });

  it('records the dragon and the egg for missions and achievements', () => {
    const run = plainEnd();
    const d = dragonOf(run);
    killEnemy(run, d, true);
    run.dragonEgg = true;
    run.end.victory = true;
    run.won = true;
    const rec = run.stats.snapshot(run, 1_700_000_000_000);
    expect(rec.endDragon).toBe(true);
    expect(rec.dragonEgg).toBe(true);
    expect(rec.killsByType['ender_dragon']).toBe(1);
    const save = defaultSave();
    ensureMissions(save, 1_700_000_000_000);
    const out = finishRun(save, rec, 1000, 1_700_000_000_000);
    expect(save.stats.counters['endDragons']).toBe(1);
    expect(save.stats.counters['dragonEggs']).toBe(1);
    expect(out.unlocked.map((a) => a.id)).toEqual(
      expect.arrayContaining(['dragon_slayer', 'the_end']),
    );
    // A weekly mission to defeat the dragon counts the kill.
    const probe = defaultSave();
    ensureMissions(probe, 1_700_000_000_000);
    probe.missions.weekly = [{ id: 'w_dragon', progress: 0, claimed: false }];
    const changes = applyRunToMissions(probe, rec, 1_700_000_000_000);
    expect(changes.some((c) => c.id === 'w_dragon' && c.completedNow)).toBe(true);
  });

  it('the final victory scroll tells the story and the numbers', () => {
    const run = plainEnd();
    run.dragonEgg = true;
    run.kills = 1234;
    const lines = finalVictoryLines(run).map((l) => l.text);
    expect(lines[0]).toBe('THE END');
    expect(lines.some((l) => l.includes('Ender Dragon'))).toBe(true);
    expect(lines.some((l) => l.includes('Dragon Egg') && l.includes('carry'))).toBe(true);
    expect(lines.some((l) => l.startsWith('Mobs slain'))).toBe(true);
    run.dragonEgg = false;
    expect(finalVictoryLines(run).some((l) => l.text.includes('stays behind'))).toBe(true);
  });
});

describe('music and status', () => {
  it('the End plays its own theme, even during the dragon fight, and the biome theme returns after it', () => {
    const m = new MusicDirector();
    const sit = (end: boolean, boss = false) => ({
      biome: 'plains' as const,
      night: 0,
      boss,
      rift: false,
      end,
    });
    expect(m.update(0.1, sit(false))).toBe('plains');
    expect(m.update(0.1, sit(true, true))).toBe('end');
    expect(m.update(0.1, sit(true))).toBe('end');
    expect(m.update(0.1, sit(false))).toBe('plains');
  });

  it('the boss bar line says what can hurt the dragon right now', () => {
    const run = plainEnd();
    expect(dragonStatus(run.end).text).toBe('Crystals 6/6 - flying: ranged only');
    run.end.brain.mode = 'perch';
    expect(dragonStatus(run.end).text).toContain('perched');
    run.end.brain.mode = 'stunned';
    expect(dragonStatus(run.end).text).toContain('grounded');
  });
});

describe('scripted fights (the numbers of docs/DECISIONS.md)', () => {
  it('a strong build kills the dragon in about 90 to 240 s of real fight, through all three phases', () => {
    const run = endRun(STRONG, 21);
    const r = fight(run, 600);
    expect(r.dragonDead).toBe(true);
    expect(r.heroDead).toBe(false);
    expect(r.seconds).toBeGreaterThan(75);
    expect(r.seconds).toBeLessThan(260);
    expect(r.phaseAt[3]).toBeDefined();
    expect(r.voidFalls).toBe(0);
  });

  it('a mid build is outlasted by the fight: much slower, but the dragon can still fall', () => {
    const strong = fight(endRun(STRONG, 22), 600);
    const run = endRun(MID, 22);
    const r = fight(run, 1500);
    expect(strong.dragonDead).toBe(true);
    expect(r.seconds).toBeGreaterThan(strong.seconds * 3);
    expect(r.dragonDead).toBe(true);
    expect(r.heroDead).toBe(false);
  });

  it('the harness itself is deterministic', () => {
    const a = fight(endRun(STRONG, 5), 40);
    const b = fight(endRun(STRONG, 5), 40);
    expect(a.seconds).toBe(b.seconds);
    expect(a.minHpFrac).toBe(b.minHpFrac);
  });
});
