import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from '../src/app';
import type { View } from '../src/core/canvas';
import { defaultSave, type SaveData } from '../src/core/save';
import { resetInputState, inputState } from '../src/core/input';
import { HEROES } from '../src/data/companions';
import { collectionScreen } from '../src/ui/collectionScreen';
import { settingsScreen } from '../src/ui/settingsScreen';
import { spawnerScreen } from '../src/ui/spawnerScreen';
import { spawnerLayout } from '../src/ui/spawnerLayout';
import type { Screen } from '../src/ui/router';
import { upgradesScreen } from '../src/ui/upgradesScreen';

const seen = vi.hoisted(() => ({ texts: [] as string[] }));

// Drawing needs a DOM (font atlas, icons, sprites); the navigation logic does not, so drawing is stubbed.
vi.mock('../src/ui/icons', () => ({ drawIcon: () => undefined }));
vi.mock('../src/ui/panel', async (orig) => {
  const m = await orig<Record<string, unknown>>();
  return Object.fromEntries(
    Object.entries({ ...m, fitText: (t: string) => t, textWidth: (t: string) => t.length * 5 }).map(
      ([k, v]) => [
        k,
        k === 'drawText'
          ? (_c: unknown, t: unknown) => seen.texts.push(String(t))
          : k === 'drawButton'
            ? (_c: unknown, _r: unknown, label: unknown) => seen.texts.push(String(label))
            : typeof v === 'function' && /^draw/.test(k)
              ? () => undefined
              : v,
      ],
    ),
  );
});
vi.mock('../src/ui/widgets', async (orig) => ({
  ...(await orig<typeof import('../src/ui/widgets')>()),
  drawPortrait: () => undefined,
  drawCompanion: () => undefined,
  drawSilhouette: () => undefined,
}));

// A canvas context that answers every call (gradients included) without drawing anything.
const deep: unknown = new Proxy(function () {}, {
  get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : deep),
  apply: () => deep,
  set: () => true,
});
const make = (width: number, height: number): View => ({
  ctx: deep as CanvasRenderingContext2D,
  width,
  height,
  zoom: 2,
});

interface H {
  app: App;
  data: SaveData;
  log: string[];
}
function harness(edit?: (d: SaveData) => void): H {
  const log: string[] = [];
  const data = defaultSave(0);
  edit?.(data);
  const app = {
    router: {
      pop: () => log.push('pop'),
      push: () => log.push('push'),
      replace: () => log.push('replace'),
    },
    input: { pausePressed: () => false },
    audio: {
      play: (n: string) => log.push(`sfx:${n}`),
      playSpin: () => log.push('spin'),
    },
    store: { save: () => log.push('save') },
    applySettings: () => log.push('apply'),
    atlas: {},
    data: () => data,
  } as unknown as App;
  return { app, data, log };
}

const frame = (s: Screen, view: View, dt = 1 / 60): void => {
  seen.texts.length = 0;
  s.update(dt);
  s.render(view, 1);
};
const press = (s: Screen, view: View, ...codes: string[]): void => {
  for (const c of codes) {
    s.onKey?.(c);
    frame(s, view);
  }
};
const padState = { buttons: new Set<number>(), axes: [0, 0] };
function installPad(): void {
  vi.stubGlobal('navigator', {
    getGamepads: () => [
      {
        axes: padState.axes,
        buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: padState.buttons.has(i) })),
      },
    ],
  });
}
const tap = (s: Screen, view: View, button: number): void => {
  padState.buttons.add(button);
  frame(s, view);
  padState.buttons.delete(button);
  frame(s, view);
};
afterEach(() => {
  vi.unstubAllGlobals();
  padState.buttons.clear();
  resetInputState();
});

describe('Spawner: skipping the animation', () => {
  it('a click while the cursor rests on the disabled Pull button still skips the spin', () => {
    const view = make(320, 180);
    const { app, log } = harness();
    const s = spawnerScreen(app, () => undefined);
    frame(s, view);
    const B = spawnerLayout(320, 180).buttons;
    const x = B.x0 + B.w / 2;
    const y = B.y + B.h / 2;
    s.onMove?.(x, y);
    s.onClick?.(x, y); // Pull x1: the spin starts and the button turns disabled
    frame(s, view);
    expect(log).toContain('save');
    const before = log.length;
    s.onClick?.(x, y); // the cursor has not moved: this click used to be swallowed
    expect(log.slice(before).some((l) => /^sfx:(xp|emerald|levelup|legendary)$/.test(l))).toBe(
      true,
    );
  });

  it('a click on an enabled button (Back) is not a skip', () => {
    const view = make(320, 180);
    const { app } = harness();
    let backs = 0;
    const s = spawnerScreen(app, () => backs++);
    frame(s, view);
    const B = spawnerLayout(320, 180).buttons;
    s.onClick?.(B.x0 + 3 * (B.w + B.gap) + 2, B.y + 2);
    expect(backs).toBe(1);
  });

  it('the roulette tick rises with the spin (the audio engine is told the progress)', () => {
    const view = make(320, 180);
    const progress: number[] = [];
    const h = harness();
    (h.app.audio as unknown as { playSpin: (p: number) => void }).playSpin = (p) =>
      progress.push(p);
    const s = spawnerScreen(h.app, () => undefined);
    frame(s, view);
    const B = spawnerLayout(320, 180).buttons;
    s.onClick?.(B.x0 + B.w / 2, B.y + B.h / 2);
    for (let i = 0; i < 90; i++) frame(s, view, 1 / 30);
    expect(progress.length).toBeGreaterThan(8);
    for (let i = 1; i < progress.length; i++)
      expect(progress[i]).toBeGreaterThanOrEqual(progress[i - 1] ?? 0);
    expect(progress[progress.length - 1]).toBeGreaterThan(0.6);
  });
});

describe('Collection: footer, detail tabs and paging by keyboard and pad', () => {
  // Every hero is owned, so whichever card the cursor ends on can be equipped.
  const owned = (d: SaveData): void => {
    for (const h of HEROES) d.owned[h.id] = { level: 1, shards: 0, obtainedAt: 0 };
  };

  it('keyboard: Down past the grid reaches Equip; Enter equips the selected hero', () => {
    const view = make(320, 180);
    const { app, data, log } = harness(owned);
    const s = collectionScreen(app, () => undefined);
    frame(s, view);
    press(s, view, 'ArrowRight'); // Alex
    for (let i = 0; i < 12; i++) press(s, view, 'ArrowDown');
    expect(data.loadout.hero).toBe('steve');
    press(s, view, 'Enter');
    expect(data.loadout.hero).not.toBe('steve');
    expect(log).toContain('save');
  });

  it('keyboard: in the footer Left / Right move between the buttons and Enter on Back leaves', () => {
    const view = make(320, 180);
    const { app } = harness(owned);
    let backs = 0;
    const s = collectionScreen(app, () => backs++);
    frame(s, view);
    press(s, view, 'ArrowRight');
    for (let i = 0; i < 12; i++) press(s, view, 'ArrowDown');
    press(s, view, 'ArrowRight'); // Equip -> Back (or wraps to a paging button)
    press(s, view, 'ArrowRight', 'ArrowRight', 'ArrowRight');
    // Somewhere in the row Back is reachable; walk until Enter leaves.
    for (let i = 0; i < 6 && backs === 0; i++) {
      press(s, view, 'Enter');
      if (backs === 0) press(s, view, 'ArrowRight');
    }
    expect(backs).toBe(1);
  });

  it('gamepad: d-pad down to the footer, A equips; B leaves', () => {
    installPad();
    const view = make(320, 180);
    const { app, data } = harness(owned);
    let backs = 0;
    const s = collectionScreen(app, () => backs++);
    frame(s, view);
    tap(s, view, 15); // Alex
    for (let i = 0; i < 12; i++) tap(s, view, 13);
    tap(s, view, 0); // A on Equip
    expect(data.loadout.hero).not.toBe('steve');
    tap(s, view, 1);
    expect(backs).toBe(1);
  });

  it('gamepad: up from the footer returns to the grid, where A still equips', () => {
    installPad();
    const view = make(320, 180);
    const { app, data } = harness(owned);
    const s = collectionScreen(app, () => undefined);
    frame(s, view);
    tap(s, view, 15);
    for (let i = 0; i < 12; i++) tap(s, view, 13);
    tap(s, view, 12); // back up into the grid
    tap(s, view, 0);
    expect(data.loadout.hero).not.toBe('steve');
  });

  it('the bumpers still switch the Heroes / Pets / Allies tab', () => {
    installPad();
    const view = make(320, 180);
    const { app, log } = harness();
    const s = collectionScreen(app, () => undefined);
    frame(s, view);
    tap(s, view, 5);
    expect(log.filter((l) => l === 'sfx:click')).toHaveLength(1);
  });
});

describe('Upgrades: hero strip and hero switching', () => {
  const heroes = (d: SaveData): void => {
    d.owned['alex'] = { level: 1, shards: 0, obtainedAt: 0 };
    d.owned['rana'] = { level: 1, shards: 0, obtainedAt: 0 };
    d.currencies.emeralds = 100000;
  };

  it('at 640 px (two columns) Left / Right move between columns and switch hero only at the edges', () => {
    const view = make(640, 360);
    const { app, data } = harness(heroes);
    const s = upgradesScreen(app, () => undefined);
    frame(s, view);
    press(s, view, 'ArrowRight'); // Steve, row 0 -> column 2 (Strength): still Steve
    press(s, view, 'Enter');
    expect(data.upgrades['steve']?.['strength']).toBe(1);
    press(s, view, 'ArrowRight'); // right edge: next hero (Alex)
    press(s, view, 'Enter'); // Alex row 0 = Vitality
    expect(data.upgrades['alex']?.['vitality']).toBe(1);
    press(s, view, 'ArrowLeft'); // left edge: back to Steve
    press(s, view, 'Enter');
    expect(data.upgrades['steve']?.['vitality']).toBe(1);
  });

  it('Up from the top row enters the strip; Right there switches hero; Down returns to the rows', () => {
    const view = make(320, 180);
    const { app, data } = harness(heroes);
    const s = upgradesScreen(app, () => undefined);
    frame(s, view);
    press(s, view, 'ArrowDown'); // shows the cursor on row 0... first press moves to row 1 (kbd mode starts)
    press(s, view, 'ArrowUp', 'ArrowUp'); // top row, then the strip
    press(s, view, 'Enter'); // nothing to buy while the strip has the cursor
    expect(Object.keys(data.upgrades)).toEqual([]);
    press(s, view, 'ArrowRight'); // Alex
    press(s, view, 'ArrowDown', 'ArrowUp', 'ArrowDown'); // back into the rows
    press(s, view, 'Enter');
    expect(
      data.upgrades['alex']?.['vitality'] ?? data.upgrades['alex']?.['strength'],
    ).toBeDefined();
    expect(data.upgrades['steve']).toBeUndefined();
  });

  it('the bumpers switch hero on a pad', () => {
    installPad();
    const view = make(320, 180);
    const { app, data } = harness(heroes);
    const s = upgradesScreen(app, () => undefined);
    frame(s, view);
    tap(s, view, 5); // RB: Alex
    tap(s, view, 0); // A buys the first row (cursor mode starts on the first nav event, A buys)
    expect(Object.keys(data.upgrades)).not.toContain('steve');
  });
});

describe('Settings: pad rebinding never traps the player', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { fullscreenElement: null });
    installPad();
  });
  const said = (needle: string): boolean => seen.texts.some((t) => t.includes(needle));
  /** Open Settings > Controls and put the keyboard ring on the n-th row of the left column. */
  const open = (rowsDown: number): { s: Screen; view: View; data: SaveData } => {
    const view = make(320, 180);
    const { app, data } = harness();
    const s = settingsScreen(app, () => undefined);
    frame(s, view);
    press(s, view, 'KeyE', 'KeyE'); // Audio -> Graphics -> Controls
    for (let i = 0; i < 1 + rowsDown; i++) press(s, view, 'ArrowDown'); // the first press shows the ring
    return { s, view, data };
  };
  const padTap = (s: Screen, view: View, b: number): void => {
    padState.buttons.add(b);
    frame(s, view);
    padState.buttons.delete(b);
    frame(s, view);
  };

  it('Enter on "Pause" waits for a key or pad button; a pad button is stored under pad.pause', () => {
    const { s, view, data } = open(3); // Move up, Move left, Pause
    press(s, view, 'Enter');
    expect(said('Press a key')).toBe(true);
    padTap(s, view, 3); // Y
    expect(said('Press a key')).toBe(false);
    const stored = data.settings.controls as Record<string, string[] | undefined>;
    expect(stored['pad.pause']).toEqual(['Pad3']);
    // The other pad actions keep their buttons.
    expect(stored['pad.item']).toEqual(['Pad0']);
    expect(stored['pad.ability']).toEqual(['Pad2', 'Pad5']);
  });

  it('a button held when the capture opens (the A that selected it) is not taken as the binding', () => {
    const { s, view, data } = open(3);
    padState.buttons.add(0);
    press(s, view, 'Enter'); // pad A still down
    frame(s, view);
    expect(said('Press a key')).toBe(true);
    expect((data.settings.controls as Record<string, unknown>)['pad.pause']).toBeUndefined();
    padState.buttons.delete(0);
    frame(s, view);
    padTap(s, view, 0); // a fresh A press binds A
    expect((data.settings.controls as Record<string, unknown>)['pad.pause']).toEqual(['Pad0']);
  });

  it('taking a button from another action swaps rather than leaving it without one', () => {
    const { s, view, data } = open(3);
    press(s, view, 'Enter');
    padTap(s, view, 0); // Pause := A, which was "Use item"
    const stored = data.settings.controls as Record<string, string[] | undefined>;
    expect(stored['pad.pause']).toEqual(['Pad0']);
    expect(stored['pad.item']).toEqual(['Pad9']); // item takes pause's old Start
    expect(stored['pad.ability']).toEqual(['Pad2', 'Pad5']);
  });

  it('B cancels, and so does waiting: nobody is stuck in the prompt', () => {
    const { s, view, data } = open(3);
    press(s, view, 'Enter');
    padTap(s, view, 1); // B
    expect(said('Press a key')).toBe(false);
    press(s, view, 'Enter');
    expect(said('Press a key')).toBe(true);
    for (let i = 0; i < 9 * 60; i++) frame(s, view); // 9 s with no input
    expect(said('Press a key')).toBe(false);
    expect(Object.keys(data.settings.controls)).toEqual([]);
    press(s, view, 'KeyZ'); // not capturing: Z means nothing, nothing is rebound
    expect(Object.keys(data.settings.controls)).toEqual([]);
  });

  it('movement actions refuse a pad button and leave the prompt', () => {
    const { s, view, data } = open(1); // Move up
    press(s, view, 'Enter');
    expect(said('Press a key')).toBe(true);
    padTap(s, view, 2);
    expect(said('Press a key')).toBe(false);
    expect(said('Movement uses')).toBe(true);
    expect(Object.keys(data.settings.controls)).toEqual([]);
  });

  it('a keyboard key still rebinds as before', () => {
    const { s, view, data } = open(1);
    press(s, view, 'Enter', 'KeyZ');
    expect(data.settings.controls.up).toEqual(['KeyZ']);
  });

  it('Reset controls clears the pad bindings too', () => {
    const { s, view, data } = open(3);
    press(s, view, 'Enter');
    padTap(s, view, 3);
    expect((data.settings.controls as Record<string, unknown>)['pad.pause']).toBeDefined();
    press(s, view, 'ArrowDown', 'ArrowDown', 'Enter'); // Pause -> Hero ability -> Reset controls
    expect(Object.keys(data.settings.controls)).toEqual([]);
  });

  it('pad names are listed once a pad is connected', () => {
    inputState.padConnected = true;
    const { s, view } = open(1);
    frame(s, view);
    expect(seen.texts.some((t) => /Use item.*SPACE.*A/.test(t))).toBe(true);
  });
});
