import { describe, expect, it } from 'vitest';
import { ICON_DATA, ICON_NAMES, ICON_SIZE } from '../src/ui/icons';

describe('code-drawn icons', () => {
  it('uses a 12 px grid and lists 51 unique names', () => {
    expect(ICON_SIZE).toBe(12);
    expect(ICON_NAMES).toHaveLength(51);
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length);
  });

  for (const name of ICON_NAMES) {
    describe(name, () => {
      const { rows, palette } = ICON_DATA[name];

      it('is a 12x12 grid', () => {
        expect(rows).toHaveLength(ICON_SIZE);
        for (const row of rows) expect(row).toHaveLength(ICON_SIZE);
      });

      it('only uses characters defined in its palette', () => {
        const chars = new Set(rows.join(''));
        const missing = [...chars].filter((ch) => ch !== '.' && !(ch in palette));
        expect(missing).toEqual([]);
      });

      it('has at least 15 non-transparent pixels', () => {
        const opaque = [...rows.join('')].filter((ch) => ch !== '.');
        expect(opaque.length).toBeGreaterThanOrEqual(15);
      });
    });
  }
});
