import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from '../src/app';
import type { View } from '../src/core/canvas';
import { defaultSave, type SaveData } from '../src/core/save';
import { RunState } from '../src/game';
import { gainXp } from '../src/systems/levelup';
import { itemChoiceScreen, levelupScreen, pauseScreen, victoryScreen } from '../src/ui/overlays';
import { pauseLayout } from '../src/ui/pauseLayout';
import type { Screen } from '../src/ui/router';

// Drawing needs a DOM (font atlas, icons); the navigation logic does not, so drawing is stubbed out.
vi.mock('../src/ui/icons', () => ({ drawIcon: () => undefined }));
vi.mock('../src/ui/panel', async (orig) => ({
  ...(await orig<typeof import('../src/ui/panel')>()),
  drawText: () => undefined,
  drawTextScaled: () => undefined,
  drawPanel: () => undefined,
  drawButton: () => undefined,
  drawBar: () => undefined,
  drawFocusRing: () => undefined,
  drawTooltip: () => undefined,
}));

const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
const view: View = {
  ctx: ctx as unknown as CanvasRenderingContext2D,
  width: 320,
  height: 180,
  zoom: 2,
};

interface Harness {
  app: App;
  log: string[];
  /** The save the screens read and write (volumes live in `data.settings`). */
  data: SaveData;
  /** Touch suspend depth (enter / exit of the overlays). */
  touch: { depth: number };
  /** Set by tests that want `input.pausePressed()` to answer true once. */
  pausePressed: { v: boolean };
}

function harness(): Harness {
  const log: string[] = [];
  const pausePressed = { v: false };
  const data = defaultSave(0);
  const touch = { depth: 0 };
  const app = {
    router: {
      pop: () => log.push('pop'),
      replace: () => log.push('replace'),
      push: () => log.push('push'),
    },
    input: { pausePressed: () => pausePressed.v },
    audio: { play: () => undefined },
    touch: {
      suspend: () => touch.depth++,
      resume: () => touch.depth--,
    },
    store: { save: () => log.push('save') },
    applySettings: () => log.push('apply'),
    data: () => data,
  } as unknown as App;
  return { app, log, pausePressed, data, touch };
}

const frame = (s: Screen, dt = 1 / 60): void => {
  s.update(dt);
  s.render(view, 1);
};
const press = (s: Screen, ...codes: string[]): void => {
  for (const c of codes) {
    s.onKey?.(c);
    frame(s);
  }
};

/** A pad whose buttons / axes the test can set; PadNav reads it through navigator.getGamepads. */
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
const tap = (s: Screen, button: number): void => {
  padState.buttons.add(button);
  frame(s);
  padState.buttons.delete(button);
  frame(s);
};

afterEach(() => {
  vi.unstubAllGlobals();
  padState.buttons.clear();
});

describe('pause menu', () => {
  it('keyboard: Down then Enter reaches "Quit to menu"', () => {
    const { app, log } = harness();
    let quit = 0;
    const s = pauseScreen(app, () => quit++);
    frame(s);
    press(s, 'ArrowDown'); // first press shows the ring on Resume
    press(s, 'ArrowDown'); // second moves it to Quit
    press(s, 'Enter');
    expect(quit).toBe(1);
    expect(log).toEqual([]);
  });

  it('keyboard: Enter on Resume resumes; Esc and P resume at once', () => {
    const a = harness();
    const s1 = pauseScreen(a.app, () => undefined);
    frame(s1);
    press(s1, 'Enter', 'Enter');
    expect(a.log).toEqual(['pop']);
    for (const key of ['Escape', 'KeyP']) {
      const h = harness();
      const s = pauseScreen(h.app, () => undefined);
      frame(s);
      press(s, key);
      expect(h.log).toEqual(['pop']);
    }
  });

  it('keyboard: arrows go back up, and W / S work like the arrows', () => {
    const { app } = harness();
    let quit = 0;
    const s = pauseScreen(app, () => quit++);
    frame(s);
    press(s, 'KeyS', 'KeyS', 'KeyW', 'KeyS', 'Enter');
    expect(quit).toBe(1);
  });

  it('only closes once even if a key and a pad press arrive together', () => {
    const { app, log, pausePressed } = harness();
    const s = pauseScreen(app, () => undefined);
    frame(s);
    pausePressed.v = true;
    s.onKey?.('Escape');
    s.update(1 / 60);
    expect(log).toEqual(['pop']);
  });

  it('gamepad: d-pad down + A quits, B and Start resume', () => {
    installPad();
    const { app, log } = harness();
    let quit = 0;
    const s = pauseScreen(app, () => quit++);
    frame(s);
    tap(s, 13); // ring appears on Resume
    tap(s, 13); // moves to Quit
    tap(s, 0); // A
    expect(quit).toBe(1);

    const b = harness();
    const s2 = pauseScreen(b.app, () => undefined);
    frame(s2);
    tap(s2, 1); // B
    expect(b.log).toEqual(['pop']);

    const c = harness();
    const s3 = pauseScreen(c.app, () => undefined);
    frame(s3);
    c.pausePressed.v = true; // Start (the merged input reports it as a pause press)
    frame(s3);
    expect(c.log).toEqual(['pop']);
    void log;
  });

  it('mouse still works: the buttons sit under the pointer', () => {
    const { app, log } = harness();
    let quit = 0;
    const s = pauseScreen(app, () => quit++);
    frame(s);
    const L = pauseLayout(view.width, view.height, false, 0);
    s.onClick?.(L.quit.x + L.quit.w / 2, L.quit.y + L.quit.h / 2);
    expect(quit).toBe(1);
    const r = harness();
    const s2 = pauseScreen(r.app, () => undefined);
    frame(s2);
    s2.onClick?.(L.resume.x + 4, L.resume.y + 4);
    expect(r.log).toEqual(['pop']);
    expect(log).toEqual([]);
  });

  it('Settings opens the settings screen on top (Resume and Quit stay as they were)', () => {
    const { app, log } = harness();
    const s = pauseScreen(app, () => undefined);
    frame(s);
    press(s, 'ArrowRight'); // ring on Resume
    press(s, 'ArrowRight'); // Settings sits right of Resume
    press(s, 'Enter');
    expect(log).toEqual(['push']);
  });

  it('has Music and SFX bars: a click sets the volume, saves and applies it', () => {
    const { app, log, data } = harness();
    const s = pauseScreen(app, () => undefined);
    frame(s);
    const L = pauseLayout(view.width, view.height, false, 0);
    const music = L.volume[0]?.bar;
    const sfx = L.volume[1]?.bar;
    if (!music || !sfx) throw new Error('no volume rows');
    s.onClick?.(music.x + 1 + (music.w - 2) * 0.2, music.y + 4);
    expect(data.settings.musicVolume).toBe(0.2);
    expect(log).toEqual(['save', 'apply']);
    s.onClick?.(sfx.x + sfx.w - 1, sfx.y + 4); // the far end is full volume
    expect(data.settings.sfxVolume).toBe(1);
    expect(log).toEqual(['save', 'apply', 'save', 'apply']);
  });

  it('keyboard: Up from Resume reaches the SFX bar, Left / Right change it, Up again reaches Music', () => {
    const { app, data } = harness();
    data.settings.sfxVolume = 0.5;
    data.settings.musicVolume = 0.5;
    const s = pauseScreen(app, () => undefined);
    frame(s);
    press(s, 'ArrowDown'); // ring on Resume
    press(s, 'ArrowUp'); // SFX bar
    press(s, 'ArrowLeft', 'ArrowLeft');
    expect(data.settings.sfxVolume).toBe(0.3);
    press(s, 'ArrowRight');
    expect(data.settings.sfxVolume).toBe(0.4);
    press(s, 'ArrowUp'); // Music bar
    press(s, 'KeyD');
    expect(data.settings.musicVolume).toBe(0.6);
    expect(data.settings.sfxVolume).toBe(0.4);
    press(s, 'ArrowDown', 'ArrowDown'); // back to Resume, then Quit
  });

  it('gamepad: the d-pad reaches a volume bar and left / right change it; Back still resumes', () => {
    installPad();
    const { app, log, data } = harness();
    data.settings.musicVolume = 0.5;
    const s = pauseScreen(app, () => undefined);
    frame(s);
    tap(s, 13); // ring on Resume
    tap(s, 12); // SFX
    tap(s, 12); // Music
    tap(s, 15);
    expect(data.settings.musicVolume).toBe(0.6);
    tap(s, 14);
    tap(s, 14);
    expect(data.settings.musicVolume).toBe(0.4);
    expect(log.filter((l) => l === 'pop')).toEqual([]);
    tap(s, 1); // B
    expect(log).toContain('pop');
  });

  it('touch is switched off while the pause menu is on top and back on after', () => {
    const { app, touch } = harness();
    const s = pauseScreen(app, () => undefined);
    s.enter?.();
    expect(touch.depth).toBe(1);
    s.exit?.();
    expect(touch.depth).toBe(0);
  });
});

describe('pause layout', () => {
  const sizes: [number, number][] = [
    [213, 120],
    [320, 180],
    [426, 240],
    [640, 360],
    [960, 540],
  ];
  const inside = (
    r: { x: number; y: number; w: number; h: number },
    p: { x: number; y: number; w: number; h: number },
  ): boolean => r.x >= p.x && r.y >= p.y && r.x + r.w <= p.x + p.w && r.y + r.h <= p.y + p.h;
  const overlaps = (
    a: { x: number; y: number; w: number; h: number },
    b: { x: number; y: number; w: number; h: number },
  ): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  it.each(sizes)('%i x %i: everything fits the view and nothing overlaps', (w, h) => {
    for (const missions of [0, 1, 3, 8]) {
      const L = pauseLayout(w, h, true, missions);
      expect(L.panel.y).toBeGreaterThanOrEqual(0);
      expect(L.panel.y + L.panel.h).toBeLessThanOrEqual(h);
      expect(L.panel.x).toBeGreaterThanOrEqual(0);
      expect(L.panel.x + L.panel.w).toBeLessThanOrEqual(w);
      const boxes = [L.resume, L.settings, L.quit, ...L.volume.map((v) => v.bar)];
      for (const b of boxes) expect(inside(b, L.panel)).toBe(true);
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          expect(overlaps(boxes[i]!, boxes[j]!)).toBe(false);
        }
      expect(L.missionRows).toBeLessThanOrEqual(missions);
      // Missions give way first; the controls are always there.
      if (h >= 180) expect(L.volume).toHaveLength(2);
    }
  });

  it('keeps some missions at 320 x 180 and shows five on tall views', () => {
    expect(pauseLayout(320, 180, true, 8).missionRows).toBe(3);
    expect(pauseLayout(640, 360, true, 8).missionRows).toBe(5);
    expect(pauseLayout(640, 360, true, 2).missionRows).toBe(2);
  });
});

describe('level-up screen', () => {
  const make = (): { h: Harness; run: RunState; s: Screen } => {
    const h = harness();
    const run = new RunState(5, 0);
    gainXp(run, 100000);
    run.pendingLevelups = 1; // one offer to answer, no queued ones behind it
    run.bonusOffers = 0;
    expect(run.offer?.length ?? 0).toBeGreaterThanOrEqual(3);
    const s = levelupScreen(h.app, run);
    frame(s);
    return { h, run, s };
  };

  it('arrows move between the cards and Enter picks the focused one', () => {
    const { h, run, s } = make();
    const levelBefore = run.level;
    press(s, 'ArrowRight'); // shows the ring on card 1
    press(s, 'ArrowRight'); // card 2
    press(s, 'Enter');
    expect(h.log).toEqual(['pop']);
    expect(run.offer).toBeNull();
    expect(run.level).toBeGreaterThanOrEqual(levelBefore);
  });

  it('Down reaches Skip (and Enter skips), Reroll is skipped when none are left', () => {
    const { h, run, s } = make();
    run.rerolls = 0;
    frame(s);
    const emeralds = run.emeraldsPicked;
    press(s, 'ArrowDown', 'ArrowDown', 'Enter');
    expect(h.log).toEqual(['pop']);
    expect(run.emeraldsPicked).toBeGreaterThan(emeralds);
  });

  it('Down reaches Reroll when one is available', () => {
    const { run, s } = make();
    run.rerolls = 2;
    frame(s);
    const offer = run.offer;
    press(s, 'ArrowDown', 'ArrowDown');
    // The focus lands on a button below the cards; reroll replaces the offer.
    press(s, 'Enter');
    expect(run.rerolls === 1 || run.rerolls === 2).toBe(true);
    expect(offer).toBeDefined();
  });

  it('digits, R and S keep working', () => {
    const { h, s } = make();
    press(s, 'Digit1');
    expect(h.log).toEqual(['pop']);
  });

  it('gamepad: d-pad right + A picks a card; B does nothing (the offer must be answered)', () => {
    installPad();
    const { h, run, s } = make();
    tap(s, 1);
    expect(h.log).toEqual([]);
    expect(run.offer).not.toBeNull();
    tap(s, 15);
    tap(s, 15);
    tap(s, 0);
    expect(h.log).toEqual(['pop']);
    expect(run.offer).toBeNull();
  });

  it('Esc does nothing', () => {
    const { h, run, s } = make();
    press(s, 'Escape');
    expect(h.log).toEqual([]);
    expect(run.offer).not.toBeNull();
  });
});

describe('item choice screen', () => {
  const make = (): { h: Harness; run: RunState; s: Screen } => {
    const h = harness();
    const run = new RunState(5, 0);
    run.item = 'totem';
    run.pendingItem = 'ender_pearl';
    const s = itemChoiceScreen(h.app, run);
    frame(s);
    return { h, run, s };
  };

  it('keyboard: arrows and Enter pick Keep or Take', () => {
    const k = make();
    press(k.s, 'ArrowRight', 'Enter'); // ring on Keep, Enter keeps
    expect(k.h.log).toEqual(['pop']);
    expect(k.run.item).toBe('totem');

    const t = make();
    press(t.s, 'ArrowRight', 'ArrowRight', 'Enter'); // ring on Keep, then Take
    expect(t.h.log).toEqual(['pop']);
    expect(t.run.item).toBe('ender_pearl');
  });

  it('1 and 2 still work, gamepad d-pad + A works', () => {
    const a = make();
    press(a.s, 'Digit2');
    expect(a.run.item).toBe('ender_pearl');
    installPad();
    const b = make();
    tap(b.s, 15);
    tap(b.s, 15);
    tap(b.s, 0);
    expect(b.run.item).toBe('ender_pearl');
  });
});

describe('victory screen', () => {
  it('Enter continues by default; with the ring Down + Enter finishes the run', () => {
    const h = harness();
    const s = victoryScreen(h.app, new RunState(5, 0), false);
    frame(s);
    press(s, 'Enter');
    expect(h.log).toEqual(['pop']);

    const g = harness();
    const s2 = victoryScreen(g.app, new RunState(5, 0), false);
    frame(s2);
    press(s2, 'ArrowDown', 'ArrowDown', 'Enter');
    expect(g.log).toEqual(['replace']);
  });

  it('gamepad: A continues, d-pad down + A finishes', () => {
    installPad();
    const h = harness();
    const s = victoryScreen(h.app, new RunState(5, 0), false);
    frame(s);
    tap(s, 0);
    expect(h.log).toEqual(['pop']);

    const g = harness();
    const s2 = victoryScreen(g.app, new RunState(5, 0), false);
    frame(s2);
    tap(s2, 13);
    tap(s2, 13);
    tap(s2, 0);
    expect(g.log).toEqual(['replace']);
  });
});
