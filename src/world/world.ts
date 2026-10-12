/** Pure world queries (no DOM): terrain, props and collision. Rendering lives in renderer.ts. */
import { BIOMES, type BiomeId } from './biomes';
import { genProps, type Prop } from './props';
import { type Arena, CHUNK_PX, TILE, TILE_PX, tileAt } from './terrain';

const MAX_PROP_CHUNKS = 220;
export const WATER_SLOW = 0.6;

export type Surface = 'ground' | 'water' | 'ice' | 'lava' | 'soul';
export const SOUL_SLOW = 0.65;

export class World {
  private readonly propCache = new Map<string, Prop[]>();

  constructor(
    readonly seed: number,
    readonly arena?: Arena,
  ) {}

  tileAt(tx: number, ty: number): number {
    return tileAt(tx, ty, this.seed, this.arena);
  }

  tileAtPx(x: number, y: number): number {
    return tileAt(Math.floor(x / TILE_PX), Math.floor(y / TILE_PX), this.seed, this.arena);
  }

  /** What the ground is at a point in this biome (water freezes in the taiga, lava only in the desert). */
  surface(x: number, y: number, biome: BiomeId): Surface {
    const t = this.tileAtPx(x, y);
    if (t === TILE.WATER) return BIOMES[biome].iceWater ? 'ice' : 'water';
    if (t === TILE.LAVA && BIOMES[biome].lava) return 'lava';
    if (t === TILE.SAND && biome === 'nether') return 'soul';
    return 'ground';
  }

  /** Movement multiplier at a ground position (water slows). */
  speedFactor(x: number, y: number, biome: BiomeId = 'plains'): number {
    const surface = this.surface(x, y, biome);
    return surface === 'water' ? WATER_SLOW : surface === 'soul' ? SOUL_SLOW : 1;
  }

  /** Props destroyed or used up this run, as `id|kind` keys. */
  private readonly removed = new Set<string>();

  isRemoved(p: Prop): boolean {
    return this.removed.size > 0 && this.removed.has(`${p.id}|${p.kind}`);
  }

  removeProp(p: Prop): void {
    this.removed.add(`${p.id}|${p.kind}`);
    this.solidCache.clear();
  }

  chunkProps(cx: number, cy: number, biome: BiomeId): Prop[] {
    const key = `${cx},${cy},${biome}`;
    let props = this.propCache.get(key);
    if (!props) {
      props = genProps(cx, cy, this.seed, biome, this.arena);
      this.propCache.set(key, props);
      if (this.propCache.size > MAX_PROP_CHUNKS) {
        const oldest = this.propCache.keys().next().value;
        if (oldest !== undefined) this.propCache.delete(oldest);
      }
    }
    return props;
  }

  /** Props whose feet lie inside the rectangle. */
  propsInRect(x0: number, y0: number, x1: number, y1: number, biome: BiomeId): Prop[] {
    const out: Prop[] = [];
    for (let cy = Math.floor(y0 / CHUNK_PX); cy <= Math.floor(y1 / CHUNK_PX); cy++) {
      for (let cx = Math.floor(x0 / CHUNK_PX); cx <= Math.floor(x1 / CHUNK_PX); cx++) {
        for (const p of this.chunkProps(cx, cy, biome)) {
          if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && !this.isRemoved(p)) out.push(p);
        }
      }
    }
    return out;
  }

  private readonly solidCache = new Map<string, Prop[]>();

  /** Solid props of a chunk (cached; the collision hot path iterates these directly). */
  private chunkSolids(cx: number, cy: number, biome: BiomeId): Prop[] {
    const key = `${cx},${cy},${biome}`;
    let solids = this.solidCache.get(key);
    if (!solids) {
      solids = this.chunkProps(cx, cy, biome).filter((p) => p.solid && !this.isRemoved(p));
      this.solidCache.set(key, solids);
      if (this.solidCache.size > MAX_PROP_CHUNKS) {
        const oldest = this.solidCache.keys().next().value;
        if (oldest !== undefined) this.solidCache.delete(oldest);
      }
    }
    return solids;
  }

  /** Does a circle overlap any solid prop? (used for cover against enemy projectiles) */
  overlapsSolid(x: number, y: number, r: number, biome: BiomeId): boolean {
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
        for (const p of this.chunkSolids(cx, cy, biome)) {
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
  collide(x: number, y: number, r: number, biome: BiomeId): { x: number; y: number } {
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
          for (const p of this.chunkSolids(cx, cy, biome)) {
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
