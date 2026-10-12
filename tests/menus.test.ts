import { describe, expect, it } from 'vitest';
import { defaultSave } from '../src/core/save';
import {
  SPLASHES,
  START_BIOME_OPTIONS,
  Troupe,
  collectionLayout,
  cycleStartBiome,
  gridMove,
  hubLayout,
  keyToNav,
  levelInfo,
  pageCount,
  pageOf,
  pickSplash,
  playerXp,
  rankOf,
  setupLayout,
  spatialFocus,
  stickDir,
  toastAlpha,
  wrapIndex,
  xpForLevel,
} from '../src/ui/hubModel';
import { LOGO_TEXT, logoBlock, logoCells } from '../src/ui/logo';
import { assignSlot, picked, slotOptions } from '../src/ui/runSetupScreen';
import { buyBlocker, buyUpgrade } from '../src/ui/upgradesScreen';
import { loadoutFromSave } from '../src/systems/meta';

const SIZES: [number, number][] = [
  [320, 180],
  [426, 240],
  [480, 270],
  [640, 360],
];
const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('player level and rank', () => {
  it('xp thresholds grow and levels invert them', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(levelInfo(0).level).toBe(1);
    expect(levelInfo(xpForLevel(5)).level).toBe(5);
    expect(levelInfo(xpForLevel(5) - 1).level).toBe(4);
    expect(levelInfo(1e12).level).toBe(99);
    const mid = levelInfo(xpForLevel(3) + 10);
    expect(mid.frac).toBeGreaterThan(0);
    expect(mid.frac).toBeLessThan(1);
  });
  it('xp counts kills, bosses, runs and time', () => {
    const s = defaultSave(1).stats;
    expect(playerXp(s)).toBe(0);
    expect(playerXp({ ...s, kills: 10, bosses: 1, runs: 2, playSeconds: 120 })).toBe(
      10 + 150 + 60 + 4,
    );
  });
  it('ranks follow the level', () => {
    expect(rankOf(1).name).toBe('Wood');
    expect(rankOf(10).name).toBe('Iron');
    expect(rankOf(99).name).toBe('Netherite');
  });
});

describe('splash and logo', () => {
  it('is deterministic and from the list', () => {
    expect(pickSplash(5)).toBe(pickSplash(5));
    expect(SPLASHES).toContain(pickSplash(123456));
  });
  it('lays out every letter of the logo', () => {
    const { cells, cols } = logoCells();
    expect(new Set(cells.map((c) => c.letter)).size).toBe(LOGO_TEXT.length);
    expect(cols).toBe(59);
    expect(Math.max(...cells.map((c) => c.cx))).toBe(cols - 1);
    expect(logoBlock(320) * cols).toBeLessThanOrEqual(320);
    expect(logoBlock(100)).toBe(2);
  });
});

describe('navigation helpers', () => {
  it('maps keys and sticks', () => {
    expect(keyToNav('ArrowUp')).toBe('up');
    expect(keyToNav('KeyD')).toBe('right');
    expect(keyToNav('Enter')).toBe('ok');
    expect(keyToNav('Escape')).toBe('back');
    expect(keyToNav('KeyZ')).toBeNull();
    expect(stickDir(0.2, 0.2)).toBeNull();
    expect(stickDir(-0.9, 0.3)).toBe('left');
    expect(stickDir(0.1, 0.9)).toBe('down');
  });
  it('moves focus between rects and wraps', () => {
    const r = [
      { x: 0, y: 0, w: 10, h: 10 },
      { x: 20, y: 0, w: 10, h: 10 },
      { x: 0, y: 20, w: 10, h: 10 },
      { x: 20, y: 20, w: 10, h: 10, enabled: false },
    ];
    expect(spatialFocus(r, 0, 'right')).toBe(1);
    expect(spatialFocus(r, 0, 'down')).toBe(2);
    expect(spatialFocus(r, 1, 'down')).toBe(2); // the disabled one is skipped
    expect(spatialFocus(r, 2, 'down')).toBe(0); // wraps
    expect(spatialFocus(r, 0, 'left')).toBe(1); // wraps to the far side
  });
  it('moves inside a grid with a short last row', () => {
    expect(gridMove(0, 'right', 3, 5)).toBe(1);
    expect(gridMove(2, 'right', 3, 5)).toBe(2);
    expect(gridMove(0, 'left', 3, 5)).toBe(0);
    expect(gridMove(1, 'down', 3, 5)).toBe(4);
    expect(gridMove(2, 'down', 3, 5)).toBe(4);
    expect(gridMove(4, 'up', 3, 5)).toBe(1);
  });
  it('pages and wraps', () => {
    expect(pageCount(0, 5)).toBe(1);
    expect(pageCount(11, 5)).toBe(3);
    expect(pageOf(10, 5)).toBe(2);
    expect(wrapIndex(0, -1, 4)).toBe(3);
    expect(wrapIndex(3, 1, 4)).toBe(0);
  });
  it('toast alpha fades in and out', () => {
    expect(toastAlpha(0, 3)).toBe(0);
    expect(toastAlpha(1, 3)).toBe(1);
    expect(toastAlpha(2.9, 3)).toBeLessThan(0.5);
    expect(toastAlpha(3, 3)).toBe(0);
  });
});

describe('screen layouts', () => {
  for (const [w, h] of SIZES) {
    it(`hub ${w}x${h}: everything inside the screen, nothing overlapping`, () => {
      const L = hubLayout(w, h);
      const boxes = [L.profile, L.play, ...L.tiles, L.card];
      for (const b of boxes) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(w);
        expect(b.y + b.h).toBeLessThanOrEqual(h);
      }
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          expect(overlap(boxes[i] as never, boxes[j] as never)).toBe(false);
        }
      }
      expect(overlap(L.banner, L.card)).toBe(false);
      if (L.footer) expect(overlap(L.footer, L.tiles[7] as never)).toBe(false);
      if (L.logo) expect(L.logo.cx).toBeGreaterThan(0);
    });
    it(`collection ${w}x${h}: the grid fits and the 11 heroes need few pages`, () => {
      const L = collectionLayout(w, h);
      const g = L.grid;
      expect(g.x + g.cols * (g.cw + g.gap) - g.gap).toBeLessThanOrEqual(L.detail.x);
      expect(g.y + g.rows * (g.ch + g.gap) - g.gap).toBeLessThanOrEqual(L.buttonsY);
      expect(pageCount(11, g.cols * g.rows)).toBeLessThanOrEqual(2);
    });
    it(`setup ${w}x${h}: slots and picker are apart`, () => {
      const L = setupLayout(w, h);
      expect(L.slotX + L.slotW).toBeLessThan(L.picker.x);
      expect(L.slotsY + 4 * L.rowH + 3 * L.rowGap).toBeLessThanOrEqual(L.barY);
      const g = L.grid;
      expect(g.y + g.rows * (g.ch + g.gap) - g.gap).toBeLessThanOrEqual(L.detail.y);
      expect(g.cols * g.rows).toBeGreaterThanOrEqual(8);
    });
  }
});

describe('hub troupe', () => {
  it('stays inside its range and keeps followers close', () => {
    const t = new Troupe(7, 34, 2);
    let walked = false;
    for (let i = 0; i < 60 * 120; i++) {
      t.update(1 / 60);
      walked ||= t.hero.walking;
      expect(Math.abs(t.hero.x)).toBeLessThanOrEqual(34.001);
    }
    expect(walked).toBe(true);
    for (let i = 0; i < 120; i++) t.update(1 / 60);
    t.followers.forEach((f) => expect(Math.abs(f.x - t.hero.x)).toBeLessThan(80));
  });
  it('resizes with the loadout', () => {
    const t = new Troupe(1, 30, 1);
    t.setFollowers(3);
    expect(t.followers).toHaveLength(3);
    t.setFollowers(0);
    expect(t.followers).toHaveLength(0);
  });
});

describe('start biome', () => {
  it('cycles Random then every overworld biome and wraps', () => {
    expect(START_BIOME_OPTIONS[0]).toBeNull();
    expect(START_BIOME_OPTIONS).not.toContain('nether');
    expect(cycleStartBiome(null, 1)).toBe(START_BIOME_OPTIONS[1]);
    expect(cycleStartBiome(null, -1)).toBe(START_BIOME_OPTIONS[START_BIOME_OPTIONS.length - 1]);
    let b = cycleStartBiome(null, 1);
    for (let i = 1; i < START_BIOME_OPTIONS.length; i++) b = cycleStartBiome(b, 1);
    expect(b).toBeNull();
  });
  it('loadouts carry it only when set', () => {
    const lo = loadoutFromSave(defaultSave(1));
    expect(lo.startBiome).toBeUndefined();
    expect({ ...lo, startBiome: 'desert' as const }.startBiome).toBe('desert');
  });
});

describe('run setup slots', () => {
  const save = () => {
    const s = defaultSave(1);
    for (const id of ['alex', 'fox', 'cat', 'wolf', 'trader_llama']) {
      s.owned[id] = { level: 1, shards: 0, obtainedAt: 1 };
    }
    s.upgrades['account'] = { leadership: 1 };
    return s;
  };
  it('lists only owned options; pets and allies get a none entry', () => {
    const s = save();
    expect(slotOptions(s, 'hero').map((d) => d?.id)).toEqual(['steve', 'alex']);
    expect(slotOptions(s, 'pet')[0]).toBeNull();
    expect(slotOptions(s, 'pet').length).toBe(3);
  });
  it('assigns and keeps ally 2 behind ally 1', () => {
    const s = save();
    s.loadout = assignSlot(s, 0, 'wolf');
    s.loadout = assignSlot(s, 1, 'trader_llama');
    expect(picked(s).allies).toEqual(['wolf', 'trader_llama']);
    expect(slotOptions(s, 1).map((d) => d?.id)).not.toContain('wolf');
    s.loadout = assignSlot(s, 0, null);
    expect(picked(s).allies).toEqual(['trader_llama']);
    s.loadout = assignSlot(s, 'hero', 'alex');
    expect(picked(s).hero).toBe('alex');
  });
});

describe('buying upgrades', () => {
  it('spends emeralds, raises the rank and stops at the limits', () => {
    const s = defaultSave(1);
    s.currencies.emeralds = 100;
    expect(buyBlocker(s, 'steve', 'vitality')).toBeNull();
    expect(buyUpgrade(s, 'steve', 'vitality')).toBe(true);
    expect(s.upgrades['steve']?.['vitality']).toBe(1);
    expect(s.currencies.emeralds).toBe(40);
    expect(buyUpgrade(s, 'steve', 'strength')).toBe(false); // 80 > 40
    expect(buyBlocker(s, 'steve', 'strength')).toBe('Not enough Emeralds');
    s.currencies.emeralds = 1e9;
    for (let i = 0; i < 20; i++) buyUpgrade(s, 'steve', 'vitality');
    expect(s.upgrades['steve']?.['vitality']).toBe(8);
    expect(buyBlocker(s, 'steve', 'vitality')).toMatch(/maximum/);
    expect(buyBlocker(s, 'steve', 'nope')).toBe('Unknown upgrade');
  });
});
