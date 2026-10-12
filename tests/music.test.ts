import { describe, expect, it } from 'vitest';
import { degreeToMidi, midiToFreq, stepEvents, THEME_IDS, THEMES } from '../src/data/music';

describe('music themes', () => {
  it('has the themes of BRIEF section 14 plus one per biome, with well-formed patterns', () => {
    expect([...THEME_IDS].sort()).toEqual(
      [
        'badlands',
        'boss',
        'cherry',
        'dark_forest',
        'desert',
        'hub',
        'jungle',
        'mushroom',
        'nether',
        'night',
        'plains',
        'snowy_taiga',
        'swamp',
      ].sort(),
    );
    for (const id of THEME_IDS) {
      const t = THEMES[id];
      expect(t.bass).toHaveLength(16);
      expect(t.arp).toHaveLength(16);
      for (const p of [t.kick, t.snare, t.hat]) if (p) expect(p).toHaveLength(16);
      if (t.lead) expect(t.lead.length % 16).toBe(0);
      expect(t.bpm).toBeGreaterThan(60);
      expect(t.chords.length).toBeGreaterThanOrEqual(2);
      for (const c of t.chords) expect(c.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('produces audible, in-range notes for every step of every theme', () => {
    for (const id of THEME_IDS) {
      const t = THEMES[id];
      let notes = 0;
      for (let step = 0; step < 16 * t.chords.length * 2; step++) {
        for (const ev of stepEvents(t, step)) {
          if (ev.midi !== undefined) {
            const f = midiToFreq(ev.midi);
            expect(f).toBeGreaterThan(30);
            expect(f).toBeLessThan(4200);
            notes++;
          }
        }
      }
      expect(notes).toBeGreaterThan(20);
    }
  });

  it('maps scale degrees across octaves', () => {
    const t = THEMES.hub;
    expect(degreeToMidi(t, 0)).toBe(t.root);
    expect(degreeToMidi(t, t.scale.length)).toBe(t.root + 12);
    expect(midiToFreq(69)).toBeCloseTo(440);
  });
});
