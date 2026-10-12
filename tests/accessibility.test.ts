import { afterEach, describe, expect, it } from 'vitest';
import {
  applyAccessibility,
  cb,
  cbAlpha,
  cbFor,
  colorDistance,
  reduceFlash,
  touchEnabled,
  cameraLead,
  textScale,
} from '../src/core/accessibility';
import { RARITY_COLOR } from '../src/data/companions';
import { defaultSave, migrate, type ColorblindMode } from '../src/core/save';
import { TouchInput } from '../src/core/touch';

const MODES: Exclude<ColorblindMode, 'off'>[] = ['protanopia', 'deuteranopia', 'tritanopia'];
const RARITIES = Object.values(RARITY_COLOR);
const CARD_BORDERS = ['#3b78d8', '#a24ad8', '#e8b923'];

afterEach(() => applyAccessibility(defaultSave(1).settings));

describe('applyAccessibility', () => {
  it('copies the settings the renderers read', () => {
    const s = defaultSave(1).settings;
    s.accessibility = {
      colorblind: 'deuteranopia',
      textScale: 2,
      reduceFlash: true,
      touchControls: 'on',
    };
    s.cameraLead = false;
    applyAccessibility(s);
    expect(reduceFlash()).toBe(true);
    expect(cameraLead()).toBe(false);
    expect(textScale()).toBe(2);
    expect(cb('#ff3b3b')).not.toBe('#ff3b3b');
  });

  it('defaults to no remapping, no reduced flashing and camera lead on', () => {
    applyAccessibility(defaultSave(1).settings);
    expect(cb('#ff3b3b')).toBe('#ff3b3b');
    expect(cb('#123456')).toBe('#123456');
    expect(reduceFlash()).toBe(false);
    expect(cameraLead()).toBe(true);
    expect(textScale()).toBe(1);
  });
});

describe('colour-blind mapper', () => {
  it('is the identity when off and for colours that are not cues', () => {
    for (const c of ['#ff3b3b', ...RARITIES, '#010203']) expect(cbFor('off', c)).toBe(c);
    for (const m of MODES) expect(cbFor(m, '#010203')).toBe('#010203');
  });

  it('is case-insensitive and returns valid hex', () => {
    for (const m of MODES) {
      expect(cbFor(m, '#5FD068')).toBe(cbFor(m, '#5fd068'));
      for (const c of [...RARITIES, ...CARD_BORDERS, '#ff3b3b', '#e04040', '#a00000'])
        expect(cbFor(m, c)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('builds rgba strings from the mapped colour', () => {
    expect(cbAlpha('#a00000', 0.5)).toBe('rgba(160,0,0,0.5)');
    applyAccessibility({
      ...defaultSave(1).settings,
      accessibility: { ...defaultSave(1).settings.accessibility, colorblind: 'protanopia' },
    });
    expect(cbAlpha('#a00000', 0.5)).toBe('rgba(96,16,160,0.5)');
  });

  it('keeps the five rarities apart for every deficiency', () => {
    for (const m of MODES) {
      const cols = RARITIES.map((c) => cbFor(m, c));
      for (let i = 0; i < cols.length; i++)
        for (let j = i + 1; j < cols.length; j++) {
          const d = colorDistance(m, cols[i] as string, cols[j] as string);
          expect(d, `${m} ${cols[i]} vs ${cols[j]}`).toBeGreaterThan(25);
        }
    }
  });

  it('fixes rarities that really collide with the stock palette', () => {
    // Stock rare (blue) and epic (purple) are nearly the same colour for a deuteranope.
    const stock = colorDistance('deuteranopia', RARITY_COLOR.rare, RARITY_COLOR.epic);
    const mapped = colorDistance(
      'deuteranopia',
      cbFor('deuteranopia', RARITY_COLOR.rare),
      cbFor('deuteranopia', RARITY_COLOR.epic),
    );
    expect(stock).toBeLessThan(10);
    expect(mapped).toBeGreaterThan(stock * 3);
  });

  it('keeps level-up card borders apart', () => {
    for (const m of MODES) {
      const cols = CARD_BORDERS.map((c) => cbFor(m, c));
      expect(colorDistance(m, cols[0] as string, cols[1] as string)).toBeGreaterThan(25);
      expect(colorDistance(m, cols[1] as string, cols[2] as string)).toBeGreaterThan(25);
    }
  });

  it('separates the hostile telegraph from grass and from the friendly one', () => {
    const grass = ['#5a9a3c', '#7a9a50', '#c8b070'];
    for (const m of ['protanopia', 'deuteranopia'] as const) {
      const danger = cbFor(m, '#ff3b3b');
      for (const g of grass) {
        expect(colorDistance(m, danger, g)).toBeGreaterThan(colorDistance(m, '#ff3b3b', g) * 1.5);
        expect(colorDistance(m, danger, g)).toBeGreaterThan(50);
      }
      expect(colorDistance(m, danger, cbFor(m, '#7dd0ff'))).toBeGreaterThan(40);
    }
  });
});

describe('touch controls mode', () => {
  it('on / off ignore the device, auto follows a coarse pointer or the first touch', () => {
    expect(touchEnabled('on', false, false)).toBe(true);
    expect(touchEnabled('off', true, true)).toBe(false);
    expect(touchEnabled('auto', false, false)).toBe(false);
    expect(touchEnabled('auto', true, false)).toBe(true);
    expect(touchEnabled('auto', false, true)).toBe(true);
  });

  it('TouchInput.setMode drives `enabled`', () => {
    const t = new TouchInput();
    t.setMode('auto', false);
    expect(t.enabled).toBe(false);
    t.setMode('auto', true);
    expect(t.enabled).toBe(true);
    t.setMode('off', true);
    expect(t.enabled).toBe(false);
    t.setMode('on', false);
    expect(t.enabled).toBe(true);
  });
});

describe('camera lead setting defaults and migration', () => {
  it('defaults to on', () => {
    expect(defaultSave(1).settings.cameraLead).toBe(true);
  });

  it('keeps an explicit value through migration', () => {
    const off = defaultSave(1);
    off.settings.cameraLead = false;
    expect(migrate(JSON.parse(JSON.stringify(off))).settings.cameraLead).toBe(false);
    const on = defaultSave(1);
    expect(migrate(JSON.parse(JSON.stringify(on))).settings.cameraLead).toBe(true);
  });

  it('gives saves from before the setting existed the default (on)', () => {
    const old = JSON.parse(JSON.stringify(defaultSave(1))) as Record<string, unknown>;
    const settings = old.settings as Record<string, unknown>;
    delete settings.cameraLead;
    delete settings.accessibility;
    old.saveVersion = 2;
    const s = migrate(old);
    expect(s.settings.cameraLead).toBe(true);
    expect(s.settings.accessibility).toEqual(defaultSave(1).settings.accessibility);
  });

  it('keeps explicit accessibility choices', () => {
    const d = defaultSave(1);
    d.settings.accessibility = {
      colorblind: 'tritanopia',
      textScale: 2,
      reduceFlash: true,
      touchControls: 'off',
    };
    expect(migrate(JSON.parse(JSON.stringify(d))).settings.accessibility).toEqual(
      d.settings.accessibility,
    );
  });
});
