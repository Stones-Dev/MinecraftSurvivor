import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import {
  chestIndexFromId,
  chestRng,
  chestTable,
  LOOT_TABLE_IDS,
  type LootDrop,
  resolveIronUpgrade,
  rollLoot,
} from '../src/data/lootTables';
import { Projectile } from '../src/entities/projectile';
import { RunState } from '../src/game';
import { makeEnemy, ringPoint } from '../src/systems/spawner';
import { Pathing } from '../src/systems/pathing';
import { updateInteract } from '../src/systems/interact';
import { updateNpcs } from '../src/systems/npcs';
import {
  CROP_HEAL,
  CROP_REGROW_S,
  smithTarget,
  SERVICE_COST,
  updateStructureInteract,
  updateVillageLife,
} from '../src/systems/structureInteract';
import {
  BLAST_STAGGER_S,
  FUSE_S,
  inTrapZone,
  newTrap,
  stepTrap,
  TNT_COUNT,
  tntPoints,
  TRAP_DAMAGE,
  TRAP_RADIUS,
  type TrapEvent,
} from '../src/systems/templeTrap';
import {
  GOLEM_DAMAGE,
  GOLEM_LEASH,
  GOLEM_SIGHT,
  newGolem,
  stepGolem,
  updateVillageGolem,
  villageGolems,
} from '../src/systems/villageGolem';
import { MAX_WEAPON_LEVEL } from '../src/weapons';
import { MAT, materialName, MATERIAL_COUNT } from '../src/world/blocks';
import { BIOMES } from '../src/world/biomes';
import { biomeAtTile } from '../src/world/biomeMap';
import {
  applyOverlay,
  EDGE_MARGIN,
  OV_SOLID,
  type PlacedStructure,
  poiMarkers,
  StructureIndex,
  type StructureId,
  structuresInRect,
  findNearestStructure,
} from '../src/world/structures';
import { STRUCTURE_DEFS } from '../src/world/structures/registry';
import {
  CHUNK_TILES,
  genChunkBiomes,
  genTerrain,
  SPAWN_CLEAR,
  TILE,
  TILE_PX,
  tileAt,
} from '../src/world/terrain';
import { paintChunk } from '../src/world/tilePaint';
import { World } from '../src/world/world';

/** Props that close a doorway until a mechanism opens it (the registry test removes them before the flood fill). */
const GATE_KINDS = new Set<string>(['stone_door', 'copper_bars']);

const SEEDS = Array.from({ length: 50 }, (_, i) => i * 977 + 13);

/** Every instance within +-`r` tiles of the origin. */
function placedAround(world: World, r: number): PlacedStructure[] {
  return world.structures?.inTileRect(-r, -r, r, r) ?? [];
}

function nearest(world: World, id: StructureId): PlacedStructure {
  const s = findNearestStructure(world, id, 0, 0, 40000);
  if (!s) throw new Error(`no ${id} near the origin`);
  return s;
}

/** Seeds whose nearest `id` stands in one of the biomes (a few of each so every style is covered). */
function seedsWith(id: StructureId, perBiome = 1): number[] {
  const out: number[] = [];
  const count = new Map<string, number>();
  for (let seed = 1; seed <= 160; seed++) {
    const s = new World(seed).structures?.nearest(id, 0, 0, 40000);
    if (!s) continue;
    const n = count.get(s.biome) ?? 0;
    if (n < perBiome) {
      count.set(s.biome, n + 1);
      out.push(seed);
    }
  }
  return out;
}

describe('structure placement', () => {
  it('is deterministic, independent of query order, and differs between seeds', () => {
    const keys = (idx: StructureIndex, order: 1 | -1): string[] => {
      const out: string[] = [];
      for (let i = 0; i < 12; i++) {
        const k = order === 1 ? i : 11 - i;
        for (const p of idx.inTileRect(k * 40 - 240, -240, k * 40 - 200, 240)) out.push(p.key);
      }
      return [...new Set(out)].sort();
    };
    const a = keys(new StructureIndex(77), 1);
    expect(keys(new StructureIndex(77), -1)).toEqual(a);
    expect(a.length).toBeGreaterThan(3);
    expect(keys(new StructureIndex(78), 1)).not.toEqual(a);
    // The blueprint (tiles, props, actors) is part of the determinism.
    const p1 = new StructureIndex(77).inTileRect(-300, -300, 300, 300);
    const p2 = new StructureIndex(77).inTileRect(-300, -300, 300, 300);
    expect(p1.map((p) => [...p.blueprint.mat, ...p.blueprint.solid])).toEqual(
      p2.map((p) => [...p.blueprint.mat, ...p.blueprint.solid]),
    );
    expect(p1.map((p) => p.props)).toEqual(p2.map((p) => p.props));
  });

  it(
    'keeps the grid, the spacing, the starting meadow, dry land and the biomes',
    { timeout: 60000 },
    () => {
      let checked = 0;
      for (const seed of SEEDS.slice(0, 20)) {
        const world = new World(seed);
        const all = placedAround(world, 350);
        for (const p of all) {
          const d = p.def;
          // Inside its own grid cell, with the edge margin to spare.
          expect(Math.floor(p.tx / d.spacing)).toBe(Math.floor((p.tx + p.width - 1) / d.spacing));
          expect(Math.floor(p.ty / d.spacing)).toBe(Math.floor((p.ty + p.height - 1) / d.spacing));
          expect(((p.tx % d.spacing) + d.spacing) % d.spacing).toBeGreaterThanOrEqual(EDGE_MARGIN);
          // Never near the start.
          const dx = Math.max(p.tx, -(p.tx + p.width - 1), 0);
          const dy = Math.max(p.ty, -(p.ty + p.height - 1), 0);
          expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(Math.max(60, d.minDistFromSpawn));
          expect(Math.hypot(dx, dy)).toBeGreaterThan(SPAWN_CLEAR * 4);
          // Dry land (with a 2-tile margin) in the allowed biomes.
          let wet = 0;
          for (let y = p.ty - 2; y < p.ty + p.height + 2; y++)
            for (let x = p.tx - 2; x < p.tx + p.width + 2; x++) {
              const t = tileAt(x, y, seed);
              if (d.allowWaterNear) {
                // Stilt sites may stand in the shallows: never lava, at most half of the footprint wet.
                expect(t === TILE.LAVA, `${p.key} ${x},${y}`).toBe(false);
                if (
                  t === TILE.WATER &&
                  x >= p.tx &&
                  x < p.tx + p.width &&
                  y >= p.ty &&
                  y < p.ty + p.height
                )
                  wet++;
              } else expect(t === TILE.WATER || t === TILE.LAVA, `${p.key} ${x},${y}`).toBe(false);
            }
          expect(wet * 2).toBeLessThanOrEqual(p.width * p.height);
          expect(d.allowedBiomes).toContain(
            biomeAtTile(p.tx + (p.width >> 1), p.ty + (p.height >> 1), seed),
          );
          expect(d.allowedBiomes).toContain(biomeAtTile(p.tx, p.ty, seed));
          expect(d.allowedBiomes).toContain(
            biomeAtTile(p.tx + p.width - 1, p.ty + p.height - 1, seed),
          );
          checked++;
        }
        // Pairs: same structure at least 2 * EDGE_MARGIN apart, different ones at least 3 tiles apart.
        for (let i = 0; i < all.length; i++) {
          for (let j = i + 1; j < all.length; j++) {
            const a = all[i];
            const b = all[j];
            if (!a || !b) continue;
            const gapX = Math.max(a.tx - (b.tx + b.width), b.tx - (a.tx + a.width));
            const gapY = Math.max(a.ty - (b.ty + b.height), b.ty - (a.ty + a.height));
            const gap = Math.max(gapX, gapY);
            expect(gap, `${a.key} vs ${b.key}`).toBeGreaterThanOrEqual(
              a.def.id === b.def.id ? 2 * EDGE_MARGIN : 3,
            );
          }
        }
      }
      expect(checked).toBeGreaterThan(80);
    },
  );

  it('puts at least one village within 160 tiles of the start in every one of 50 seeds', () => {
    const dists: number[] = [];
    for (const seed of SEEDS) {
      const v = new World(seed).structures?.nearest('village', 0, 0, 400 * TILE_PX);
      expect(v, `seed ${seed}`).toBeTruthy();
      if (v) dists.push(Math.hypot(v.cx, v.cy) / TILE_PX);
    }
    expect(Math.max(...dists)).toBeLessThanOrEqual(160);
    expect(Math.min(...dists)).toBeGreaterThanOrEqual(60);
  });

  it('is rarer for temples than for villages and uses every registered def', () => {
    let v = 0;
    let t = 0;
    for (const seed of SEEDS.slice(0, 20)) {
      const all = placedAround(new World(seed), 400);
      v += all.filter((p) => p.def.id === 'village').length;
      t += all.filter((p) => p.def.id === 'desert_temple').length;
    }
    expect(t).toBeGreaterThan(0);
    expect(v).toBeGreaterThan(t * 3);
    expect(STRUCTURE_DEFS.map((d) => d.id).sort()).toEqual([
      'desert_temple',
      'jungle_temple',
      'pillager_outpost',
      'trial_chamber',
      'village',
      'witch_hut',
    ]);
  });

  it('offers minimap markers for the structures around a point', () => {
    const world = new World(SEEDS[3] ?? 1);
    const v = nearest(world, 'village');
    const markers = poiMarkers(world, v.cx, v.cy, 200);
    expect(markers.some((m) => m.id === 'village' && Math.hypot(m.x - v.cx, m.y - v.cy) < 1)).toBe(
      true,
    );
    expect(poiMarkers(new World(1, { r: 22 }), 0, 0, 5000)).toEqual([]);
    expect(structuresInRect(world, v.cx - 10, v.cy - 10, v.cx + 10, v.cy + 10)).toContain(v);
  });
});

describe('structure terrain in the world', () => {
  const seed = SEEDS[3] ?? 1;
  const world = new World(seed);
  const village = nearest(world, 'village');

  it('reads walls as TILE.WALL and floors as dry ground; the rest is the natural terrain', () => {
    const bp = village.blueprint;
    let solid = 0;
    let floor = 0;
    for (let j = 0; j < bp.height; j++)
      for (let i = 0; i < bp.width; i++) {
        const t = world.tileAt(village.tx + i, village.ty + j);
        const m = bp.mat[j * bp.width + i] ?? 0;
        if (m === 0) expect(t).toBe(tileAt(village.tx + i, village.ty + j, seed));
        else if (bp.solid[j * bp.width + i]) {
          expect(t).toBe(TILE.WALL);
          solid++;
        } else {
          expect(t).toBe(TILE.GRASS);
          floor++;
        }
      }
    expect(solid).toBeGreaterThan(30);
    expect(floor).toBeGreaterThan(30);
    expect(world.surface(village.entryX, village.entryY)).toBe('ground');
  });

  it('collides: walls push the hero out, doorways are open, enemies cannot spawn inside walls', () => {
    const bp = village.blueprint;
    let walls = 0;
    for (let j = 0; j < bp.height; j++)
      for (let i = 0; i < bp.width; i++) {
        if (!bp.solid[j * bp.width + i]) continue;
        const x = (village.tx + i + 0.5) * TILE_PX;
        const y = (village.ty + j + 0.5) * TILE_PX;
        const r = world.collide(x, y, 5);
        // ringPoint (systems/spawner.ts) rejects a point the collision moves by 3 px or more.
        expect(Math.hypot(r.x - x, r.y - y), `${i},${j}`).toBeGreaterThanOrEqual(3);
        // And what comes out is a free spot.
        expect(world.structures?.overlapsSolid(r.x, r.y, 4.5), `${i},${j}`).toBe(false);
        expect(world.overlapsSolid(x, y, 5)).toBe(true);
        walls++;
      }
    expect(walls).toBeGreaterThan(30);
    // A circle walking into a wall from outside is stopped at its surface.
    const wallTile = (() => {
      for (let j = 1; j < bp.height - 1; j++)
        for (let i = 1; i < bp.width - 1; i++)
          if (
            bp.solid[j * bp.width + i] &&
            !bp.solid[(j + 1) * bp.width + i] &&
            bp.mat[(j + 1) * bp.width + i] !== 0
          )
            return { i, j };
      return null;
    })();
    expect(wallTile).toBeTruthy();
    if (!wallTile) return;
    const wx = (village.tx + wallTile.i + 0.5) * TILE_PX;
    const southFace = (village.ty + wallTile.j + 1) * TILE_PX;
    const pushed = world.collide(wx, southFace - 2, 5);
    expect(pushed.y).toBeGreaterThanOrEqual(southFace + 5 - 0.01);
    expect(world.collide(wx, southFace + 20, 5)).toEqual({ x: wx, y: southFace + 20 });
  });

  it('removes natural props around the footprint and adds the structure props, chunk by chunk', () => {
    const inFoot = (x: number, y: number, m: number): boolean =>
      x >= (village.tx - m) * TILE_PX &&
      x < (village.tx + village.width + m) * TILE_PX &&
      y >= (village.ty - m) * TILE_PX &&
      y < (village.ty + village.height + m) * TILE_PX;
    const props = world.propsInRect(
      (village.tx - 3) * TILE_PX,
      (village.ty - 3) * TILE_PX,
      (village.tx + village.width + 3) * TILE_PX,
      (village.ty + village.height + 3) * TILE_PX,
    );
    for (const p of props) {
      if (!p.id.startsWith('s:')) expect(inFoot(p.x, p.y, 2), `${p.kind} ${p.id}`).toBe(false);
    }
    for (const p of village.props) expect(props).toContain(p);
    expect(village.props.some((p) => p.kind === 'chest_village')).toBe(true);
    expect(new Set(village.props.map((p) => p.id)).size).toBe(village.props.length);
  });

  it('paints the overlay materials and leaves chunks without structures byte-identical', () => {
    const cx = Math.floor((village.tx + 3) / CHUNK_TILES);
    const cy = Math.floor((village.ty + 3) / CHUNK_TILES);
    const ov = world.structureOverlay(cx, cy);
    expect(ov).toBeTruthy();
    if (!ov) return;
    const biomes = genChunkBiomes(cx, cy, (x, y) => world.biomeIndexAtTile(x, y));
    const base = genTerrain(cx, cy, seed);
    const withOv = base.slice();
    applyOverlay(withOv, ov);
    expect(withOv).not.toEqual(base);
    const plain = paintChunk(cx, cy, base, biomes, seed);
    const stamped = paintChunk(cx, cy, withOv, biomes, seed, ov);
    expect(stamped.data).not.toEqual(plain.data);
    // A chunk far from every structure paints the same with or without the hook.
    const far = world.structureOverlay(400, 400);
    expect(far).toBeNull();
    const t2 = genTerrain(400, 400, seed);
    const b2 = genChunkBiomes(400, 400, (x, y) => world.biomeIndexAtTile(x, y));
    expect(paintChunk(400, 400, t2, b2, seed, null).data).toEqual(
      paintChunk(400, 400, t2, b2, seed).data,
    );
    // Solid tiles carry the solid bit, in the overlay as in the world.
    expect([...ov].some((v) => (v & OV_SOLID) !== 0)).toBe(true);
  });

  it('never lets a walking circle into a wall, whatever it bumps into (fuzz)', () => {
    const rng = new Rng(4);
    for (const s of [
      village,
      nearest(new World(seedsWith('desert_temple')[0] ?? 1), 'desert_temple'),
    ]) {
      const w = s === village ? world : new World(seedsWith('desert_temple')[0] ?? 1);
      let x = s.entryX;
      let y = s.entryY;
      let inside = 0;
      for (let k = 0; k < 6000; k++) {
        // A drunk walk with a pull toward the middle, so it keeps hitting walls, props and doorways.
        x += rng.range(-3, 3) + (s.cx - x) * 0.004;
        y += rng.range(-3, 3) + (s.cy - y) * 0.004;
        const r = w.collide(x, y, 5);
        x = r.x;
        y = r.y;
        expect(w.structures?.overlapsSolid(x, y, 4.9), `${s.key} step ${k}`).toBe(false);
        if (
          x > s.tx * TILE_PX &&
          x < (s.tx + s.width) * TILE_PX &&
          y > s.ty * TILE_PX &&
          y < (s.ty + s.height) * TILE_PX
        )
          inside++;
      }
      expect(inside).toBeGreaterThan(1500);
    }
  });

  it('adds new ground materials with names', () => {
    expect(MATERIAL_COUNT).toBe(38);
    for (const m of [
      MAT.OAK_PLANKS,
      MAT.CUT_SANDSTONE,
      MAT.ORANGE_TERRACOTTA,
      MAT.BLUE_TERRACOTTA,
      MAT.FARMLAND,
      MAT.DIRT_PATH,
    ])
      expect(materialName(m)).not.toBe('?');
  });

  it('blocks pathing through walls and opens it through doorways', () => {
    const bp = village.blueprint;
    const path = new Pathing();
    const hx = village.entryX;
    const hy = village.entryY;
    path.update(1, hx, hy, world);
    const out = { x: 0, y: 0 };
    let wallBlocked = 0;
    let wallsSeen = 0;
    for (let j = 0; j < bp.height; j++)
      for (let i = 0; i < bp.width; i++) {
        if (!bp.solid[j * bp.width + i]) continue;
        wallsSeen++;
        // A walker standing inside a wall tile has no route (unreachable), like inside a tree trunk.
        const x = (village.tx + i + 0.5) * TILE_PX;
        const y = (village.ty + j + 0.5) * TILE_PX;
        if (!path.dir(x, y, out)) wallBlocked++;
      }
    expect(wallBlocked).toBe(wallsSeen);
    // From inside the smithy the route to the hero leads out through the door, not through the wall.
    const smith = bp.actors.find((a) => a.role === 'smith');
    expect(smith).toBeTruthy();
    if (!smith) return;
    const sx = (village.tx + smith.tx + 0.5) * TILE_PX;
    const sy = (village.ty + smith.ty + 0.5) * TILE_PX;
    expect(path.dir(sx, sy, out)).toBe(true);
    // Walk the route: it must reach the hero's neighbourhood without ever entering a solid tile.
    let x = sx;
    let y = sy;
    for (let k = 0; k < 900; k++) {
      if (!path.dir(x, y, out)) break;
      // Like the enemies: step along the field's direction, then let the collision settle the walker.
      const r = world.collide(x + out.x * 3, y + out.y * 3, 6);
      x = r.x;
      y = r.y;
    }
    expect(Math.hypot(x - hx, y - hy)).toBeLessThan(40);
  });
});

/** Flood fill with the real collision: which points can a hero circle (radius 5) stand on and reach? */
function reachable(
  world: World,
  p: PlacedStructure,
  avoid?: { x: number; y: number; r: number },
): { has: (x: number, y: number, within: number) => boolean; count: number } {
  const STEP = 4;
  const x0 = (p.tx - 3) * TILE_PX;
  const y0 = (p.ty - 3) * TILE_PX;
  const w = Math.ceil(((p.width + 6) * TILE_PX) / STEP);
  const h = Math.ceil(((p.height + 6) * TILE_PX) / STEP);
  const seen = new Uint8Array(w * h);
  const free = (cx: number, cy: number): boolean => {
    const x = x0 + cx * STEP;
    const y = y0 + cy * STEP;
    if (avoid && Math.hypot(x - avoid.x, y - avoid.y) < avoid.r) return false;
    const r = world.collide(x, y, 5);
    return Math.abs(r.x - x) < 0.01 && Math.abs(r.y - y) < 0.01;
  };
  const sx = Math.round((p.entryX - x0) / STEP);
  const sy = Math.round((p.entryY - y0) / STEP);
  const queue: number[] = [sy * w + sx];
  seen[sy * w + sx] = 1;
  let count = 0;
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head] ?? 0;
    const cx = cur % w;
    const cy = (cur - cx) / w;
    count++;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[ny * w + nx]) continue;
      seen[ny * w + nx] = 1;
      if (free(nx, ny)) queue.push(ny * w + nx);
    }
  }
  const reached = new Uint8Array(w * h);
  for (const q of queue) reached[q] = 1;
  return {
    count,
    has: (x, y, within) => {
      const r = Math.ceil(within / STEP);
      const cx = Math.round((x - x0) / STEP);
      const cy = Math.round((y - y0) / STEP);
      for (let j = -r; j <= r; j++)
        for (let i = -r; i <= r; i++) {
          const nx = cx + i;
          const ny = cy + j;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || !reached[ny * w + nx]) continue;
          if (Math.hypot(nx * STEP + x0 - x, ny * STEP + y0 - y) <= within) return true;
        }
      return false;
    },
  };
}

describe('structure walkability (flood fill from the door)', () => {
  it('reaches every chest and villager of every village style, mirrored or not', () => {
    const seeds = seedsWith('village', 2);
    expect(seeds.length).toBeGreaterThanOrEqual(8);
    const mirrored = new Set<boolean>();
    const styles = new Set<string>();
    for (const seed of seeds) {
      const world = new World(seed);
      const v = nearest(world, 'village');
      styles.add(v.biome);
      const sx = (v.tx + v.blueprint.entry.tx) * TILE_PX;
      mirrored.add(v.blueprint.entry.tx !== 6);
      void sx;
      const fill = reachable(world, v);
      expect(fill.count, v.key).toBeGreaterThan(500);
      for (const pr of v.props) {
        if (pr.kind === 'chest_village')
          expect(fill.has(pr.x, pr.y, pr.radius + 5 + 5), `${v.key} chest`).toBe(true);
      }
      for (const a of v.blueprint.actors) {
        const x = (v.tx + a.tx + 0.5) * TILE_PX;
        const y = (v.ty + a.ty + 0.5) * TILE_PX;
        expect(fill.has(x, y, 18), `${v.key} ${a.role}`).toBe(true);
      }
      // The three houses can be entered: their floor is reached.
      const floorTiles = [...v.blueprint.mat].filter(
        (m, i) => m !== 0 && v.blueprint.solid[i] === 0,
      ).length;
      expect(floorTiles).toBeGreaterThan(40);
    }
    expect(mirrored.size).toBe(2);
    expect(styles.size).toBeGreaterThanOrEqual(3);
  });

  it('reaches all four temple chests, also without ever touching the pressure plate', () => {
    const seeds = seedsWith('desert_temple', 2);
    expect(seeds.length).toBeGreaterThanOrEqual(2);
    for (const seed of seeds) {
      const world = new World(seed);
      const t = nearest(world, 'desert_temple');
      const plate = t.props.find((p) => p.kind === 'pressure_plate');
      expect(plate).toBeTruthy();
      if (!plate) continue;
      const chests = t.props.filter((p) => p.kind === 'chest_pyramid');
      expect(chests.length).toBe(4);
      const careful = reachable(world, t, { x: plate.x, y: plate.y, r: 12 + 6 });
      for (const c of chests) {
        expect(careful.has(c.x, c.y, c.radius + 5 + 5), `${t.key} chest ${c.id}`).toBe(true);
        expect(Math.hypot(c.x - plate.x, c.y - plate.y)).toBeGreaterThan(40);
      }
      // The chamber is entered through a door: the tunnel is open and the walls are closed.
      expect(world.collide(t.entryX, t.entryY - 3 * TILE_PX, 5)).toEqual({
        x: t.entryX,
        y: t.entryY - 3 * TILE_PX,
      });
      const far = world.collide((t.tx + 1.5) * TILE_PX, t.cy, 5);
      expect(Math.abs(far.x - (t.tx + 1.5) * TILE_PX)).toBeGreaterThan(0.5);
    }
  });
});

describe('every registered structure (a new def is covered by adding it to the registry)', () => {
  it('has a consistent blueprint, a free entry and reachable chests and actors', () => {
    for (const def of STRUCTURE_DEFS) {
      let checked = 0;
      const biomes = new Set<string>();
      for (let seed = 1; seed <= 160 && checked < 3; seed++) {
        const world = new World(seed);
        const p = world.structures?.nearest(def.id, 0, 0, 40000);
        if (!p || biomes.has(p.biome)) continue;
        biomes.add(p.biome);
        checked++;
        const bp = p.blueprint;
        expect(bp.width, def.id).toBe(def.width);
        expect(bp.height, def.id).toBe(def.height);
        expect(def.spacing).toBeGreaterThan(def.width + 2 * EDGE_MARGIN);
        expect(def.spacing).toBeGreaterThan(def.height + 2 * EDGE_MARGIN);
        const inside = (tx: number, ty: number): boolean =>
          tx >= 0 && ty >= 0 && tx < bp.width && ty < bp.height;
        for (const pr of bp.props) {
          expect(inside(pr.tx, pr.ty), `${def.id} prop ${pr.kind}`).toBe(true);
          if (inside(pr.tx, pr.ty))
            expect(bp.solid[pr.ty * bp.width + pr.tx], `${def.id} ${pr.kind} in a wall`).toBe(0);
        }
        for (const a of bp.actors) {
          expect(inside(a.tx, a.ty), `${def.id} ${a.role}`).toBe(true);
          expect(bp.solid[a.ty * bp.width + a.tx], `${def.id} ${a.role} in a wall`).toBe(0);
        }
        // Gates (the jungle temple's stone door, the trial chamber's copper bars) really seal what is behind
        // them while they stand: the chest or the hall's enemy markers cannot be reached.
        const gates = p.props.filter((pr) => GATE_KINDS.has(pr.kind));
        const gated = gates.length > 0 ? reachable(world, p) : null;
        if (gated) {
          const behind = [
            ...p.props.filter((pr) => pr.kind.startsWith('chest')).map((pr) => [pr.x, pr.y]),
            ...bp.actors.map((a) => [(p.tx + a.tx + 0.5) * TILE_PX, (p.ty + a.ty + 0.5) * TILE_PX]),
          ];
          expect(behind.length, `${p.key} has something behind its gates`).toBeGreaterThan(0);
          for (const [x, y] of behind)
            expect(gated.has(x ?? 0, y ?? 0, 6), `${p.key} gate leaks at ${x},${y}`).toBe(false);
          for (const g of gates) world.removeProp(g);
        }
        const fill = reachable(world, p);
        expect(fill.count, `${p.key} entry`).toBeGreaterThan(100);
        for (const pr of p.props)
          if (pr.kind.startsWith('chest') || pr.kind === 'vault')
            expect(fill.has(pr.x, pr.y, pr.radius + 10), `${p.key} ${pr.id}`).toBe(true);
        for (const a of bp.actors)
          expect(
            fill.has((p.tx + a.tx + 0.5) * TILE_PX, (p.ty + a.ty + 0.5) * TILE_PX, 18),
            `${p.key} ${a.role}`,
          ).toBe(true);
      }
      expect(checked, def.id).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('loot tables', () => {
  const sum = (drops: readonly LootDrop[], kind: LootDrop['kind']): number =>
    drops.reduce((s, d) => s + (d.kind === kind && 'n' in d ? d.n : 0), 0);

  it('the village chest holds 30-60 emeralds, golden apples, an egg and an iron upgrade, always', () => {
    for (let seed = 0; seed < 60; seed++) {
      const d = rollLoot('village_chest', new Rng(seed));
      const n = sum(d, 'emeralds');
      expect(n).toBeGreaterThanOrEqual(30);
      expect(n).toBeLessThanOrEqual(60);
      expect(d).toContainEqual({ kind: 'item', id: 'golden_apple' });
      expect(d.some((x) => x.kind === 'heal')).toBe(true);
      expect(sum(d, 'spawnEgg')).toBe(1);
      expect(d.filter((x) => x.kind === 'ironUpgrade')).toHaveLength(1);
    }
  });

  it('the four temple chests add up to 100+ emeralds, a book, a totem and a diamond', () => {
    for (let seed = 0; seed < 60; seed++) {
      const all = (
        ['pyramid_chest_0', 'pyramid_chest_1', 'pyramid_chest_2', 'pyramid_chest_3'] as const
      ).flatMap((t, i) => rollLoot(t, new Rng(seed * 4 + i)));
      expect(sum(all, 'emeralds')).toBeGreaterThanOrEqual(100);
      expect(sum(all, 'enchantBook')).toBeGreaterThanOrEqual(1);
      expect(all).toContainEqual({ kind: 'item', id: 'totem' });
      expect(sum(all, 'rareSpawnEgg')).toBeGreaterThanOrEqual(1);
    }
    expect(LOOT_TABLE_IDS).toHaveLength(8);
  });

  it('is fixed per chest and world, different between chests and worlds', () => {
    const a = rollLoot('village_chest', chestRng(5, 's:village@1,2:3'));
    expect(rollLoot('village_chest', chestRng(5, 's:village@1,2:3'))).toEqual(a);
    const other = rollLoot('village_chest', chestRng(5, 's:village@9,9:3'));
    const world2 = rollLoot('village_chest', chestRng(6, 's:village@1,2:3'));
    expect([JSON.stringify(other), JSON.stringify(world2)]).not.toContain(JSON.stringify(a));
    expect(chestTable('chest_village', 7)).toBe('village_chest');
    expect(chestTable('chest_pyramid', 6)).toBe('pyramid_chest_2');
    expect(chestIndexFromId('s:desert_temple@5,6:12')).toBe(12);
  });

  it('upgrades to iron, then raises a weapon, then pays emeralds', () => {
    const rng = new Rng(3);
    const base = {
      swordTier: 0,
      armorTier: 0,
      weapons: [{ level: 1 }],
      maxWeaponLevel: MAX_WEAPON_LEVEL,
    };
    const first = resolveIronUpgrade(base, rng);
    expect(['sword', 'armor']).toContain(first.kind);
    expect(resolveIronUpgrade({ ...base, swordTier: 3, armorTier: 0 }, rng)).toEqual({
      kind: 'armor',
      tier: 3,
    });
    expect(resolveIronUpgrade({ ...base, swordTier: 0, armorTier: 4 }, rng)).toEqual({
      kind: 'sword',
      tier: 2,
    });
    expect(resolveIronUpgrade({ ...base, swordTier: 3, armorTier: 4 }, rng)).toEqual({
      kind: 'weapon',
      index: 0,
    });
    expect(
      resolveIronUpgrade(
        { ...base, swordTier: 3, armorTier: 4, weapons: [{ level: MAX_WEAPON_LEVEL }] },
        rng,
      ).kind,
    ).toBe('emeralds');
  });
});

describe('temple trap (pure)', () => {
  const run = (input: (t: number) => { onPlate: boolean; hit: boolean }, seconds: number) => {
    const s = newTrap();
    const log: { t: number; ev: TrapEvent }[] = [];
    for (let i = 0; i < seconds * 60; i++) {
      const t = i / 60;
      for (const ev of stepTrap(s, 1 / 60, input(t))) log.push({ t, ev });
    }
    return { s, log };
  };

  it('stays armed until the plate is stepped on, then burns 1.2 s and fires nine blasts', () => {
    const idle = run(() => ({ onPlate: false, hit: false }), 3);
    expect(idle.log).toEqual([]);
    expect(idle.s.phase).toBe('armed');
    const { s, log } = run((t) => ({ onPlate: t >= 0.5, hit: false }), 4);
    const lit = log.find((e) => e.ev.type === 'lit');
    expect(lit?.t).toBeCloseTo(0.5, 1);
    const booms = log.filter((e) => e.ev.type === 'boom');
    expect(booms).toHaveLength(TNT_COUNT);
    expect((booms[0]?.t ?? 0) - (lit?.t ?? 0)).toBeGreaterThanOrEqual(FUSE_S - 0.05);
    expect((booms[0]?.t ?? 0) - (lit?.t ?? 0)).toBeLessThanOrEqual(FUSE_S + 0.1);
    expect((booms[8]?.t ?? 0) - (booms[0]?.t ?? 0)).toBeCloseTo(8 * BLAST_STAGGER_S, 1);
    expect(log.filter((e) => e.ev.type === 'blip').length).toBeGreaterThanOrEqual(3);
    expect(log.filter((e) => e.ev.type === 'done')).toHaveLength(1);
    expect(s.phase).toBe('done');
    // Nothing happens after the end, even with the hero on the plate.
    expect(stepTrap(s, 1, { onPlate: true, hit: true })).toEqual([]);
  });

  it('is disarmed by a hit while armed and while the fuse burns, but not after the blasts began', () => {
    const early = run((t) => ({ onPlate: false, hit: t > 1 }), 2);
    expect(early.log.map((e) => e.ev.type)).toEqual(['disarmed']);
    const fused = run((t) => ({ onPlate: t >= 0, hit: t > 0.8 }), 3);
    expect(fused.log.map((e) => e.ev.type)).toEqual(['lit', 'blip', 'blip', 'disarmed']);
    expect(fused.log.some((e) => e.ev.type === 'boom')).toBe(false);
    const late = run((t) => ({ onPlate: t >= 0, hit: t > 1.25 }), 3);
    expect(late.log.filter((e) => e.ev.type === 'boom')).toHaveLength(TNT_COUNT);
  });

  it('nine blocks, a lethal 150 and a circle of about 90 px a base-speed hero can just outrun', () => {
    const pts = tntPoints(0, 0);
    expect(pts).toHaveLength(TNT_COUNT);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(TRAP_DAMAGE).toBe(150);
    expect(TRAP_RADIUS).toBeGreaterThan(75);
    expect(TRAP_RADIUS).toBeLessThanOrEqual(95);
    // On the plate: caught. Far enough: safe. The union reaches about the telegraph radius.
    expect(inTrapZone(0, 0, 5, 0, 0)).toBe(true);
    expect(inTrapZone(TRAP_RADIUS + 10, 0, 5, 0, 0)).toBe(false);
    expect(inTrapZone(0, 40, 5, 0, 0)).toBe(true);
    // A hero who steps on at the plate's edge (12 px) and runs straight away at 72 px/s is out in time.
    const speed = 72;
    const travelled = 12 + speed * FUSE_S - 0.1 * speed * 0.5;
    expect(inTrapZone(travelled, 0, 5, 0, 0)).toBe(false);
  });
});

describe('village golem (pure)', () => {
  const rand = (): (() => number) => {
    const r = new Rng(9);
    return () => r.float();
  };

  it('patrols near its post and never leaves it', () => {
    const g = newGolem(500, 500);
    const r = rand();
    let far = 0;
    for (let i = 0; i < 60 * 120; i++) {
      stepGolem(g, 1 / 60, [], r);
      far = Math.max(far, Math.hypot(g.x - 500, g.y - 500));
    }
    expect(far).toBeGreaterThan(5);
    expect(far).toBeLessThan(70);
  });

  it('charges an enemy inside 80 px, hits once, backs off, and ignores far enemies', () => {
    const g = newGolem(0, 0);
    const r = rand();
    const far = [{ id: 1, x: GOLEM_SIGHT + 30, y: 0 }];
    for (let i = 0; i < 120; i++) expect(stepGolem(g, 1 / 60, far, r)).toBeNull();
    expect(g.mode).toBe('patrol');
    const foe = { id: 7, x: 60, y: 0 };
    const hits: number[] = [];
    let tHit = -1;
    for (let i = 0; i < 120 && tHit < 0; i++) {
      const hit = stepGolem(g, 1 / 60, [foe], r);
      if (hit !== null) {
        hits.push(hit);
        tHit = i / 60;
      }
    }
    expect(hits).toEqual([7]);
    expect(tHit).toBeLessThan(0.7); // 120 px/s over ~45 px
    expect(g.mode).toBe('recover');
    // The next hit waits for the cooldown (1.2 s).
    let again = -1;
    for (let i = 0; i < 240 && again < 0; i++)
      if (stepGolem(g, 1 / 60, [foe], r) === 7) again = i / 60;
    expect(again).toBeGreaterThan(0.9);
    expect(GOLEM_DAMAGE).toBe(40);
  });

  it('does not chase beyond its leash', () => {
    const g = newGolem(0, 0);
    g.x = 0;
    const out = { id: 3, x: GOLEM_LEASH + 20, y: 0 };
    g.x = GOLEM_LEASH + 5;
    expect(stepGolem(g, 1 / 60, [out], rand())).toBeNull();
    expect(g.mode).toBe('patrol');
  });
});

/** A run standing at a village with the hero on a given spot. */
function villageRun(seed: number): { run: RunState; v: PlacedStructure } {
  const run = new RunState(seed, 0);
  const v = nearest(run.world, 'village');
  run.player.x = v.entryX;
  run.player.y = v.entryY;
  run.player.snap();
  return { run, v };
}

function step(
  run: RunState,
  seconds: number,
  fn: (dt: number) => void = (dt) => updateInteract(run, dt),
): void {
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n; i++) {
    run.time += 1 / 60;
    fn(1 / 60);
  }
}

describe('structures in a run', () => {
  const SEED = 11; // a desert village; its nearest temple is also close enough to test

  it('opens the village chest on touch: emeralds, golden apple, egg and an iron upgrade, once', () => {
    const { run, v } = villageRun(SEED);
    const chest = v.props.find((p) => p.kind === 'chest_village');
    expect(chest).toBeTruthy();
    if (!chest) return;
    run.player.x = chest.x + 9;
    run.player.y = chest.y;
    const eggs = run.spawnEggs;
    step(run, 0.1);
    expect(run.world.isRemoved(chest)).toBe(true);
    expect(run.emeraldsPicked).toBeGreaterThanOrEqual(30);
    expect(run.item).toBe('golden_apple');
    expect(run.spawnEggs).toBe(eggs + 1);
    expect(run.swordTier >= 2 || run.armorTier >= 3).toBe(true);
    const after = run.emeraldsPicked;
    step(run, 0.2);
    expect(run.emeraldsPicked).toBe(after);
  });

  it('crops heal 8 HP once per plant and regrow after 80 s; a healthy hero eats nothing', () => {
    const { run, v } = villageRun(SEED);
    const crops = v.props.filter((p) => p.kind === 'crop');
    expect(crops.length).toBeGreaterThanOrEqual(8);
    const c = crops[0];
    if (!c) return;
    run.player.x = c.x;
    run.player.y = c.y;
    run.player.hp = run.player.maxHp;
    step(run, 0.1);
    expect(run.world.isRemoved(c)).toBe(false);
    run.player.hp = run.player.maxHp - 30;
    const hp = run.player.hp;
    step(run, 0.05);
    expect(run.player.hp).toBeCloseTo(hp + CROP_HEAL, 1);
    expect(run.world.isRemoved(c)).toBe(true);
    step(run, 1);
    expect(run.player.hp).toBeLessThan(hp + CROP_HEAL + 2); // eaten once: no second helping
    updateStructureInteract(run, CROP_REGROW_S + 1, []);
    expect(run.world.isRemoved(c)).toBe(false);
  });

  it('sells the Blacksmith, Librarian and Cleric services after a moment next to them, and says what is missing', () => {
    const { run, v } = villageRun(SEED);
    // Villagers appear with the hero near.
    updateVillageLife(run, 0.6);
    const roles = ['smith', 'librarian', 'cleric', 'farmer'] as const;
    for (const r of roles)
      expect(
        run.npcs.some((n) => n.kind === r),
        r,
      ).toBe(true);
    const at = (role: (typeof roles)[number]) => {
      const n = run.npcs.find((x) => x.kind === role);
      if (!n) throw new Error(role);
      return n;
    };
    const stand = (role: (typeof roles)[number]): void => {
      const n = at(role);
      run.player.x = n.x;
      run.player.y = n.y + 10;
    };
    const life = (dt: number): void => updateVillageLife(run, dt);
    // Too poor.
    run.emeraldsPicked = 10;
    stand('smith');
    step(run, 1, life);
    expect(run.weapons[0]?.level).toBe(1);
    expect(run.emeraldsPicked).toBe(10);
    expect(run.fx.some((f) => f.text.startsWith('Need'))).toBe(true);
    // Rich: +1 level on the best weapon, twice at most per village.
    run.emeraldsPicked = 500;
    step(run, 1, life);
    expect(run.weapons[0]?.level).toBe(2);
    expect(run.emeraldsPicked).toBe(500 - SERVICE_COST.smith);
    step(run, 3, life);
    expect(run.weapons[0]?.level).toBe(3);
    step(run, 6, life);
    expect(run.weapons[0]?.level).toBe(3);
    // Librarian: one reroll.
    stand('librarian');
    const rerolls = run.rerolls;
    step(run, 4, life);
    expect(run.rerolls).toBe(rerolls + 1);
    step(run, 6, life);
    expect(run.rerolls).toBe(rerolls + 1);
    // Cleric: heals a hurt hero only.
    stand('cleric');
    const gold = run.emeraldsPicked;
    run.player.hp = run.player.maxHp;
    step(run, 2, life);
    expect(run.emeraldsPicked).toBe(gold);
    run.player.hp = run.player.maxHp * 0.3;
    step(run, 2, life);
    expect(run.player.hp).toBeGreaterThan(run.player.maxHp * 0.85);
    expect(run.emeraldsPicked).toBe(gold - SERVICE_COST.cleric);
    // Walking away removes them.
    run.player.x = v.cx + 2000;
    updateVillageLife(run, 0.6);
    expect(run.npcs.some((n) => n.kind === 'smith')).toBe(false);
    expect(
      smithTarget([{ level: 2 }, { level: 4 }, { level: MAX_WEAPON_LEVEL }], MAX_WEAPON_LEVEL),
    ).toBe(1);
    expect(smithTarget([{ level: MAX_WEAPON_LEVEL }], MAX_WEAPON_LEVEL)).toBe(-1);
  });

  it('the Iron Golem defends: spawns near the hero, charges enemies for 40, never touches the hero, leaves when far', () => {
    const { run, v } = villageRun(SEED);
    run.player.x = v.cx;
    run.player.y = v.cy;
    updateVillageGolem(run, 0.6);
    const golems = villageGolems(run);
    expect(golems).toHaveLength(1);
    const g = golems[0]?.g;
    if (!g) return;
    expect(run.npcs.some((n) => n.kind === 'golem')).toBe(true);
    const e = makeEnemy(run, 'zombie', g.x + 55, g.y, false);
    expect(e).toBeTruthy();
    if (!e) return;
    e.hp = e.maxHp = 500;
    run.enemies.push(e);
    const hp = run.player.hp;
    step(run, 1.2, (dt) => updateVillageGolem(run, dt));
    expect(e.hp).toBeLessThanOrEqual(500 - GOLEM_DAMAGE + 1);
    expect(run.player.hp).toBe(hp);
    run.player.x = v.cx + 3000;
    run.enemies.length = 0;
    updateVillageGolem(run, 0.6);
    expect(villageGolems(run)).toHaveLength(0);
    expect(run.npcs.some((n) => n.kind === 'golem')).toBe(false);
  });

  it('updateNpcs wires the villagers and the golem in (and not while a rift is open)', () => {
    const { run, v } = villageRun(SEED);
    run.player.x = v.cx;
    run.player.y = v.cy;
    step(run, 1, (dt) => updateNpcs(run, dt));
    expect(run.npcs.some((n) => n.kind === 'golem')).toBe(true);
    expect(run.npcs.some((n) => n.kind === 'cleric')).toBe(true);
  });

  it('the temple plate lights a telegraphed fuse, then 150 damage; running out, or breaking the plate, saves the hero', () => {
    const seed = seedsWith('desert_temple')[0] ?? 1;
    const setup = (): { run: RunState; plate: PlacedStructure['props'][number] } => {
      const run = new RunState(seed, 0);
      const t = nearest(run.world, 'desert_temple');
      const plate = t.props.find((p) => p.kind === 'pressure_plate');
      if (!plate) throw new Error('no plate');
      run.baseMaxHp = 1000;
      run.recomputeStats();
      run.player.hp = run.player.maxHp;
      run.player.x = plate.x;
      run.player.y = plate.y + 60;
      run.player.snap();
      return { run, plate };
    };
    // Standing on it: telegraph at once, damage after the fuse.
    {
      const { run, plate } = setup();
      step(run, 0.3);
      expect(run.telegraphs).toHaveLength(0);
      run.player.x = plate.x;
      run.player.y = plate.y;
      step(run, 0.5);
      expect(run.telegraphs).toHaveLength(1);
      expect(run.telegraphs[0]?.r).toBe(TRAP_RADIUS);
      expect(run.events).toContain('tnt');
      expect(run.player.hp).toBe(run.player.maxHp);
      step(run, 1);
      expect(run.player.hp).toBeCloseTo(run.player.maxHp - TRAP_DAMAGE, 0);
      step(run, 1);
      expect(run.world.isRemoved(plate)).toBe(true);
    }
    // Running out of the circle during the fuse.
    {
      const { run, plate } = setup();
      run.player.x = plate.x;
      run.player.y = plate.y;
      step(run, 0.1);
      expect(run.telegraphs).toHaveLength(1);
      run.player.x = plate.x + TRAP_RADIUS + 20;
      step(run, 1.6);
      expect(run.player.hp).toBe(run.player.maxHp);
    }
    // A friendly arrow through the plate: disarmed, no telegraph, no blast.
    {
      const { run, plate } = setup();
      const arrow = new Projectile(plate.x + 2, plate.y, 300, 0, 3, 5, 1, true, 1);
      arrow.px = plate.x - 6;
      arrow.py = plate.y;
      run.projectiles.push(arrow);
      step(run, 0.1);
      expect(run.world.isRemoved(plate)).toBe(true);
      expect(run.telegraphs).toHaveLength(0);
      run.player.x = plate.x;
      run.player.y = plate.y;
      step(run, 3);
      expect(run.player.hp).toBe(run.player.maxHp);
    }
    // A melee swing next to it, also while the fuse burns.
    {
      const { run, plate } = setup();
      run.player.x = plate.x;
      run.player.y = plate.y;
      step(run, 0.4);
      expect(run.telegraphs).toHaveLength(1);
      run.player.x = plate.x + 20;
      run.player.swingT = 0.33;
      step(run, 0.05);
      expect(run.telegraphs).toHaveLength(0);
      expect(run.world.isRemoved(plate)).toBe(true);
      step(run, 2);
      expect(run.player.hp).toBe(run.player.maxHp);
    }
  });

  it('never spawns an enemy inside a wall (ringPoint rejects stamped tiles)', () => {
    const { run, v } = villageRun(SEED);
    let found = 0;
    let rejected = 0;
    // The hero walks all over the village and a ring of ground around it, with the spawn ring (a few hundred
    // px) cutting through walls in every direction.
    for (let k = 0; k < 220; k++) {
      run.player.x = v.cx + (((k * 37) % 41) - 20) * 14;
      run.player.y = v.cy + (((k * 53) % 41) - 20) * 14;
      for (let a = 0; a < 24; a++) {
        const pt = ringPoint(run, (a / 24) * Math.PI * 2, 6, false);
        if (!pt) {
          rejected++;
          continue;
        }
        found++;
        // ringPoint accepts a push of up to 3 px, so the centre is at least radius - 3 clear of every wall.
        expect(run.world.structures?.overlapsSolid(pt.x, pt.y, 2.9)).toBe(false);
        expect(run.world.tileAtPx(pt.x, pt.y)).not.toBe(TILE.WALL);
      }
    }
    expect(found).toBeGreaterThan(1000);
    expect(rejected + found).toBe(220 * 24);
  });

  it('opens the pyramid chests with their tables', () => {
    const seed = seedsWith('desert_temple')[0] ?? 1;
    const run = new RunState(seed, 0);
    const t = nearest(run.world, 'desert_temple');
    const chests = t.props.filter((p) => p.kind === 'chest_pyramid');
    for (const c of chests) {
      run.player.x = c.x + 8;
      run.player.y = c.y;
      step(run, 0.05);
      expect(run.world.isRemoved(c)).toBe(true);
    }
    expect(run.emeraldsPicked).toBeGreaterThanOrEqual(100);
    expect(run.bonusOffers).toBeGreaterThanOrEqual(1);
    expect(run.rareSpawnEggs).toBeGreaterThanOrEqual(1);
    expect(
      run.item === 'totem' || run.pendingItem === 'totem' || run.pendingQueue.includes('totem'),
    ).toBe(true);
  });
});

describe('structure budgets', () => {
  it('looks a chunk up in under 1 ms (fresh index, 1600 chunks) and nothing for chunks without structures', () => {
    const idx = new StructureIndex(1337);
    const t0 = performance.now();
    let n = 0;
    for (let cy = -20; cy < 20; cy++)
      for (let cx = -20; cx < 20; cx++) {
        idx.chunk(cx, cy);
        n++;
      }
    const per = (performance.now() - t0) / n;
    console.log(`structure chunk lookup (fresh): ${per.toFixed(3)} ms per chunk`);
    expect(per).toBeLessThan(1);
    const t1 = performance.now();
    for (let cy = -20; cy < 20; cy++) for (let cx = -20; cx < 20; cx++) idx.chunk(cx, cy);
    expect((performance.now() - t1) / n).toBeLessThan(0.1);
  });

  it('bakes chunks with a structure stamp inside the bake budget (best of 5 batches, per chunk)', () => {
    const world = new World(1337);
    const list: [number, number][] = [];
    for (let cy = -20; cy < 20 && list.length < 20; cy++)
      for (let cx = -20; cx < 20 && list.length < 20; cx++)
        if (world.structureOverlay(cx, cy)) list.push([cx, cy]);
    expect(list.length).toBe(20);
    const bake = (cx: number, cy: number): void => {
      const terrain = genTerrain(cx, cy, 1337);
      const biomes = genChunkBiomes(cx, cy, (x, y) => world.biomeIndexAtTile(x, y));
      const ov = world.structureOverlay(cx, cy);
      if (ov) applyOverlay(terrain, ov);
      paintChunk(cx, cy, terrain, biomes, 1337, ov);
    };
    for (const [cx, cy] of list.slice(0, 3)) bake(cx, cy);
    let best = Infinity;
    for (let b = 0; b < 5; b++) {
      const t0 = performance.now();
      for (const [cx, cy] of list) bake(cx, cy);
      best = Math.min(best, (performance.now() - t0) / list.length);
    }
    console.log(`structure chunk bake (20 chunks, best of 5): ${best.toFixed(2)} ms per chunk`);
    expect(best).toBeLessThan(14);
  });

  it('keeps the biome table intact for the structure biomes', () => {
    for (const d of STRUCTURE_DEFS) for (const b of d.allowedBiomes) expect(BIOMES[b]).toBeTruthy();
  });
});
