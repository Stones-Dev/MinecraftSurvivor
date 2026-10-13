import { describe, expect, it } from 'vitest';
import { defaultSave } from '../src/core/save';
import { MAX_EQUIP_TOASTS, equipToasts, hasUnopenedEggs } from '../src/ui/hubModel';

const names: Record<string, string> = {
  iron_golem: 'Iron Golem',
  wolf: 'Wolf',
  cat: 'Cat',
  chicken: 'Chicken',
};
const nameOf = (id: string): string | undefined => names[id];

describe('hasUnopenedEggs (hub SPAWNER badge)', () => {
  it('is true for either kind of egg and false for none', () => {
    expect(hasUnopenedEggs({ spawnEggs: 0, rareSpawnEggs: 0 })).toBe(false);
    expect(hasUnopenedEggs({ spawnEggs: 1, rareSpawnEggs: 0 })).toBe(true);
    expect(hasUnopenedEggs({ spawnEggs: 0, rareSpawnEggs: 2 })).toBe(true);
  });
  it('a fresh save shows the badge (it starts with starter eggs)', () => {
    expect(hasUnopenedEggs(defaultSave().currencies)).toBe(true);
  });
});

describe('equipToasts', () => {
  it('names an equipped companion and the Wolf it replaced', () => {
    const t = equipToasts(
      [
        { id: 'cat', equipped: 'pet' },
        { id: 'iron_golem', equipped: 'ally', replaced: 'wolf' },
      ],
      nameOf,
    );
    expect(t.map((x) => x.text)).toEqual([
      'Cat joined your team',
      'Iron Golem joined your team, replacing Wolf',
    ]);
  });
  it('ignores pulls that were not equipped and unknown ids', () => {
    expect(equipToasts([{ id: 'chicken' }, { id: 'nope', equipped: 'pet' }], nameOf)).toEqual([]);
  });
  it('raises at most MAX_EQUIP_TOASTS toasts, in pull order', () => {
    const many = Array.from({ length: 6 }, () => ({ id: 'cat', equipped: 'pet' as const }));
    expect(equipToasts(many, nameOf)).toHaveLength(MAX_EQUIP_TOASTS);
    expect(MAX_EQUIP_TOASTS).toBe(2);
  });
  it('uses the real companion table by default', () => {
    const t = equipToasts([{ id: 'iron_golem', equipped: 'ally' }]);
    expect(t[0]?.text).toBe('Iron Golem joined your team');
    expect(t[0]?.rarity).toBeTruthy();
  });
});
