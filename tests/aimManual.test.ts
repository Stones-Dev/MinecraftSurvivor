import { describe, expect, it } from 'vitest';
import { AimResolver, aimModeOf, mouseAim, stickAim, type AimFrame } from '../src/core/aim';
import { padAim } from '../src/core/gamepad';
import { MergedInput, type InputSource } from '../src/core/input';
import { SAVE_VERSION, defaultSave, tryMigrate, type SaveData } from '../src/core/save';
import { TouchInput } from '../src/core/touch';
import { aimHint, aimModeLabel } from '../src/ui/inputLabels';
import { RunState } from '../src/game';
import { makeEnemy } from '../src/systems/spawner';
import { newWeapon } from '../src/weapons';
import type { WeaponId } from '../src/weapons/types';

class StillInput implements InputSource {
  moveVector(): { x: number; y: number } {
    return { x: 0, y: 0 };
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

const r3 = (n: number): number => Math.round(n * 1000) / 1000;

/** Fixed scene: three motionless, very tough zombies; the weapon fires once or twice; returns what it launched. */
function scene(id: WeaponId, level = 1, evolved = false): RunState {
  const run = new RunState(77);
  const w = newWeapon(id);
  w.level = level;
  w.evolved = evolved;
  run.weapons = [w];
  const spots: [number, number][] = [
    [70, -20],
    [-40, 50],
    [30, 90],
    [26, -14],
  ];
  for (const [dx, dy] of spots) {
    const e = makeEnemy(run, 'zombie', run.player.x + dx, run.player.y + dy, false);
    if (!e) throw new Error('no zombie');
    e.speed = 0;
    e.hp = e.maxHp = 1e6;
    run.enemies.push(e);
  }
  return run;
}

function digest(run: RunState, steps = 150): string {
  const input = new StillInput();
  const seen = new Set<object>();
  const parts: string[] = [];
  for (let i = 0; i < steps; i++) {
    run.update(1 / 60, input);
    for (const p of run.projectiles)
      if (p.friendly && !seen.has(p)) {
        seen.add(p);
        parts.push(`${i}P${r3(p.vx)},${r3(p.vy)},${r3(p.tx)},${r3(p.ty)}`);
      }
    for (const z of run.zones)
      if (!seen.has(z)) {
        seen.add(z);
        parts.push(`${i}Z${r3(z.x)},${r3(z.y)}`);
      }
    for (const f of run.fx)
      if (f.kind === 'arc' && !seen.has(f)) {
        seen.add(f);
        parts.push(`${i}A${r3(f.a0)},${r3(f.a1)}`);
      }
  }
  parts.push(`F${run.player.aimFacing}`);
  return parts.join('|');
}

/** Captured on f1d0711 (v1.3) before the manual aim feature existed: auto mode must reproduce it exactly. */
const GOLDEN: Record<string, string> = {
  'bow:1': '18P176.975,-130.689,0,0|96P191.352,-108.557,0,0|F1',
  'bow:5':
    '18P157.007,-154.106,0,0|18P176.975,-130.689,0,0|18P193.481,-104.715,0,0|72P195.447,-100.997,0,0|72P207.628,-72.735,0,0|72P215.747,-43.05,0,0|126P213.943,-51.27,0,0|126P219.004,-20.914,0,0|126P219.779,9.851,0,0|F1',
  'crossbow:1': '18P209.153,-154.451,0,0|F1',
  'trident:1': '18P209.153,-154.451,0,0|127P227.528,-125.822,0,0|F1',
  'snowball:3':
    '18P135.705,-173.16,0,0|18P164.513,-146.067,0,0|18P188.005,-114.254,0,0|18P205.423,-78.75,0,0|115P167.051,-143.157,0,0|115P189.981,-110.937,0,0|115P206.773,-75.133,0,0|115P216.883,-36.9,0,0|F1',
  'fishing_rod:3':
    '18P160.887,-118.809,0,0|18P-133.203,149.188,0,0|120P-186.663,71.811,0,0|120P-138.013,144.75,0,0|F-1',
  'harming:3': '18P0,0,26,-18|F1',
  'poison:3': '18P0,0,26,-18|59Z26,-18|F1',
  'sword:1': '18A-1.594,0.606|69A-1.594,0.606|120A-1.594,0.606|F1',
  'axe:1': '18A-1.494,0.506|133A-1.494,0.506|F1',
  'sword:5e': '18A-3.636,2.648|54A-3.636,2.648|90A-3.636,2.648|126A-3.636,2.648|F1',
  'bow:5e':
    '18P157.007,-154.106,0,0|18P176.975,-130.689,0,0|18P193.481,-104.715,0,0|72P195.447,-100.997,0,0|72P207.628,-72.735,0,0|72P215.747,-43.05,0,0|126P213.943,-51.27,0,0|126P219.004,-20.914,0,0|126P219.779,9.851,0,0|F1',
  'trident:5e':
    '18P192.688,-174.56,0,0|18P223.527,-132.799,0,0|102P75.924,248.667,0,0|102P25.008,258.794,0,0|F1',
  'crossbow:5e':
    '18P164.439,-201.395,0,0|18P188.265,-179.322,0,0|18P209.153,-154.451,0,0|18P226.777,-127.17,0,0|18P240.862,-97.904,0,0|109P245.364,-86.003,0,0|109P254.172,-54.741,0,0|109P259.014,-22.625,0,0|109P259.814,9.843,0,0|109P256.559,42.159,0,0|F1',
  'fishing_rod:5e':
    '18P160.887,-118.809,0,0|18P-133.203,149.188,0,0|18P188.177,-67.744,0,0|66P-197.427,31.981,0,0|66P-137.951,144.809,0,0|66P186.159,-73.109,0,0|114P-155.654,125.586,0,0|114P184.454,-77.31,0,0|114P154.733,-126.719,0,0|F-1',
};

describe('auto aim is unchanged by the manual aim feature (golden launches)', () => {
  const cases: [WeaponId, number, boolean][] = [
    ['bow', 1, false],
    ['bow', 5, false],
    ['crossbow', 1, false],
    ['trident', 1, false],
    ['snowball', 3, false],
    ['fishing_rod', 3, false],
    ['harming', 3, false],
    ['poison', 3, false],
    ['sword', 1, false],
    ['axe', 1, false],
    ['sword', 5, true],
    ['bow', 5, true],
    ['trident', 5, true],
    ['crossbow', 5, true],
    ['fishing_rod', 5, true],
  ];
  for (const [id, level, evolved] of cases) {
    it(`${id} L${level}${evolved ? ' evolved' : ''}`, () => {
      const got = digest(scene(id, level, evolved));
      expect(got).toBe(GOLDEN[`${id}:${level}${evolved ? 'e' : ''}`]);
    });
  }
});

// ---------------------------------------------------------------------------------------------------
// Pure aim resolution

const pad = (axes: number[]) => ({ axes, buttons: [] as { pressed: boolean }[] });
const step = (r: AimResolver, o: Partial<AimFrame> = {}): ReturnType<AimResolver['step']> =>
  r.step({
    dt: 0.1,
    stick: null,
    pointer: { x: 0, y: 0 },
    mouse: { x: 50, y: 0 },
    device: 'keyboard',
    ...o,
  });

describe('manual aim resolution', () => {
  it('right stick: dead zone, then a unit direction', () => {
    expect(stickAim(0.1, 0.1)).toBeNull();
    expect(stickAim(0.29, 0)).toBeNull();
    const v = stickAim(0, -0.5);
    expect(v?.x).toBeCloseTo(0, 6);
    expect(v?.y).toBeCloseTo(-1, 6);
    const d = stickAim(0.6, 0.6);
    expect(Math.hypot(d?.x ?? 0, d?.y ?? 0)).toBeCloseTo(1, 6);
    expect(stickAim(Number.NaN, 1)).toBeNull();
    // The pad mapping reads axes 2 and 3 (the left stick, axes 0 and 1, never aims).
    expect(padAim(pad([1, 1, 0.05, 0.05]))).toBeNull();
    expect(padAim(pad([0, 0, 0, 1]))).toEqual({ x: 0, y: 1 });
    expect(padAim({ axes: [], buttons: [] })).toBeNull();
  });

  it('mouse: unit vector and distance, nothing right on top of the hero', () => {
    expect(mouseAim({ x: 3, y: 4 })).toBeNull();
    const m = mouseAim({ x: 30, y: 40 });
    expect(m?.x).toBeCloseTo(0.6, 6);
    expect(m?.y).toBeCloseTo(0.8, 6);
    expect(m?.dist).toBeCloseTo(50, 6);
  });

  it('auto when no source was ever used (a pad player who never touches the stick or the mouse)', () => {
    const r = new AimResolver();
    for (let i = 0; i < 40; i++) expect(step(r, { device: 'pad' })).toBeNull();
  });

  it('a mouse that has moved aims for good on keyboard and mouse', () => {
    const r = new AimResolver();
    expect(step(r)).toBeNull(); // first sample: baseline only
    const a = step(r, { pointer: { x: 20, y: 5 }, mouse: { x: 0, y: -40 } });
    expect(a?.source).toBe('mouse');
    expect(a?.y).toBeCloseTo(-1, 6);
    expect(a?.dist).toBeCloseTo(40, 6);
    for (let i = 0; i < 100; i++) step(r, { pointer: { x: 20, y: 5 }, mouse: { x: 0, y: -40 } });
    expect(step(r, { pointer: { x: 20, y: 5 }, mouse: { x: 0, y: -40 } })?.source).toBe('mouse');
    // The pointer on top of the hero gives no direction.
    expect(step(r, { pointer: { x: 20, y: 5 }, mouse: { x: 2, y: 2 } })).toBeNull();
  });

  it('the stick holds its direction for 1.5 s, then falls back to auto', () => {
    const r = new AimResolver();
    step(r, { device: 'pad' });
    const a = step(r, { device: 'pad', stick: { x: 0, y: 1 } });
    expect(a).toMatchObject({ x: 0, y: 1, dist: 0, source: 'stick' });
    // Released: still aimed at 1.4 s...
    for (let i = 0; i < 14; i++) expect(step(r, { device: 'pad' })?.source).toBe('stick');
    // ...and auto again after 1.5 s of no input.
    let last = step(r, { device: 'pad' });
    for (let i = 0; i < 3; i++) last = step(r, { device: 'pad' });
    expect(last).toBeNull();
    // Deflecting again re-arms it.
    expect(step(r, { device: 'pad', stick: { x: 1, y: 0 } })?.x).toBe(1);
  });

  it('on a pad a mouse only counts for a moment after it moved; on touch never', () => {
    const r = new AimResolver();
    step(r, { device: 'pad' });
    const moved = { pointer: { x: 10, y: 10 }, device: 'pad' as const };
    expect(step(r, moved)?.source).toBe('mouse');
    for (let i = 0; i < 13; i++) expect(step(r, moved)?.source).toBe('mouse');
    for (let i = 0; i < 3; i++) step(r, moved);
    expect(step(r, moved)).toBeNull();
    const t = new AimResolver();
    step(t, { device: 'touch' });
    expect(step(t, { device: 'touch', pointer: { x: 99, y: 9 } })).toBeNull();
  });

  it('the freshest of stick and mouse wins, a tie goes to the stick', () => {
    const r = new AimResolver();
    step(r, { device: 'pad' });
    step(r, { device: 'pad', pointer: { x: 5, y: 5 }, mouse: { x: 0, y: -40 } });
    // Both fresh in the same step: the stick.
    const both = step(r, {
      device: 'pad',
      pointer: { x: 9, y: 9 },
      stick: { x: 1, y: 0 },
      mouse: { x: 0, y: -40 },
    });
    expect(both?.source).toBe('stick');
    // Then the mouse moves while the stick rests: the mouse is the fresher one.
    step(r, { device: 'pad', pointer: { x: 9, y: 9 }, mouse: { x: 0, y: -40 } });
    expect(
      step(r, { device: 'pad', pointer: { x: 30, y: 9 }, mouse: { x: 0, y: -40 } })?.source,
    ).toBe('mouse');
  });

  it('settings: only an explicit manual is manual, and the save sanitizes unknown values to auto', () => {
    expect(aimModeOf({})).toBe('auto');
    expect(aimModeOf({ aim: 'auto' })).toBe('auto');
    expect(aimModeOf({ aim: 'manual' })).toBe('manual');
    const base = defaultSave(1);
    expect('aim' in base.settings).toBe(false);
    const roundtrip = (aim: unknown): SaveData['settings']['aim'] => {
      const raw = JSON.parse(JSON.stringify(base)) as SaveData;
      (raw.settings as Record<string, unknown>)['aim'] = aim;
      return tryMigrate(raw)?.settings.aim;
    };
    expect(roundtrip('manual')).toBe('manual');
    expect(roundtrip('auto')).toBe('auto');
    expect(roundtrip('mouse')).toBe('auto');
    expect(roundtrip(7)).toBe('auto');
    expect(tryMigrate(JSON.parse(JSON.stringify(base)))?.settings.aim).toBeUndefined();
    expect(tryMigrate(JSON.parse(JSON.stringify(base)))?.saveVersion).toBe(SAVE_VERSION);
  });

  it('labels', () => {
    expect(aimModeLabel('auto')).toBe('Auto');
    expect(aimModeLabel('manual')).toBe('Manual');
    expect(aimHint('keyboard')).toMatch(/mouse/);
    expect(aimHint('pad')).toMatch(/right stick/);
    expect(aimHint('touch')).toMatch(/right/);
  });
});

// ---------------------------------------------------------------------------------------------------
// Input plumbing

describe('aim stick input', () => {
  const W = 426;
  const H = 240;

  it('merged input passes the first deflected aim stick', () => {
    const none: InputSource = new StillInput();
    const aiming: InputSource = {
      ...new StillInput(),
      aimVector: () => ({ x: 0, y: 1 }),
    } as InputSource;
    expect(new MergedInput([none]).aimVector()).toBeNull();
    expect(new MergedInput([none, aiming]).aimVector()).toEqual({ x: 0, y: 1 });
  });

  it('touch: the right part is an aim stick only in manual aim, and never over a button', () => {
    const t = new TouchInput();
    // Auto aim: the right side is untouched, as before.
    expect(t.pointerDown(1, 380, 100, W, H)).toBe(false);
    t.aimEnabled = true;
    // A button in the right zone still wins.
    const ability = t.buttons(W, H).find((b) => b.id === 'ability');
    if (!ability) throw new Error('no ability button');
    expect(t.pointerDown(2, ability.x, ability.y, W, H)).toBe(true);
    expect(t.isHeld('ability')).toBe(true);
    // The left 60% is still the move stick.
    expect(t.pointerDown(3, 100, 150, W, H)).toBe(true);
    expect(t.aimVector()).toBeNull();
    // A touch on the right starts the aim stick; a short drag is inside the dead zone.
    expect(t.pointerDown(4, 360, 120, W, H)).toBe(true);
    t.pointerMove(4, 363, 120);
    expect(t.aimVector()).toBeNull();
    t.pointerMove(4, 360, 80);
    const v = t.aimVector();
    expect(v?.x).toBeCloseTo(0, 6);
    expect(v?.y).toBeCloseTo(-1, 6);
    // It does not move the hero, and a second right-side finger is not taken.
    expect(t.moveVector()).toEqual({ x: 0, y: 0 });
    expect(t.pointerDown(5, 330, 40, W, H)).toBe(false);
    t.pointerUp(4);
    expect(t.aimVector()).toBeNull();
  });

  it('touch: a modal screen drops the aim stick', () => {
    const t = new TouchInput();
    t.aimEnabled = true;
    t.pointerDown(1, 360, 120, W, H);
    t.pointerMove(1, 360, 60);
    expect(t.aimVector()).not.toBeNull();
    t.suspend();
    expect(t.aimVector()).toBeNull();
  });

  it('the aim stick leaves the existing button layout alone', () => {
    const t = new TouchInput();
    const before = JSON.stringify(t.buttons(W, H, 2));
    t.aimEnabled = true;
    expect(JSON.stringify(t.buttons(W, H, 2))).toBe(before);
  });
});

// ---------------------------------------------------------------------------------------------------
// Weapons follow the manual aim

/** First friendly projectiles launched with the hero aiming straight up while every enemy stands to the right. */
function launched(id: WeaponId, level: number, dir: { x: number; y: number }, dx = 60): RunState {
  const run = new RunState(5);
  const w = newWeapon(id);
  w.level = level;
  run.weapons = [w];
  const e = makeEnemy(run, 'zombie', run.player.x + dx, run.player.y + 5, false);
  if (!e) throw new Error('no zombie');
  e.speed = 0;
  e.hp = e.maxHp = 1e6;
  run.enemies.push(e);
  run.player.manualAim = { ...dir, dist: 0, source: 'stick' };
  const input = new StillInput();
  for (let i = 0; i < 40 && !run.projectiles.some((p) => p.friendly); i++)
    run.update(1 / 60, input);
  return run;
}

describe('weapons fire along the manual aim', () => {
  const up = { x: 0, y: -1 };
  for (const [id, level] of [
    ['bow', 1],
    ['bow', 5],
    ['crossbow', 1],
    ['trident', 1],
    ['snowball', 3],
  ] as const) {
    it(`${id} L${level} shoots up although the enemy is to the right`, () => {
      const run = launched(id, level, up);
      const shots = run.projectiles.filter((p) => p.friendly);
      expect(shots.length).toBeGreaterThan(0);
      const mean = shots.reduce((a, p) => a + Math.atan2(p.vy, p.vx), 0) / shots.length;
      expect(mean).toBeCloseTo(-Math.PI / 2, 1);
      // The fan stays symmetric around the aim.
      expect(Math.min(...shots.map((p) => p.vy))).toBeLessThan(-100);
    });
  }

  it('the fishing rod throws straight hooks that do not home on the enemy', () => {
    const run = launched('fishing_rod', 1, up);
    const hook = run.projectiles.find((p) => p.friendly);
    expect(hook).toBeDefined();
    expect(hook?.homing).toBe(false);
    expect(Math.atan2(hook?.vy ?? 0, hook?.vx ?? 1)).toBeCloseTo(-Math.PI / 2, 1);
  });

  it('a potion lands where the player points, not on the nearest enemy', () => {
    const run = launched('harming', 1, up);
    const potion = run.projectiles.find((p) => p.friendly && p.lobDur > 0);
    expect(potion).toBeDefined();
    const p = run.player;
    // Straight above the hero (stick aim: 65% of the 200 px range), nowhere near the zombie to the right.
    expect(potion?.tx).toBeCloseTo(p.x, 0);
    expect((potion?.ty ?? 0) < p.y - 100).toBe(true);
  });

  it('a mouse-aimed potion snaps onto an enemy next to the pointer', () => {
    const run = new RunState(6);
    run.weapons = [newWeapon('poison')];
    const p = run.player;
    const near = makeEnemy(run, 'zombie', p.x, p.y - 100, false);
    const far = makeEnemy(run, 'zombie', p.x + 60, p.y + 5, false);
    if (!near || !far) throw new Error('no zombies');
    for (const e of [near, far]) {
      e.speed = 0;
      e.hp = e.maxHp = 1e6;
      run.enemies.push(e);
    }
    p.manualAim = { x: 0, y: -1, dist: 92, source: 'mouse' };
    const input = new StillInput();
    for (let i = 0; i < 40 && !run.projectiles.some((q) => q.friendly); i++)
      run.update(1 / 60, input);
    const potion = run.projectiles.find((q) => q.friendly && q.lobDur > 0);
    expect(potion?.tx).toBeCloseTo(near.x, 0);
    expect(potion?.ty).toBeCloseTo(near.y - 4, 0);
  });

  it('the sword and the axe swing toward the aim', () => {
    for (const id of ['sword', 'axe'] as const) {
      const run = launched(id, 1, { x: -1, y: 0 }, 25);
      const input = new StillInput();
      let arc = run.fx.find((f) => f.kind === 'arc');
      for (let i = 0; i < 120 && !arc; i++) {
        run.update(1 / 60, input);
        arc = run.fx.find((f) => f.kind === 'arc');
      }
      expect(arc, id).toBeDefined();
      if (!arc) continue;
      expect((arc.a0 + arc.a1) / 2).toBeCloseTo(Math.PI, 1);
    }
  });

  it('the hero turns to the aimed side while standing still', () => {
    const run = launched('bow', 1, { x: -1, y: 0 });
    expect(run.player.aimFacing).toBe(-1);
    expect(run.player.facing).toBe(-1);
  });

  it('lightning rod, TNT and the passive weapons ignore the aim', () => {
    for (const id of ['tnt', 'lightning_rod'] as const) {
      const run = new RunState(3);
      run.weapons = [newWeapon(id)];
      const e = makeEnemy(run, 'zombie', run.player.x + 40, run.player.y, false);
      if (!e) throw new Error('no zombie');
      e.speed = 0;
      e.hp = e.maxHp = 1e6;
      run.enemies.push(e);
      run.player.manualAim = { x: -1, y: 0, dist: 0, source: 'stick' };
      for (let i = 0; i < 120; i++) run.update(1 / 60, new StillInput());
      // Both still engage the enemy that is to the right.
      expect(e.hp < e.maxHp || run.mines.length > 0).toBe(true);
    }
  });
});
