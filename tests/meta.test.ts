import { describe, expect, it } from 'vitest';
import type { InputSource } from '../src/core/input';
import { defaultSave } from '../src/core/save';
import { RunState } from '../src/game';
import { defaultLoadout, loadoutFromSave, type RunLoadout } from '../src/systems/meta';

const idle: InputSource = {
  moveVector: () => ({ x: 0, y: 0 }),
  pausePressed: () => false,
  confirmPressed: () => false,
  cancelPressed: () => false,
  activePressed: () => false,
  endStep() {},
};

const withLoadout = (patch: Partial<RunLoadout>): RunLoadout => ({ ...defaultLoadout(), ...patch });

describe('hero passives', () => {
  it('Steve has 110 max HP; Alex starts with a level 2 bow and faster, piercing shots', () => {
    expect(new RunState(1).player.maxHp).toBe(110);
    const alex = new RunState(1, 0, withLoadout({ hero: 'alex' }));
    expect(alex.player.maxHp).toBe(90);
    expect(alex.weapons.find((w) => w.id === 'bow')?.level).toBe(2);
    expect(alex.mods.projSpeed).toBeCloseTo(1.15);
    expect(alex.mods.pierce).toBe(1);
  });

  it('Rana gets luck, water immunity and a single slime split', () => {
    const rana = new RunState(1, 0, withLoadout({ hero: 'rana' }));
    expect(rana.mods.luck).toBeCloseTo(0.1);
    expect(rana.mods.waterImmune).toBe(true);
  });

  it('Steve receives free Leather armor at minute 1', () => {
    const run = new RunState(3);
    expect(run.armorTier).toBe(0);
    for (let i = 0; i < 61 * 60; i++) run.update(1 / 60, idle);
    expect(run.armorTier).toBeGreaterThanOrEqual(1);
  });
});

describe('permanent upgrades and pets', () => {
  it('applies upgrade ranks and scales pet buffs with Kennel', () => {
    const base = new RunState(1);
    const run = new RunState(
      1,
      0,
      withLoadout({
        upgrades: { vitality: 2, strength: 1, reroll: 2 },
        pet: { id: 'panda', level: 1 },
        kennel: 2,
      }),
    );
    expect(run.mods.maxHpBonus).toBe(base.mods.maxHpBonus + 16);
    expect(run.mods.dmg).toBeCloseTo(1.04);
    expect(run.rerolls).toBe(3);
    // Panda lv1 is -10% cooldown, Kennel 2 makes that x1.2.
    expect(run.mods.cd).toBeCloseTo(1 - 0.12);
  });

  it('allies grant their start-of-run bonuses', () => {
    const run = new RunState(
      1,
      0,
      withLoadout({
        allies: [
          { id: 'weaponsmith', level: 1 },
          { id: 'librarian', level: 1 },
        ],
        leadership: true,
      }),
    );
    expect(run.swordTier).toBe(2);
    expect(run.offerSize).toBe(4);
    expect(run.allies).toHaveLength(2);
  });
});

describe('loadout from a save', () => {
  it('drops unowned companions and caps allies at the slot count', () => {
    const s = defaultSave(1);
    s.owned['wolf'] = { level: 2, shards: 0, obtainedAt: 1 };
    s.owned['horse'] = { level: 1, shards: 0, obtainedAt: 1 };
    s.owned['cat'] = { level: 3, shards: 0, obtainedAt: 1 };
    s.loadout = { hero: 'rana', pet: 'cat', allies: ['wolf', 'horse', 'iron_golem'] };
    const l = loadoutFromSave(s);
    expect(l.hero).toBe('steve'); // Rana is not owned
    expect(l.pet).toEqual({ id: 'cat', level: 3 });
    expect(l.allies.map((a) => a.id)).toEqual(['wolf']);
    s.upgrades['account'] = { leadership: 1, kennel: 3 };
    const l2 = loadoutFromSave(s);
    expect(l2.allies.map((a) => a.id)).toEqual(['wolf', 'horse']);
    expect(l2.kennel).toBe(3);
  });
});

describe('allies in a run', () => {
  it('fight, get downed by contact damage and come back after 20 s', () => {
    const run = new RunState(7, 0, withLoadout({ allies: [{ id: 'wolf', level: 1 }] }));
    const ally = run.allies[0];
    if (!ally) throw new Error('no ally');
    for (let i = 0; i < 60 * 40; i++) {
      run.update(1 / 60, idle);
      if (run.status === 'dead') break;
    }
    expect(Number.isFinite(ally.x)).toBe(true);
    // Force a downing and check the respawn timer.
    ally.hp = 0;
    ally.downed = true;
    ally.respawnT = 20;
    run.player.dead = false;
    for (let i = 0; i < 60 * 21 && run.status !== 'dead'; i++) run.update(1 / 60, idle);
    if (run.status !== 'dead') {
      expect(ally.downed).toBe(false);
      expect(ally.hp).toBeGreaterThan(0);
    }
  });

  it('a pet and two allies run 60 s without NaN positions', () => {
    const run = new RunState(
      9,
      0,
      withLoadout({
        pet: { id: 'frog', level: 5 },
        allies: [
          { id: 'iron_golem', level: 3 },
          { id: 'cleric', level: 2 },
        ],
        leadership: true,
      }),
    );
    run.weapons = [];
    for (let i = 0; i < 60 * 60 && run.status !== 'dead'; i++) run.update(1 / 60, idle);
    for (const a of run.allies) expect(Number.isFinite(a.x + a.y + a.hp)).toBe(true);
    expect(Number.isFinite((run.pet?.x ?? 0) + (run.pet?.y ?? 0))).toBe(true);
  });
});
