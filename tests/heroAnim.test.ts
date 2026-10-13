import { describe, expect, it } from 'vitest';
import {
  DIR_HYSTERESIS,
  WALK_DIRS,
  handPlace,
  heldAnimId,
  locomotionState,
  pickWalkDir,
  walkAnimId,
  walkArmorFor,
  walkFrameIndex,
  type WalkDir,
} from '../src/core/heroAnim';
import { centerShift } from '../src/core/feet';
import type { InputSource } from '../src/core/input';
import { STEP } from '../src/core/loop';
import { Player } from '../src/entities/player';
import { World } from '../src/world/world';

const keys = (x: number, y: number): InputSource => ({
  moveVector: () => ({ x, y }),
  pausePressed: () => false,
  confirmPressed: () => false,
  cancelPressed: () => false,
  activePressed: () => false,
  endStep() {},
});

describe('walk direction selection', () => {
  it('picks the dominant axis and its sign', () => {
    expect(pickWalkDir('down', 1, 0)).toBe('right');
    expect(pickWalkDir('down', -1, 0)).toBe('left');
    expect(pickWalkDir('left', 0, 1)).toBe('down');
    expect(pickWalkDir('left', 0, -1)).toBe('up');
  });

  it('keeps the previous row for no movement', () => {
    for (const d of WALK_DIRS) expect(pickWalkDir(d, 0, 0)).toBe(d);
  });

  it('does not flicker on a diagonal: the previous axis sticks, up and down alike', () => {
    const s = Math.SQRT1_2;
    expect(pickWalkDir('right', s, s)).toBe('right');
    expect(pickWalkDir('right', s, -s)).toBe('right');
    expect(pickWalkDir('left', -s, s)).toBe('left');
    expect(pickWalkDir('down', s, s)).toBe('down');
    expect(pickWalkDir('up', -s, -s)).toBe('up');
    // a stick wobbling around 45 degrees never changes the row
    let dir: WalkDir = 'right';
    for (let i = 0; i < 200; i++) {
      const a = Math.PI / 4 + Math.sin(i * 0.7) * 0.18; // 45 deg +- 10 deg
      dir = pickWalkDir(dir, Math.cos(a), Math.sin(a));
      expect(dir).toBe('right');
    }
  });

  it('switches once the other axis is clearly stronger', () => {
    const k = DIR_HYSTERESIS;
    expect(pickWalkDir('right', 1, k * 1.01)).toBe('down');
    expect(pickWalkDir('right', 1, k * 0.99)).toBe('right');
    expect(pickWalkDir('down', k * 1.01, 1)).toBe('right');
    expect(pickWalkDir('down', k * 0.99, 1)).toBe('down');
  });

  it('is stable in both directions: no oscillation along a slow turn', () => {
    // turn from right (0 deg) to down (90 deg) in small steps: exactly one switch
    let dir: WalkDir = 'right';
    let switches = 0;
    for (let deg = 0; deg <= 90; deg++) {
      const a = (deg * Math.PI) / 180;
      const next = pickWalkDir(dir, Math.cos(a), Math.sin(a));
      if (next !== dir) switches++;
      dir = next;
    }
    expect(switches).toBe(1);
    expect(dir).toBe('down');
    // and back
    for (let deg = 90; deg >= 0; deg--) {
      const a = (deg * Math.PI) / 180;
      const next = pickWalkDir(dir, Math.cos(a), Math.sin(a));
      if (next !== dir) switches++;
      dir = next;
    }
    expect(switches).toBe(2);
    expect(dir).toBe('right');
  });

  it('the player tracks it from its input', () => {
    const world = new World(9);
    const p = new Player();
    expect(p.walkDir).toBe('down');
    p.update(STEP, keys(1, 0), world, 'plains');
    expect(p.walkDir).toBe('right');
    p.update(STEP, keys(Math.SQRT1_2, Math.SQRT1_2), world, 'plains');
    expect(p.walkDir).toBe('right');
    p.update(STEP, keys(0, -1), world, 'plains');
    expect(p.walkDir).toBe('up');
    p.update(STEP, keys(0, 0), world, 'plains'); // releasing keeps the last row
    expect(p.walkDir).toBe('up');
  });
});

describe('locomotion state machine', () => {
  it('swing beats run beats idle', () => {
    expect(locomotionState(true, true, false)).toBe('swing');
    expect(locomotionState(true, false, false)).toBe('swing');
    expect(locomotionState(false, true, false)).toBe('run');
    expect(locomotionState(false, false, false)).toBe('idle');
  });

  it('a dead hero only shows the idle pose, whatever else is going on', () => {
    expect(locomotionState(true, true, true)).toBe('idle');
    expect(locomotionState(false, true, true)).toBe('idle');
  });
});

describe('walk cycle bookkeeping', () => {
  it('walk frames follow the half-stride counter, stand-step-stand-step', () => {
    expect([0, 1, 2, 3, 4, 5].map(walkFrameIndex)).toEqual([0, 1, 2, 3, 0, 1]);
    expect(walkFrameIndex(2.9)).toBe(2);
  });

  it('advances with the distance travelled (about 28 px per cycle) and a footfall each half stride', () => {
    const world = new World(9);
    const p = new Player();
    const right = keys(1, 0);
    for (let i = 0; i < 12; i++) p.update(STEP, right, world, 'plains'); // reach full speed
    const start = p.x;
    const phase0 = p.walkPhase;
    let falls = 0;
    for (let i = 0; i < 60; i++) {
      p.update(STEP, right, world, 'plains');
      if (p.footfall) falls++;
    }
    const dist = p.x - start;
    expect(p.walkPhase - phase0).toBeCloseTo(dist / 7, 1);
    expect(falls).toBe(Math.floor(p.walkPhase) - Math.floor(phase0));
  });

  it('ids follow the atlas scheme', () => {
    expect(walkAnimId('steve', 'iron', 'left')).toBe('hero.steve.iron.none.walk_left');
    expect(heldAnimId('rana', 'gold')).toBe('hero.rana.none.sword_gold.held');
  });

  it('falls back to the unarmoured walk where there is no armoured idle', () => {
    expect(walkArmorFor(true, 'iron')).toBe('iron');
    expect(walkArmorFor(false, 'iron')).toBe('none');
  });

  it('the sword is held in the right hand: left in the front view, right in the back view', () => {
    for (const hero of ['steve', 'alex', 'rana']) {
      expect(handPlace(hero, 'down').x).toBeLessThan(0);
      expect(handPlace(hero, 'down').flip).toBe(true);
      expect(handPlace(hero, 'up').x).toBeGreaterThan(0);
      expect(handPlace(hero, 'up').behind).toBe(true);
      expect(handPlace(hero, 'left').flip).toBe(true);
      expect(handPlace(hero, 'right').flip).toBe(false);
    }
  });

  it('centres a body on the anchor by whole pixels', () => {
    expect(centerShift({ x: -12, lift: 0, cx: -8.5 })).toBe(9);
    expect(centerShift({ x: 0, lift: 0, cx: 1.5 })).toBe(-1);
    expect(centerShift(null)).toBe(0);
  });
});
