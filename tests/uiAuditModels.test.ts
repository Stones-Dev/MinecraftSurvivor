import { afterEach, describe, expect, it, vi } from 'vitest';
import { GamepadInput, PadButtonCapture } from '../src/core/gamepad';
import {
  DEFAULT_PAD_BINDINGS,
  KeyboardInput,
  inputState,
  noteInputDevice,
  parsePadBindings,
  resetInputState,
} from '../src/core/input';
import {
  NO_STREAK,
  SIGNATURE,
  SPIN_HZ_HIGH,
  SPIN_HZ_LOW,
  STREAK_MAX_PITCH,
  STREAK_WINDOW,
  spinPitchHz,
  streakAfter,
  streakPitch,
  type StreakState,
} from '../src/core/sfxModel';
import { TouchInput } from '../src/core/touch';
import { HEROES } from '../src/data/companions';
import {
  clampVolume,
  collectionStep,
  formatMult,
  heroStats,
  stepVolume,
  upgradeStep,
  volumeFromFrac,
} from '../src/ui/hubModel';
import { actionPrompt, keyLabel, padButtonLabel } from '../src/ui/inputLabels';

afterEach(() => {
  vi.unstubAllGlobals();
  resetInputState();
});

describe('roulette pitch', () => {
  it('rises monotonically from 300 to 900 Hz over the spin and clamps', () => {
    expect(spinPitchHz(0)).toBeCloseTo(SPIN_HZ_LOW, 6);
    expect(spinPitchHz(1)).toBeCloseTo(SPIN_HZ_HIGH, 6);
    let prev = 0;
    for (let i = 0; i <= 20; i++) {
      const f = spinPitchHz(i / 20);
      expect(f).toBeGreaterThan(prev);
      prev = f;
    }
    expect(spinPitchHz(-3)).toBe(spinPitchHz(0));
    expect(spinPitchHz(9)).toBe(spinPitchHz(1));
    expect(spinPitchHz(Number.NaN)).toBe(spinPitchHz(0));
  });
});

describe('kill streak', () => {
  const kill = (s: StreakState, t: number, n = 1): StreakState => streakAfter(s, t, n);

  it('the first kill is at base pitch, each further kill inside 0.6 s adds 3%', () => {
    let s = kill(NO_STREAK, 10);
    expect(streakPitch(s, 10)).toBe(1);
    s = kill(s, 10.2);
    expect(streakPitch(s, 10.2)).toBeCloseTo(1.03, 6);
    s = kill(s, 10.5);
    expect(streakPitch(s, 10.5)).toBeCloseTo(1.03 ** 2, 6);
  });

  it('several kills in one step count one by one', () => {
    const s = kill(NO_STREAK, 5, 4);
    expect(s.count).toBe(4);
    expect(streakPitch(s, 5)).toBeCloseTo(1.03 ** 3, 6);
    expect(kill(s, 5.1, 0)).toBe(s); // no kill: nothing changes
  });

  it('a gap over 0.6 s restarts the streak, and the pitch falls back once the window passes', () => {
    let s = kill(kill(NO_STREAK, 1), 1.3);
    expect(s.count).toBe(2);
    expect(streakPitch(s, 1.3 + STREAK_WINDOW + 0.01)).toBe(1);
    s = kill(s, 1.3 + STREAK_WINDOW + 0.2);
    expect(s.count).toBe(1);
  });

  it('exactly on the window edge still continues; the pitch never passes one octave', () => {
    let s = kill(NO_STREAK, 0);
    s = kill(s, STREAK_WINDOW);
    expect(s.count).toBe(2);
    let t = 0;
    for (let i = 0; i < 80; i++) {
      t += 0.2;
      s = kill(s, t);
    }
    expect(streakPitch(s, t)).toBe(STREAK_MAX_PITCH);
  });
});

describe('weapon signatures', () => {
  it('match the spec: blade 4.5 kHz / 25 ms + square 420 -> 140 Hz / 40 ms', () => {
    const b = SIGNATURE.blade;
    expect([b.noiseHz, b.noiseDur, b.toneFrom, b.toneTo, b.toneDur, b.toneType]).toEqual([
      4500,
      0.025,
      420,
      140,
      0.04,
      'square',
    ]);
  });
  it('arrow 1.8 kHz Q4 / 20 ms + triangle click; heavy sub 70 -> 35 Hz / 90 ms + 350 Hz rumble', () => {
    const a = SIGNATURE.arrow;
    expect([a.bandHz, a.bandQ, a.bandDur, a.clickType]).toEqual([1800, 4, 0.02, 'triangle']);
    const h = SIGNATURE.heavy;
    expect([h.subFrom, h.subTo, h.subDur, h.rumbleHz]).toEqual([70, 35, 0.09, 350]);
  });
  it('stay conservative: each recipe sums to under 0.7 before the limiter', () => {
    const b = SIGNATURE.blade;
    const a = SIGNATURE.arrow;
    const h = SIGNATURE.heavy;
    expect(b.noiseVol + b.toneVol).toBeLessThan(0.7);
    expect(a.bandVol + a.clickVol).toBeLessThan(0.7);
    expect(h.subVol + h.rumbleVol).toBeLessThan(0.7);
  });
});

describe('volume model', () => {
  it('steps by a tenth, clamps and rounds', () => {
    expect(stepVolume(0.6, 1)).toBe(0.7);
    expect(stepVolume(0.6, -1)).toBe(0.5);
    expect(stepVolume(1, 1)).toBe(1);
    expect(stepVolume(0, -1)).toBe(0);
    expect(clampVolume(0.349)).toBe(0.3);
    expect(clampVolume(7)).toBe(1);
    expect(clampVolume(Number.NaN)).toBe(0);
    expect(volumeFromFrac(0.5)).toBe(0.5);
    expect(volumeFromFrac(-1)).toBe(0);
  });
});

describe('effective hero stats', () => {
  it('equal the hero kit without upgrades', () => {
    const s = heroStats('alex', {});
    const alex = HEROES.find((h) => h.id === 'alex');
    expect(s.upgraded).toBe(false);
    expect(s.dmg).toBeGreaterThan(0);
    expect(s.hp).toBeGreaterThan(0);
    expect(alex).toBeDefined();
  });

  it('apply the permanent upgrades through the run maths: Vitality, Strength, Stride, Chainmail, Mending, Reflexes', () => {
    const base = heroStats('alex', {});
    const up = heroStats('alex', {
      vitality: 3,
      strength: 2,
      stride: 5,
      chainmail: 4,
      mending: 5,
      reflexes: 5,
    });
    expect(up.upgraded).toBe(true);
    expect(up.hp).toBe(base.hp + 24);
    expect(up.dmg).toBeCloseTo(base.dmg * 1.08, 9);
    expect(up.speed).toBeCloseTo(base.speed * 1.1, 9);
    expect(up.armor).toBe(base.armor + 4);
    expect(up.regen).toBeCloseTo(base.regen + 0.5, 9);
    expect(up.cd).toBeLessThan(base.cd);
  });

  it('rank 0 entries do not count as upgraded; unknown ids do not throw', () => {
    expect(heroStats('steve', { vitality: 0 }).upgraded).toBe(false);
    expect(() => heroStats('nobody', { vitality: 1 })).not.toThrow();
  });

  it('formats multipliers compactly', () => {
    expect(formatMult(1)).toBe('x1');
    expect(formatMult(1.08)).toBe('x1.08');
    expect(formatMult(1.1000001)).toBe('x1.1');
  });
});

describe('collection cursor', () => {
  const o = { cols: 4, count: 10, chips: 3 };
  const at = (zone: 'grid' | 'chips' | 'footer', index = 0, chip = 0) => ({ zone, index, chip });

  it('grid: moves between cards, and Down off the last row drops to the footer', () => {
    expect(collectionStep(at('grid', 0), 'right', o).index).toBe(1);
    expect(collectionStep(at('grid', 0), 'down', o).index).toBe(4);
    expect(collectionStep(at('grid', 9), 'down', o).zone).toBe('footer'); // last row
    expect(collectionStep(at('grid', 0), 'up', o)).toEqual(at('grid', 0)); // top edge stays
    expect(collectionStep(at('grid', 0), 'left', o)).toEqual(at('grid', 0));
  });

  it('grid: Right past the last column enters the detail chips, only when there are chips', () => {
    expect(collectionStep(at('grid', 3), 'right', o).zone).toBe('chips');
    expect(collectionStep(at('grid', 3), 'right', { ...o, chips: 0 }).zone).toBe('grid');
  });

  it('paging: Down from the last row of a page lands on the next page (indices continue)', () => {
    // 4 columns x 2 rows per page = 8: index 4 is the last row of page 0, Down gives 8 (page 1).
    expect(collectionStep(at('grid', 4), 'down', { ...o, count: 20 }).index).toBe(8);
  });

  it('chips: Left / Right pick the section, Left from the first returns to the grid, Down goes to the footer', () => {
    expect(collectionStep(at('chips', 3, 0), 'right', o).chip).toBe(1);
    expect(collectionStep(at('chips', 3, 2), 'right', o).chip).toBe(2);
    expect(collectionStep(at('chips', 3, 1), 'left', o).chip).toBe(0);
    expect(collectionStep(at('chips', 3, 0), 'left', o).zone).toBe('grid');
    expect(collectionStep(at('chips', 3, 0), 'down', o).zone).toBe('footer');
  });

  it('footer: Up returns, Left / Right are handed to the button row', () => {
    expect(collectionStep(at('footer', 5), 'up', o).zone).toBe('grid');
    expect(collectionStep(at('footer', 5), 'left', o).footer).toBe('left');
    expect(collectionStep(at('footer', 5), 'right', o).footer).toBe('right');
    expect(collectionStep(at('footer', 5), 'down', o).zone).toBe('footer');
  });
});

describe('upgrades cursor', () => {
  it('one column: Left / Right always switch hero, Up from the top row enters the strip', () => {
    expect(upgradeStep({ zone: 'rows', index: 2 }, 'left', 1, 6).hero).toBe(-1);
    expect(upgradeStep({ zone: 'rows', index: 2 }, 'right', 1, 6).hero).toBe(1);
    expect(upgradeStep({ zone: 'rows', index: 0 }, 'up', 1, 6).zone).toBe('strip');
    expect(upgradeStep({ zone: 'rows', index: 2 }, 'up', 1, 6)).toEqual({
      zone: 'rows',
      index: 1,
      hero: 0,
    });
  });

  it('two columns: Left / Right move between columns and only the edges switch hero', () => {
    expect(upgradeStep({ zone: 'rows', index: 0 }, 'right', 2, 6)).toEqual({
      zone: 'rows',
      index: 1,
      hero: 0,
    });
    expect(upgradeStep({ zone: 'rows', index: 1 }, 'right', 2, 6).hero).toBe(1);
    expect(upgradeStep({ zone: 'rows', index: 0 }, 'left', 2, 6).hero).toBe(-1);
    expect(upgradeStep({ zone: 'rows', index: 1 }, 'left', 2, 6).index).toBe(0);
    expect(upgradeStep({ zone: 'rows', index: 1 }, 'up', 2, 6).zone).toBe('strip');
  });

  it('strip: Left / Right switch hero, Down returns to the rows, Up does nothing', () => {
    expect(upgradeStep({ zone: 'strip', index: 3 }, 'left', 1, 6).hero).toBe(-1);
    expect(upgradeStep({ zone: 'strip', index: 3 }, 'right', 1, 6).hero).toBe(1);
    expect(upgradeStep({ zone: 'strip', index: 3 }, 'down', 1, 6)).toEqual({
      zone: 'rows',
      index: 3,
      hero: 0,
    });
    expect(upgradeStep({ zone: 'strip', index: 3 }, 'up', 1, 6)).toEqual({
      zone: 'strip',
      index: 3,
      hero: 0,
    });
  });
});

describe('prompt labels', () => {
  it('names keys and pad buttons', () => {
    expect(keyLabel('KeyQ')).toBe('Q');
    expect(keyLabel('Space')).toBe('SPACE');
    expect(keyLabel('ShiftLeft')).toBe('SHIFT');
    expect(keyLabel('Digit3')).toBe('3');
    expect(keyLabel('ArrowUp')).toBe('UP');
    expect(keyLabel('F5')).toBe('F5');
    expect(padButtonLabel(0)).toBe('A');
    expect(padButtonLabel(5)).toBe('RB');
    expect(padButtonLabel(2, 'playstation')).toBe('SQR');
    expect(padButtonLabel(40)).toBe('BTN40');
  });

  it('the HUD hint follows the bindings and the device used last', () => {
    expect(actionPrompt('ability', 'keyboard')).toBe('Q');
    expect(actionPrompt('item', 'keyboard')).toBe('SPACE');
    expect(actionPrompt('ability', 'pad')).toBe('X');
    expect(actionPrompt('item', 'pad')).toBe('A');
    expect(actionPrompt('item', 'touch')).toBe('TAP');
    const kb = new KeyboardInput(new EventTarget() as unknown as Window);
    kb.setBindings({ ability: ['KeyF'], item: ['KeyE'] });
    expect(actionPrompt('ability', 'keyboard')).toBe('F');
    expect(actionPrompt('item', 'keyboard')).toBe('E');
    kb.setBindings({ 'pad.ability': ['Pad4'], 'pad.item': ['Pad3'] } as never);
    expect(actionPrompt('ability', 'pad')).toBe('LB');
    expect(actionPrompt('item', 'pad')).toBe('Y');
    expect(actionPrompt('ability', 'keyboard')).toBe('Q'); // keys back to the defaults
  });

  it('tracks the last device: key presses, pad buttons and touches', () => {
    const target = new EventTarget();
    new KeyboardInput(target as unknown as Window);
    noteInputDevice('pad');
    target.dispatchEvent(Object.assign(new Event('keydown'), { code: 'KeyW' }));
    expect(inputState.device).toBe('keyboard');
    new TouchInput().pointerDown(1, 20, 20, 426, 240);
    expect(inputState.device).toBe('touch');
  });
});

describe('gamepad bindings', () => {
  const padState = { buttons: new Set<number>(), axes: [0, 0] };
  const install = (): void => {
    vi.stubGlobal('navigator', {
      getGamepads: () => [
        {
          id: 'Xbox Wireless Controller',
          axes: padState.axes,
          buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: padState.buttons.has(i) })),
        },
      ],
    });
  };
  const poll = (g: GamepadInput, ...down: number[]): void => {
    padState.buttons = new Set(down);
    g.poll();
  };
  afterEach(() => {
    padState.buttons.clear();
  });

  it('parses stored bindings and ignores junk', () => {
    expect(parsePadBindings({})).toEqual(DEFAULT_PAD_BINDINGS);
    expect(
      parsePadBindings({ 'pad.item': ['Pad3'], 'pad.pause': ['x'], 'pad.ability': ['Pad99'] }),
    ).toEqual({
      ...DEFAULT_PAD_BINDINGS,
      item: [3],
    });
  });

  it('uses the defaults, then the rebound buttons (item on Y, ability on LB)', () => {
    install();
    const g = new GamepadInput();
    poll(g, 0);
    expect(g.activePressed()).toBe(true);
    g.endStep();
    poll(g);
    poll(g, 2);
    expect(g.abilityPressed()).toBe(true);
    g.endStep();
    new KeyboardInput(new EventTarget() as unknown as Window).setBindings({
      'pad.item': ['Pad3'],
      'pad.ability': ['Pad4'],
    } as never);
    poll(g);
    poll(g, 0);
    expect(g.activePressed()).toBe(false); // A no longer uses the item
    g.endStep();
    poll(g);
    poll(g, 3);
    expect(g.activePressed()).toBe(true);
    g.endStep();
    poll(g);
    poll(g, 4);
    expect(g.abilityPressed()).toBe(true);
    expect(inputState.device).toBe('pad');
    expect(inputState.padConnected).toBe(true);
  });

  it('detects a PlayStation pad for the labels', () => {
    vi.stubGlobal('navigator', {
      getGamepads: () => [
        { id: 'DualSense Wireless Controller (STANDARD GAMEPAD)', axes: [0, 0], buttons: [] },
      ],
    });
    new GamepadInput().poll();
    expect(inputState.padStyle).toBe('playstation');
  });

  it('PadButtonCapture ignores buttons held at the start and the d-pad, then reports the next press', () => {
    install();
    padState.buttons = new Set([0]);
    const cap = new PadButtonCapture();
    expect(cap.poll()).toBeNull(); // A still held
    padState.buttons = new Set([0, 14]);
    expect(cap.poll()).toBeNull(); // d-pad left is reserved
    padState.buttons = new Set();
    expect(cap.poll()).toBeNull();
    padState.buttons = new Set([0]);
    expect(cap.poll()).toBe(0); // a fresh A
    expect(cap.poll()).toBeNull(); // not again while held
    padState.buttons = new Set([0, 5]);
    expect(cap.poll()).toBe(5);
  });

  it('PadButtonCapture with no pad connected returns null', () => {
    vi.stubGlobal('navigator', { getGamepads: () => [null] });
    expect(new PadButtonCapture().poll()).toBeNull();
  });
});

describe('touch stick under modal screens', () => {
  it('a drag in progress is dropped when a modal opens and new touches are ignored until it closes', () => {
    const t = new TouchInput();
    expect(t.pointerDown(1, 100, 150, 426, 240)).toBe(true);
    t.pointerMove(1, 140, 150);
    expect(t.moveVector().x).toBeGreaterThan(0.5);
    t.suspend();
    expect(t.suspended).toBe(true);
    expect(t.moveVector()).toEqual({ x: 0, y: 0 }); // the finger on the card does not steer the hero
    t.pointerMove(1, 180, 150);
    expect(t.moveVector()).toEqual({ x: 0, y: 0 });
    expect(t.pointerDown(2, 100, 150, 426, 240)).toBe(false); // a tap on a card is the card's, not the stick's
    t.pointerMove(2, 150, 150);
    expect(t.moveVector()).toEqual({ x: 0, y: 0 });
    t.resume();
    expect(t.suspended).toBe(false);
    expect(t.moveVector()).toEqual({ x: 0, y: 0 }); // the old drag stays dead until a new touch
    expect(t.pointerDown(3, 100, 150, 426, 240)).toBe(true);
  });

  it('buttons ignore touches under a modal, and stacked modals need every resume', () => {
    const t = new TouchInput();
    t.suspend();
    t.suspend();
    const ability = t.buttons(426, 240).find((b) => b.id === 'ability');
    if (!ability) throw new Error('no ability button');
    t.pointerDown(1, ability.x, ability.y, 426, 240);
    expect(t.abilityPressed()).toBe(false);
    t.resume();
    expect(t.suspended).toBe(true);
    t.resume();
    t.resume(); // an extra resume never goes negative
    expect(t.suspended).toBe(false);
    t.pointerDown(2, ability.x, ability.y, 426, 240);
    expect(t.abilityPressed()).toBe(true);
  });
});
