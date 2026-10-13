import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../src/data/enemies';
import {
  MusicDirector,
  NIGHT_ON,
  THEME_IDS,
  THEME_MIN_GAP,
  THEME_SETTLE,
  THEMES,
  biomeTheme,
} from '../src/data/music';
import {
  ROSTERS,
  biomeDensity,
  biomeHpMult,
  pickEnemyId,
  spawnPool,
  spawnWeight,
} from '../src/data/rosters';
import { RunState } from '../src/game';
import {
  AMBIENT_SLOTS,
  AmbientField,
  FIREFLY_NIGHT,
  pickAmbient,
  type AmbientKind,
} from '../src/render/ambient';
import { updateSpawner } from '../src/systems/spawner';
import { BIOME_IDS, BIOMES, OVERWORLD_BIOMES, type BiomeId } from '../src/world/biomes';

const atlas = JSON.parse(
  readFileSync(new URL('../public/atlas/atlas.json', import.meta.url), 'utf8'),
) as { anims: Record<string, unknown> };

/** The pre-biome-rosters pool rule (spawner.ts before this change), kept to prove plains is unchanged. */
function legacyPool(
  biome: string,
  minute: number,
  night: boolean,
  water: boolean,
): [string, number][] {
  return Object.values(ENEMIES)
    .filter(
      (d) =>
        d.weight > 0 &&
        d.fromMinute <= minute &&
        (!d.nightOnly || night) &&
        (!d.biomes || d.biomes.includes(biome)) &&
        (!d.nearWater || water),
    )
    .map((d) => [d.id, d.weight]);
}

describe('enemy data', () => {
  it('every enemy has its sprite in the atlas and valid biome ids', () => {
    for (const d of Object.values(ENEMIES)) {
      const anims = ['idle', 'walk', 'summon', 'firing', 'attack'].filter(
        (a) => `${d.sprite}.${a}` in atlas.anims,
      );
      expect(anims.length, `${d.id} (${d.sprite}) has no atlas animation`).toBeGreaterThan(0);
      for (const b of d.biomes ?? []) expect(BIOME_IDS, `${d.id} biome ${b}`).toContain(b);
      if (d.splitInto) expect(ENEMIES[d.splitInto], `${d.id} splitInto`).toBeDefined();
    }
  });

  it('roster tables only mention real enemies and biomes', () => {
    for (const [biome, r] of Object.entries(ROSTERS)) {
      expect(BIOME_IDS).toContain(biome);
      for (const id of [
        ...Object.keys(r.mult ?? {}),
        ...Object.keys(r.from ?? {}),
        ...Object.keys(r.add ?? {}),
      ])
        expect(ENEMIES[id], `${biome}: ${id}`).toBeDefined();
    }
  });
});

describe('roster selection', () => {
  // Intentional change (audit, 2026-10-13): the plains used to equal the legacy pool exactly, which made minute 0
  // 100% plain zombies and the first three minutes five mob types. The plains now adds low-weight early variants
  // (ROSTERS.plains.add); the generic pool (zombie, skeleton, spider, creeper, slime, ...) is still untouched.
  it('plains keeps the legacy generic pool and only adds the early variants on top', () => {
    const extra = new Set(Object.keys(ROSTERS.plains?.add ?? {}));
    for (const minute of [0, 0.5, 1, 2, 3, 4, 6, 8, 10, 13]) {
      for (const night of [false, true]) {
        for (const water of [false, true]) {
          const now = spawnPool('plains', minute, night, water).map(
            (e) => [e.def.id, e.weight] as [string, number],
          );
          const generic = now.filter(([id]) => !extra.has(id));
          // silverfish arrive two minutes earlier (from: 3); everything else is the legacy rule.
          const legacy = legacyPool('plains', minute, night, water).filter(
            ([id]) => id !== 'silverfish',
          );
          expect(generic.filter(([id]) => id !== 'silverfish')).toEqual(legacy);
        }
      }
    }
  });

  // BUG-20: the first variety pass (about 16%) still left minute 0 at 84% plain zombies. The extras are now about a
  // third of the first minute: zombie and slime reskins (slow, no status effects) from the first second, the swamp
  // rabbit from 0:30, the quick biters at 1:00 and the frozen zombie (its touch slows the hero) not before minute 2.
  it('plains is at most two thirds zombies from the first second and varied by minute 3', () => {
    const zombieShare = (minute: number): number => {
      const pool = spawnPool('plains', minute, false, false);
      const total = pool.reduce((a, e) => a + e.weight, 0);
      return (pool.find((e) => e.def.id === 'zombie')?.weight ?? 0) / total;
    };
    expect(zombieShare(0)).toBeLessThanOrEqual(0.7);
    expect(zombieShare(0.49)).toBeLessThanOrEqual(0.7);
    expect(zombieShare(0.5)).toBeLessThanOrEqual(0.65);
    expect(zombieShare(1)).toBeLessThanOrEqual(0.4);
    expect(zombieShare(3.1)).toBeLessThan(zombieShare(1));
    // Five mob types in the first 30 s, six by 0:30, ten at minute 1, fifteen by minute 3.
    expect(spawnPool('plains', 0, false, false).length).toBeGreaterThanOrEqual(5);
    expect(spawnPool('plains', 0.5, false, false).length).toBeGreaterThanOrEqual(6);
    expect(spawnPool('plains', 1, false, false).length).toBeGreaterThanOrEqual(10);
    expect(spawnPool('plains', 3.1, false, false).length).toBeGreaterThanOrEqual(15);
  });

  it('the hero-slowing frozen zombie stays out of the opening minutes everywhere but the taiga', () => {
    const frozen = ENEMIES['frozen_zombie'];
    if (!frozen) throw new Error('missing def');
    expect(frozen.contactStatus?.kind).toBe('slow');
    for (const b of OVERWORLD_BIOMES) {
      if (b === 'snowy_taiga') continue;
      expect(spawnWeight(frozen, b, 1.9, false, false), b).toBe(0);
    }
  });

  it('the first 30 seconds stay gentle: only zombie-speed melee mobs, nothing ranged or quick', () => {
    for (const b of OVERWORLD_BIOMES) {
      for (const e of spawnPool(b, 0.49, false, false)) {
        if (b === 'plains' || b === 'forest' || b === 'dark_forest') {
          // The three meadow-like starts: no mob faster than the zombie's pace plus a little (chomper aside).
          if (!e.def.id.startsWith('chomper_')) {
            expect(e.def.speed, `${b}: ${e.def.id}`).toBeLessThanOrEqual(34);
          }
          expect(e.def.archetype, `${b}: ${e.def.id}`).toBe('chaser');
        }
      }
    }
  });

  it('no overworld biome opens with more than 70% plain zombies', () => {
    for (const b of OVERWORLD_BIOMES) {
      for (const minute of [0, 0.25, 0.5, 1, 2, 3]) {
        const pool = spawnPool(b, minute, false, false);
        const total = pool.reduce((a, e) => a + e.weight, 0);
        const zombies = pool.find((e) => e.def.id === 'zombie')?.weight ?? 0;
        expect(zombies / total, `${b} @${minute}`).toBeLessThanOrEqual(0.7);
      }
    }
  });

  it('a roster `add` admits a biome-filtered mob and still honours its start minute', () => {
    const rabbit = ENEMIES['zombie_rabbit'];
    const wolf = ENEMIES['angry_brown_wolf'];
    if (!rabbit || !wolf) throw new Error('missing defs');
    expect(spawnWeight(rabbit, 'plains', 0, false, false)).toBe(0); // quick mobs wait for 0:30
    expect(spawnWeight(rabbit, 'plains', 0.5, false, false)).toBeGreaterThan(0);
    expect(spawnWeight(wolf, 'plains', 1, false, false)).toBe(0);
    expect(spawnWeight(wolf, 'plains', 2, false, false)).toBeGreaterThan(0);
    // Not added to a biome that has no entry for it.
    expect(spawnWeight(rabbit, 'desert', 5, false, false)).toBe(0);
  });

  it('biome-only mobs never appear elsewhere (husk: desert/badlands, stray: snowy taiga)', () => {
    for (const b of BIOME_IDS) {
      const ids = spawnPool(b, 12, true, true).map((e) => e.def.id);
      expect(ids.includes('stray'), `stray in ${b}`).toBe(b === 'snowy_taiga');
      expect(ids.includes('husk'), `husk in ${b}`).toBe(b === 'desert' || b === 'badlands');
      // The plains, forest and dark forest admit the jungle zombie as an early variant (ROSTERS.*.add).
      expect(ids.includes('jungle_zombie'), `jungle zombie in ${b}`).toBe(
        b === 'jungle' || b === 'plains' || b === 'forest' || b === 'dark_forest',
      );
    }
  });

  it('every biome has a pool that clearly differs from plains (total variation distance)', () => {
    const dist = (a: BiomeId, b: BiomeId, minute: number): number => {
      const norm = (id: BiomeId): Map<string, number> => {
        const pool = spawnPool(id, minute, false, false);
        const total = pool.reduce((x, e) => x + e.weight, 0);
        return new Map(pool.map((e) => [e.def.id, e.weight / total]));
      };
      const pa = norm(a);
      const pb = norm(b);
      let d = 0;
      for (const k of new Set([...pa.keys(), ...pb.keys()]))
        d += Math.abs((pa.get(k) ?? 0) - (pb.get(k) ?? 0));
      return d / 2;
    };
    for (const b of OVERWORLD_BIOMES) {
      for (const minute of [0, 2, 6, 12]) {
        const pool = spawnPool(b, minute, false, false);
        expect(pool.length, `${b} @${minute}`).toBeGreaterThan(0);
        if (b === 'plains' || minute === 0) continue;
        expect(dist(b, 'plains', minute), `${b} @${minute}`).toBeGreaterThan(
          b === 'forest' ? 0.08 : 0.18,
        );
      }
    }
  });

  it('the first minute of every biome is only soft melee and gentle ranged mobs', () => {
    for (const b of OVERWORLD_BIOMES) {
      for (const e of spawnPool(b, 0.2, false, false)) {
        expect(['chaser', 'leaper', 'charger', 'kiter']).toContain(e.def.archetype);
        // Nothing that hits harder than a zombie at minute zero.
        expect(e.def.dmg * (e.def.shot?.dmgMult ?? 1), `${b}: ${e.def.id}`).toBeLessThanOrEqual(10);
      }
    }
  });

  it('the dark forest brings illagers and witches earlier than other biomes', () => {
    const at = (b: BiomeId, id: string, minute: number): number => {
      const d = ENEMIES[id];
      return d ? spawnWeight(d, b, minute, false, false) : 0;
    };
    expect(at('dark_forest', 'pillager', 5.2)).toBeGreaterThan(0);
    expect(at('plains', 'pillager', 5.2)).toBe(0);
    expect(at('dark_forest', 'witch', 3.1)).toBeGreaterThan(0);
    expect(at('dark_forest', 'witch', 3.1)).toBeGreaterThan(at('plains', 'witch', 4.1));
    // Slimes belong to the swamp, not the desert.
    expect(at('swamp', 'slime_big', 2)).toBeGreaterThan(at('plains', 'slime_big', 2));
    expect(at('desert', 'slime_big', 5)).toBe(0);
    // Drowned only near water, more often in the swamp.
    expect(at('swamp', 'drowned', 5)).toBe(0);
    const d = ENEMIES['drowned'];
    expect(d && spawnWeight(d, 'swamp', 5, false, true)).toBeGreaterThan(
      d ? spawnWeight(d, 'plains', 5, false, true) : 0,
    );
  });

  it('the weighted pick follows the weights and is deterministic', () => {
    const tally = new Map<string, number>();
    for (let i = 0; i < 2000; i++) {
      const id = pickEnemyId('mushroom_fields', 3, false, false, (i + 0.5) / 2000);
      tally.set(id, (tally.get(id) ?? 0) + 1);
    }
    // The ram and the chompers dominate the island.
    const rams = tally.get('horned_mossy_sheep') ?? 0;
    expect(rams).toBeGreaterThan(300);
    expect(tally.get('zombie') ?? 0).toBeLessThan(rams);
    expect(pickEnemyId('desert', 4, false, false, 0.37)).toBe(
      pickEnemyId('desert', 4, false, false, 0.37),
    );
    expect(pickEnemyId('plains', 0, false, false, 0.0)).toBe('zombie');
    expect(pickEnemyId('plains', 0, false, false, 0.5)).toBe('zombie');
    expect(pickEnemyId('plains', 0, false, false, 0.99)).not.toBe('zombie');
  });
});

describe('biome danger', () => {
  it('density and HP follow BIOMES[].danger; plains is the baseline', () => {
    expect(biomeDensity('plains')).toBe(1);
    expect(biomeHpMult('plains')).toBe(1);
    expect(biomeHpMult('dark_forest')).toBeGreaterThan(1);
    expect(biomeHpMult('mushroom_fields')).toBeLessThan(1);
    for (const a of BIOME_IDS)
      for (const b of BIOME_IDS)
        if (BIOMES[a].danger < BIOMES[b].danger) {
          expect(biomeDensity(a)).toBeLessThan(biomeDensity(b));
          expect(biomeHpMult(a)).toBeLessThan(biomeHpMult(b));
        }
  });

  it('the spawner trickles more in dangerous biomes and fewer on the mushroom island', () => {
    const spawned = (biome: BiomeId): { n: number; hpRatio: number } => {
      const run = new RunState(5, 120);
      run.startInBiome(biome);
      let n = 0;
      let hp = 0;
      let expected = 0;
      for (let step = 0; step < 60 * 90; step++) {
        updateSpawner(run, 1 / 60);
        if (step % 30 === 29) {
          for (const e of run.enemies) {
            if (e.def.weight > 0 && !e.charged && !e.elite) {
              hp += e.maxHp;
              expected += e.def.hp * (1 + 0.12 * (run.time / 60));
            }
          }
          n += run.enemies.length;
          run.enemies.length = 0;
        }
      }
      return { n, hpRatio: hp / Math.max(1, expected) };
    };
    const plains = spawned('plains');
    const dark = spawned('dark_forest');
    const mush = spawned('mushroom_fields');
    expect(dark.n).toBeGreaterThan(plains.n);
    expect(mush.n).toBeLessThan(plains.n);
    expect(plains.hpRatio).toBeCloseTo(1, 5);
    expect(dark.hpRatio).toBeCloseTo(biomeHpMult('dark_forest'), 2);
    expect(mush.hpRatio).toBeCloseTo(biomeHpMult('mushroom_fields'), 2);
  });
});

describe('ambient particles', () => {
  it('every biome but plains has an ambience, tied to its kind and to the night', () => {
    expect(pickAmbient('plains', 0, 0.5)).toBeNull();
    for (const b of BIOME_IDS) {
      if (b === 'plains') continue;
      expect(pickAmbient(b, 0, 0.1), b).not.toBeNull();
    }
    expect(pickAmbient('snowy_taiga', 0, 0.5)).toBe('snow');
    expect(pickAmbient('cherry_grove', 0, 0.5)).toBe('petals');
    expect(pickAmbient('desert', 0, 0.5)).toBe('dust');
    expect(pickAmbient('nether', 0, 0.5)).toBe('embers');
    expect(pickAmbient('mushroom_fields', 0, 0.5)).toBe('spores');
    // Fireflies after dark in forests and swamps, never in daylight.
    for (const b of ['forest', 'dark_forest', 'swamp'] as const) {
      expect(pickAmbient(b, 1, 0.5)).toBe('fireflies');
      expect(pickAmbient(b, 0, 0.5)).not.toBe('fireflies');
    }
    expect(FIREFLY_NIGHT).toBeLessThan(1);
    const kinds = new Set<AmbientKind | null>();
    for (let i = 0; i < 20; i++) kinds.add(pickAmbient('jungle', 0, i / 20));
    expect(kinds).toEqual(new Set(['leaves', 'pollen']));
  });

  it('the field fills up, respects the quality tier and never exceeds the pool', () => {
    for (const q of [0, 1, 2] as const) {
      const f = new AmbientField(3);
      for (let i = 0; i < 200; i++) f.update(1 / 60, 'snowy_taiga', 0, i, 0, 320, 180, q);
      expect(f.activeCount()).toBeGreaterThan(AMBIENT_SLOTS[q] * 0.5);
      expect(f.activeCount()).toBeLessThanOrEqual(AMBIENT_SLOTS[q]);
    }
    const low = new AmbientField(3);
    const high = new AmbientField(3);
    for (let i = 0; i < 200; i++) {
      low.update(1 / 60, 'cherry_grove', 0, 0, 0, 320, 180, 0);
      high.update(1 / 60, 'cherry_grove', 0, 0, 0, 320, 180, 2);
    }
    expect(high.activeCount()).toBeGreaterThan(low.activeCount());
  });

  it('plains stays clear and a biome change fades the old specks out', () => {
    const f = new AmbientField(9);
    for (let i = 0; i < 300; i++) f.update(1 / 60, 'plains', 0, 0, 0, 320, 180, 2);
    expect(f.activeCount()).toBe(0);
    for (let i = 0; i < 300; i++) f.update(1 / 60, 'desert', 0, 0, 0, 320, 180, 2);
    expect(f.activeCount()).toBeGreaterThan(10);
    // Back to plains: everything dies out within the longest speck life (9 s).
    for (let i = 0; i < 60 * 10; i++) f.update(1 / 60, 'plains', 0, 0, 0, 320, 180, 2);
    expect(f.activeCount()).toBe(0);
  });
});

describe('music mapping', () => {
  it('maps all 10 overworld biomes and the Nether to a real theme', () => {
    for (const b of BIOME_IDS) expect(THEME_IDS).toContain(biomeTheme(b));
    expect(biomeTheme('jungle')).toBe('jungle');
    expect(biomeTheme('swamp')).toBe('swamp');
    expect(biomeTheme('cherry_grove')).toBe('cherry');
    expect(biomeTheme('mushroom_fields')).toBe('mushroom');
    expect(biomeTheme('badlands')).toBe('badlands');
    expect(biomeTheme('nether')).toBe('nether');
  });

  it('every theme but plains/forest is used by exactly the biome it is named for', () => {
    const used = new Set(BIOME_IDS.map(biomeTheme));
    for (const t of ['jungle', 'swamp', 'cherry', 'mushroom', 'badlands'] as const) {
      expect(used.has(t)).toBe(true);
      expect(THEMES[t].id).toBe(t);
    }
    // The new themes sound different from each other: distinct root/scale/tempo combinations.
    const sigs = new Set(
      (['jungle', 'swamp', 'cherry', 'mushroom', 'badlands', 'desert', 'dark_forest'] as const).map(
        (t) => `${THEMES[t].root}/${THEMES[t].scale.join('')}/${THEMES[t].bpm}`,
      ),
    );
    expect(sigs.size).toBe(7);
  });

  const sit = (biome: BiomeId, night = 0, boss = false, rift = false) => ({
    biome,
    night,
    boss,
    rift,
  });

  it('starts on the biome theme and does not flutter along a border', () => {
    const m = new MusicDirector();
    expect(m.update(0.016, sit('plains'))).toBe('plains');
    let changes = 0;
    let last = 'plains';
    // Hop between plains and jungle every 0.5 s for two minutes.
    for (let i = 0; i < 240; i++) {
      const t = m.update(0.5, sit(i % 2 === 0 ? 'jungle' : 'plains'));
      if (t !== last) changes++;
      last = t;
    }
    expect(changes).toBe(0);
  });

  it('follows a biome after the settle time, and not faster than the minimum gap', () => {
    const m = new MusicDirector();
    m.update(0.1, sit('plains'));
    let t = 0;
    let at = -1;
    while (t < 60 && at < 0) {
      t += 0.5;
      if (m.update(0.5, sit('jungle')) === 'jungle') at = t;
    }
    expect(at).toBeGreaterThanOrEqual(THEME_SETTLE);
    expect(at).toBeLessThanOrEqual(THEME_SETTLE + 1);
    // Crossing into the swamp right away waits for the minimum gap since the last change.
    let t2 = 0;
    let at2 = -1;
    while (t2 < 60 && at2 < 0) {
      t2 += 0.5;
      if (m.update(0.5, sit('swamp')) === 'swamp') at2 = t2;
    }
    expect(at2).toBeGreaterThanOrEqual(THEME_MIN_GAP - 0.5);
    expect(at2).toBeLessThanOrEqual(THEME_MIN_GAP + 1);
  });

  it('boss, rift and night take over at once, with hysteresis on the night', () => {
    const m = new MusicDirector();
    m.update(0.1, sit('desert'));
    expect(m.update(0.1, sit('desert', 0, true))).toBe('boss');
    expect(m.update(0.1, sit('desert', 0, false, true))).toBe('nether');
    // Back to day: the biome theme returns immediately after an override.
    expect(m.update(0.1, sit('desert'))).toBe('desert');
    expect(m.update(0.1, sit('desert', NIGHT_ON + 0.01))).toBe('night');
    // Dusk flutter around the threshold does not drop the night theme.
    expect(m.update(0.1, sit('desert', NIGHT_ON - 0.05))).toBe('night');
    expect(m.update(0.1, sit('desert', 0.1))).toBe('desert');
  });
});
