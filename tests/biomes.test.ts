import { describe, expect, it } from 'vitest';
import type { InputSource } from '../src/core/input';
import { RunState } from '../src/game';
import { biomeTheme, THEME_IDS } from '../src/data/music';
import {
  BIOME_CELL,
  biomeAtTile,
  biomeBlend,
  classifyClimate,
  findBiome,
  PLAINS_RADIUS,
} from '../src/world/biomeMap';
import { BIOME_IDS, BIOMES, type BiomeId, OVERWORLD_BIOMES } from '../src/world/biomes';
import { genProps } from '../src/world/props';
import { CHUNK_TILES, genTerrain, SPAWN_CLEAR, TILE, tileAt } from '../src/world/terrain';
import { findBiomeGround, World } from '../src/world/world';

const SEEDS = [1, 2, 3, 7, 42];

class Still implements InputSource {
  dx = 0;
  dy = 0;
  moveVector(): { x: number; y: number } {
    return { x: this.dx, y: this.dy };
  }
  pausePressed(): boolean {
    return false;
  }
  confirmPressed(): boolean {
    return false;
  }
  cancelPressed(): boolean {
    return false;
  }
  activePressed(): boolean {
    return false;
  }
  endStep(): void {}
}

describe('biome data', () => {
  it('has 11 complete biomes with distinct palettes and valid music themes', () => {
    expect(BIOME_IDS.length).toBe(11);
    expect(OVERWORLD_BIOMES.length).toBe(10);
    const grass = new Set<string>();
    for (const id of BIOME_IDS) {
      const b = BIOMES[id];
      expect(b.id).toBe(id);
      expect(b.name.length).toBeGreaterThan(0);
      expect(THEME_IDS).toContain(biomeTheme(id));
      grass.add(b.grass[0].join(','));
    }
    expect(grass.size).toBe(11);
  });

  it('the climate table produces every overworld biome', () => {
    const seen = new Set<BiomeId>();
    for (let t = 0; t <= 1; t += 0.02)
      for (let h = 0; h <= 1; h += 0.02)
        for (let w = 0; w <= 1; w += 0.05) seen.add(classifyClimate(t, h, w));
    expect([...seen].sort()).toEqual([...OVERWORLD_BIOMES].sort());
  });
});

describe('biome map', () => {
  it('is deterministic and does not depend on query order', () => {
    const forward: BiomeId[] = [];
    for (let i = 0; i < 400; i++) forward.push(biomeAtTile(i * 7 - 1400, i * -5 + 900, 11));
    const backward: BiomeId[] = [];
    for (let i = 399; i >= 0; i--) backward.unshift(biomeAtTile(i * 7 - 1400, i * -5 + 900, 11));
    expect(backward).toEqual(forward);
    // Every tile of a 4x4 cell shares the cell's biome.
    for (let k = 0; k < 16; k++)
      expect(biomeAtTile(400 + (k % 4), -200 + (k >> 2), 11)).toBe(biomeAtTile(400, -200, 11));
  });

  it('the spawn meadow is always plains', () => {
    for (let seed = 1; seed <= 25; seed++) {
      for (let ty = -PLAINS_RADIUS; ty <= PLAINS_RADIUS; ty += 2) {
        for (let tx = -PLAINS_RADIUS; tx <= PLAINS_RADIUS; tx += 2) {
          if (Math.hypot(tx, ty) <= PLAINS_RADIUS - BIOME_CELL)
            expect(biomeAtTile(tx, ty, seed)).toBe('plains');
        }
      }
    }
  });

  it('is the Nether in the rift arena', () => {
    expect(biomeAtTile(3, 4, 9, { r: 22 })).toBe('nether');
    expect(new World(9, { r: 22 }).biomeAtPx(100, -40)).toBe('nether');
  });

  it('every overworld biome occurs within 600 tiles of spawn', () => {
    for (const seed of SEEDS) {
      const seen = new Set<BiomeId>();
      for (let ty = -600; ty <= 600; ty += 8) {
        for (let tx = -600; tx <= 600; tx += 8) {
          if (Math.hypot(tx, ty) <= 600) seen.add(biomeAtTile(tx, ty, seed));
        }
      }
      expect([...seen].sort(), `seed ${seed}`).toEqual([...OVERWORLD_BIOMES].sort());
    }
  });

  it('regions have Minecraft-like sizes (mean run along a line of 25-70 tiles)', () => {
    for (const seed of SEEDS) {
      let runs = 0;
      let length = 0;
      for (let ty = -600; ty <= 600; ty += 40) {
        let prev: BiomeId | null = null;
        for (let tx = -700; tx <= 700; tx += BIOME_CELL) {
          const b = biomeAtTile(tx, ty, seed);
          if (b !== prev) runs++;
          prev = b;
          length += BIOME_CELL;
        }
      }
      const mean = length / runs;
      expect(mean, `seed ${seed}`).toBeGreaterThan(25);
      expect(mean, `seed ${seed}`).toBeLessThan(70);
    }
  });

  it('biomeBlend reports border proximity', () => {
    const seed = 3;
    // Walk right from the spawn until the biome changes: the last plains tile is 1 tile from the border.
    let tx = 0;
    while (biomeAtTile(tx + 1, 0, seed) === 'plains') tx++;
    const edge = biomeBlend(tx, 0, seed);
    expect(edge.biome).toBe('plains');
    expect(edge.dist).toBe(1);
    expect(edge.other).toBe(biomeAtTile(tx + 1, 0, seed));
    const inside = biomeBlend(0, 0, seed);
    expect(inside.other).toBe('plains');
    expect(inside.dist).toBe(4);
  });

  it('findBiome walks outward to the nearest cell of a biome', () => {
    for (const biome of OVERWORLD_BIOMES) {
      const hit = findBiome(biome, 7);
      expect(hit, biome).not.toBeNull();
      if (hit) expect(biomeAtTile(hit.tx, hit.ty, 7)).toBe(biome);
    }
    const world = new World(7);
    const spot = findBiomeGround(world, 'jungle');
    expect(spot).not.toBeNull();
    if (spot) {
      expect(world.biomeAtPx(spot.x, spot.y)).toBe('jungle');
      expect(world.tileAtPx(spot.x, spot.y)).toBe(TILE.GRASS);
    }
  });
});

describe('biome-aware terrain', () => {
  it('genTerrain agrees with tileAt on chunks that straddle biome borders', () => {
    for (const [cx, cy] of [
      [6, -3],
      [-9, 4],
      [12, 12],
    ] as const) {
      const t = genTerrain(cx, cy, 5);
      const side = CHUNK_TILES + 2;
      for (let y = 0; y < side; y++)
        for (let x = 0; x < side; x++)
          expect(t[y * side + x]).toBe(
            tileAt(cx * CHUNK_TILES + x - 1, cy * CHUNK_TILES + y - 1, 5),
          );
    }
  });

  it('keeps the spawn dry for every seed', () => {
    for (let seed = 1; seed <= 12; seed++) {
      for (let y = -SPAWN_CLEAR; y <= SPAWN_CLEAR; y++) {
        for (let x = -SPAWN_CLEAR; x <= SPAWN_CLEAR; x++) {
          if (Math.hypot(x, y) < SPAWN_CLEAR) {
            const t = tileAt(x, y, seed);
            expect(t === TILE.WATER || t === TILE.LAVA).toBe(false);
          }
        }
      }
    }
  });

  it('swamps are wet, badlands have no lakes, lava only in lava biomes', () => {
    const tiles: Partial<Record<BiomeId, { n: number; water: number }>> = {};
    for (const seed of SEEDS) {
      for (let ty = -500; ty <= 500; ty += 3) {
        for (let tx = -500; tx <= 500; tx += 3) {
          const b = biomeAtTile(tx, ty, seed);
          const t = tileAt(tx, ty, seed);
          const s = (tiles[b] ??= { n: 0, water: 0 });
          s.n++;
          if (t === TILE.WATER) s.water++;
          if (t === TILE.LAVA) expect(BIOMES[b].lava, b).toBe(true);
        }
      }
    }
    const share = (b: BiomeId): number => (tiles[b]?.water ?? 0) / (tiles[b]?.n ?? 1);
    expect(share('swamp')).toBeGreaterThan(0.25);
    expect(share('swamp')).toBeGreaterThan(share('plains') * 2);
    expect(share('desert')).toBeLessThan(share('plains'));
    expect(share('badlands')).toBeLessThan(0.02);
  });

  it('surface() reads the biome at the point itself', () => {
    const world = new World(19);
    const iceSpot = findTileIn(world, TILE.WATER, 'snowy_taiga');
    expect(world.surface(iceSpot.x, iceSpot.y)).toBe('ice');
    const waterSpot = findTileIn(world, TILE.WATER, 'swamp');
    expect(world.surface(waterSpot.x, waterSpot.y)).toBe('water');
    expect(world.speedFactor(waterSpot.x, waterSpot.y)).toBeLessThan(1);
    // The override still wins (debug / tests).
    expect(world.surface(iceSpot.x, iceSpot.y, 'plains')).toBe('water');
  });
});

describe('biome-aware props', () => {
  it('each prop grows for the biome of its own cell', () => {
    const world = new World(42);
    let cacti = 0;
    let checked = 0;
    for (const biome of ['desert', 'snowy_taiga', 'jungle', 'cherry_grove'] as const) {
      const spot = findBiomeGround(world, biome);
      if (!spot) throw new Error(biome);
      const props = world.propsInRect(spot.x - 600, spot.y - 600, spot.x + 600, spot.y + 600);
      for (const p of props) {
        expect(p.biome).toBe(world.biomeAtPx(p.x - 4, p.y - 10));
        if (p.kind === 'cactus') {
          cacti++;
          expect(['desert', 'badlands']).toContain(p.biome);
        }
        if (p.kind === 'tree' && p.variant % 8 === 3) expect(p.biome).toBe('snowy_taiga');
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
    expect(cacti).toBeGreaterThan(3);
  });

  it('forced biomes keep their densities (jungle > forest > plains in trees)', () => {
    const trees = (b: BiomeId): number => {
      let n = 0;
      for (let cy = -4; cy <= 4; cy++)
        for (let cx = -4; cx <= 4; cx++)
          n += genProps(cx, cy, 8, b).filter((p) => p.kind === 'tree').length;
      return n;
    };
    expect(trees('jungle')).toBeGreaterThan(trees('forest'));
    expect(trees('forest')).toBeGreaterThan(trees('plains') * 1.5);
    expect(trees('badlands')).toBe(0);
  });
});

describe('the hero in the biome map', () => {
  it('run.biome() follows the hero, and entering a biome is announced once', () => {
    const run = new RunState(7, 10);
    expect(run.biome()).toBe('plains');
    const spot = findBiomeGround(run.world, 'desert');
    if (!spot) throw new Error('no desert');
    run.player.x = spot.x;
    run.player.y = spot.y;
    run.player.snap();
    expect(run.biome()).toBe('desert');
    const said: string[] = [];
    const announce = run.announce.bind(run);
    run.announce = (text, color, seconds) => {
      said.push(text);
      announce(text, color, seconds);
    };
    const input = new Still();
    const wait = (seconds: number): void => {
      for (let i = 0; i < seconds * 60; i++) run.update(1 / 60, input);
    };
    wait(0.5);
    expect(said.filter((t) => t.startsWith('Entering'))).toEqual([]); // not settled yet
    wait(1);
    expect(said.filter((t) => t.startsWith('Entering'))).toEqual(['Entering Desert']);
    // Hopping back and forth over a border within the cooldown does not spam banners.
    run.player.x = 0;
    run.player.y = 0;
    wait(1.5);
    run.player.x = spot.x;
    run.player.y = spot.y;
    wait(1.5);
    expect(said.filter((t) => t.startsWith('Entering'))).toEqual(['Entering Desert']);
    // After the cooldown, a new biome is announced again.
    wait(6);
    run.player.x = 0;
    run.player.y = 0;
    wait(1.5);
    expect(said.filter((t) => t.startsWith('Entering'))).toEqual([
      'Entering Desert',
      'Entering Plains',
    ]);
  });

  it('startInBiome places the hero on dry ground inside the biome', () => {
    for (const biome of ['swamp', 'badlands', 'mushroom_fields'] as const) {
      const run = new RunState(3, 0);
      expect(run.startInBiome(biome)).toBe(true);
      expect(run.biome()).toBe(biome);
      expect(run.world.tileAtPx(run.player.x, run.player.y)).toBe(TILE.GRASS);
    }
  });
});

/** Centre of the nearest tile with this code inside a biome (ring search over biome cells). */
function findTileIn(world: World, code: number, biome: BiomeId): { x: number; y: number } {
  for (let r = 0; r < 200; r++) {
    for (let by = -r; by <= r; by++) {
      for (let bx = -r; bx <= r; bx++) {
        if (Math.max(Math.abs(bx), Math.abs(by)) !== r) continue;
        if (world.biomeAtTile(bx * BIOME_CELL, by * BIOME_CELL) !== biome) continue;
        for (let k = 0; k < 16; k++) {
          const tx = bx * BIOME_CELL + (k % 4);
          const ty = by * BIOME_CELL + (k >> 2);
          if (world.tileAt(tx, ty) === code) return { x: tx * 16 + 8, y: ty * 16 + 8 };
        }
      }
    }
  }
  throw new Error(`no tile ${code} in ${biome}`);
}

describe('findBiomeGround', () => {
  it('always lands on dry, walkable ground, for many seeds and every overworld biome', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const world = new World(seed);
      for (const biome of OVERWORLD_BIOMES) {
        const spot = findBiomeGround(world, biome);
        if (!spot) throw new Error(`no ground for ${biome} on seed ${seed}`);
        const tile = world.tileAtPx(spot.x, spot.y);
        expect([TILE.GRASS, TILE.SAND], `${biome} seed ${seed}`).toContain(tile);
        expect(world.surface(spot.x, spot.y), `${biome} seed ${seed}`).toBe('ground');
        expect(world.overlapsSolid(spot.x, spot.y, 8)).toBe(false);
      }
    }
  });
});
