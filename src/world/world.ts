/** Pure world queries (no DOM): biomes, terrain, props and collision. Rendering lives in renderer.ts. */
import { biomeAtTile, biomeIndexAtTile, findBiome } from './biomeMap';
import { BIOME_INDEX, BIOMES, type BiomeId } from './biomes';
import { genProps, type Prop } from './props';
import { type Arena, CHUNK_PX, TILE, TILE_PX, tileAt } from './terrain';

const MAX_PROP_CHUNKS = 220;
export const WATER_SLOW = 0.6;

export type Surface = 'ground' | 'water' | 'ice' | 'lava' | 'soul';
export const SOUL_SLOW = 0.65;

/** Numeric cache key for a chunk (no string building in the collision hot path). */
function chunkKey(cx: number, cy: number): number {
  return (cx + 32768) * 65536 + (cy + 32768);
}

export class World {
  private readonly propCache = new Map<number, Prop[]>();
  /** Bumped whenever a prop is removed, invalidating the per-prop `gone` cache. */
  private removedVer = 1;

  /**
   * @param fixedBiome Debug/gallery only: pretend every tile belongs to this biome (palettes and props;
   *   the terrain layout still follows the real biome map).
   */
  constructor(
    readonly seed: number,
    readonly arena?: Arena,
    readonly fixedBiome?: BiomeId,
  ) {}

  tileAt(tx: number, ty: number): number {
    return tileAt(tx, ty, this.seed, this.arena);
  }

  tileAtPx(x: number, y: number): number {
    return tileAt(Math.floor(x / TILE_PX), Math.floor(y / TILE_PX), this.seed, this.arena);
  }

  /** Biome of a tile (spatial biome map; Nether in the rift arena). */
  biomeAtTile(tx: number, ty: number): BiomeId {
    return this.fixedBiome ?? biomeAtTile(tx, ty, this.seed, this.arena);
  }

  /** Compact biome index (BIOME_INDEX) of a tile, for painters and typed arrays. */
  biomeIndexAtTile(tx: number, ty: number): number {
    return this.fixedBiome !== undefined
      ? BIOME_INDEX[this.fixedBiome]
      : biomeIndexAtTile(tx, ty, this.seed, this.arena);
  }

  /** Biome at a world pixel position. */
  biomeAtPx(x: number, y: number): BiomeId {
    return this.biomeAtTile(Math.floor(x / TILE_PX), Math.floor(y / TILE_PX));
  }

  /**
   * What the ground is at a point, read with the biome AT THAT POINT (water freezes in the taiga, lava
   * only burns where the biome has lava, sand is soul sand in the Nether). `biome` overrides the local
   * biome (tests, debug).
   */
  surface(x: number, y: number, biome?: BiomeId): Surface {
    const t = this.tileAtPx(x, y);
    if (t === TILE.GRASS) return 'ground';
    const b = biome ?? this.biomeAtPx(x, y);
    if (t === TILE.WATER) return BIOMES[b].iceWater ? 'ice' : 'water';
    if (t === TILE.LAVA && BIOMES[b].lava) return 'lava';
    if (t === TILE.SAND && b === 'nether') return 'soul';
    return 'ground';
  }

  /** Movement multiplier at a ground position (water slows). */
  speedFactor(x: number, y: number, biome?: BiomeId): number {
    const surface = this.surface(x, y, biome);
    return surface === 'water' ? WATER_SLOW : surface === 'soul' ? SOUL_SLOW : 1;
  }

  /** Props destroyed or used up this run, as `id|kind` keys. */
  private readonly removed = new Set<string>();

  isRemoved(p: Prop): boolean {
    if (this.removed.size === 0) return false;
    if (p.chk !== this.removedVer) {
      p.gone = this.removed.has(`${p.id}|${p.kind}`);
      p.chk = this.removedVer;
    }
    return p.gone === true;
  }

  removeProp(p: Prop): void {
    this.removed.add(`${p.id}|${p.kind}`);
    this.removedVer++;
    this.solidCache.clear();
  }

  /**
   * Props of a chunk, each grown for the biome of its own cell. The trailing biome parameter of this and
   * the other prop/collision queries is legacy and ignored: props are a property of the world.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- legacy biome argument, ignored
  chunkProps(cx: number, cy: number, _biome?: BiomeId): Prop[] {
    const key = chunkKey(cx, cy);
    let props = this.propCache.get(key);
    if (!props) {
      props = genProps(cx, cy, this.seed, this.fixedBiome, this.arena);
      this.propCache.set(key, props);
      if (this.propCache.size > MAX_PROP_CHUNKS) {
        const oldest = this.propCache.keys().next().value;
        if (oldest !== undefined) this.propCache.delete(oldest);
      }
    }
    return props;
  }

  /** Props whose feet lie inside the rectangle. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- legacy biome argument, ignored
  propsInRect(x0: number, y0: number, x1: number, y1: number, _biome?: BiomeId): Prop[] {
    const out: Prop[] = [];
    for (let cy = Math.floor(y0 / CHUNK_PX); cy <= Math.floor(y1 / CHUNK_PX); cy++) {
      for (let cx = Math.floor(x0 / CHUNK_PX); cx <= Math.floor(x1 / CHUNK_PX); cx++) {
        for (const p of this.chunkProps(cx, cy)) {
          if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && !this.isRemoved(p)) out.push(p);
        }
      }
    }
    return out;
  }

  private readonly solidCache = new Map<number, Prop[]>();

  /** Solid props of a chunk (cached; the collision hot path iterates these directly). */
  private chunkSolids(cx: number, cy: number): Prop[] {
    const key = chunkKey(cx, cy);
    let solids = this.solidCache.get(key);
    if (!solids) {
      solids = this.chunkProps(cx, cy).filter((p) => p.solid && !this.isRemoved(p));
      this.solidCache.set(key, solids);
      if (this.solidCache.size > MAX_PROP_CHUNKS) {
        const oldest = this.solidCache.keys().next().value;
        if (oldest !== undefined) this.solidCache.delete(oldest);
      }
    }
    return solids;
  }

  /** Does a circle overlap any solid prop? (used for cover against enemy projectiles) */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- legacy biome argument, ignored
  overlapsSolid(x: number, y: number, r: number, _biome?: BiomeId): boolean {
    const reach = r + 8;
    for (
      let cy = Math.floor((y - reach) / CHUNK_PX);
      cy <= Math.floor((y + reach) / CHUNK_PX);
      cy++
    ) {
      for (
        let cx = Math.floor((x - reach) / CHUNK_PX);
        cx <= Math.floor((x + reach) / CHUNK_PX);
        cx++
      ) {
        for (const p of this.chunkSolids(cx, cy)) {
          const dx = x - p.x;
          const dy = y - p.y;
          const min = r + p.radius;
          if (dx * dx + dy * dy < min * min) return true;
        }
      }
    }
    return false;
  }

  /** Keep a circle inside the arena's basalt wall (no-op in the overworld). */
  clampArena(x: number, y: number, r: number): { x: number; y: number } {
    if (!this.arena) return { x, y };
    const max = (this.arena.r - 1) * TILE_PX - r;
    const d = Math.hypot(x, y);
    return d > max ? { x: (x / d) * max, y: (y / d) * max } : { x, y };
  }

  /** Push a circle out of solid props (two passes so corners settle). */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- legacy biome argument, ignored
  collide(x: number, y: number, r: number, _biome?: BiomeId): { x: number; y: number } {
    const reach = r + 8;
    let px = x;
    let py = y;
    if (this.arena) ({ x: px, y: py } = this.clampArena(px, py, r));
    for (let pass = 0; pass < 2; pass++) {
      for (
        let cy = Math.floor((py - reach) / CHUNK_PX);
        cy <= Math.floor((py + reach) / CHUNK_PX);
        cy++
      ) {
        for (
          let cx = Math.floor((px - reach) / CHUNK_PX);
          cx <= Math.floor((px + reach) / CHUNK_PX);
          cx++
        ) {
          for (const p of this.chunkSolids(cx, cy)) {
            const dx = px - p.x;
            const dy = py - p.y;
            const min = r + p.radius;
            const d2 = dx * dx + dy * dy;
            if (d2 >= min * min) continue;
            const d = Math.sqrt(d2);
            if (d < 1e-6) {
              px += min;
            } else {
              px = p.x + (dx / d) * min;
              py = p.y + (dy / d) * min;
            }
          }
        }
      }
    }
    return { x: px, y: py };
  }
}

/**
 * Nearest walkable spot (dry ground, clear of solid props) well inside a biome, searching outward from
 * the origin deterministically. Used by the `?biome=` debug start and by tests.
 */
export function findBiomeGround(
  world: World,
  biome: BiomeId,
  maxTiles = 1500,
): { x: number; y: number } | null {
  const cell =
    findBiome(biome, world.seed, 0, 0, maxTiles, 2) ?? findBiome(biome, world.seed, 0, 0, maxTiles);
  if (!cell) return null;
  for (let r = 0; r <= 6; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = cell.tx + dx;
        const ty = cell.ty + dy;
        if (world.tileAt(tx, ty) !== TILE.GRASS || world.biomeAtTile(tx, ty) !== biome) continue;
        const x = tx * TILE_PX + TILE_PX / 2;
        const y = ty * TILE_PX + TILE_PX / 2;
        if (!world.overlapsSolid(x, y, 8)) return { x, y };
      }
    }
  }
  return { x: cell.tx * TILE_PX + TILE_PX / 2, y: cell.ty * TILE_PX + TILE_PX / 2 };
}
