/** Pure world queries (no DOM): terrain, props and collision. Rendering lives in renderer.ts. */
import type { BiomeId } from './biomes';
import { genProps, type Prop } from './props';
import { CHUNK_PX, TILE, TILE_PX, tileAt } from './terrain';

const MAX_PROP_CHUNKS = 220;
export const WATER_SLOW = 0.6;

export class World {
  private readonly propCache = new Map<string, Prop[]>();

  constructor(readonly seed: number) {}

  tileAt(tx: number, ty: number): number {
    return tileAt(tx, ty, this.seed);
  }

  tileAtPx(x: number, y: number): number {
    return tileAt(Math.floor(x / TILE_PX), Math.floor(y / TILE_PX), this.seed);
  }

  /** Movement multiplier at a ground position (water slows the hero). */
  speedFactor(x: number, y: number): number {
    return this.tileAtPx(x, y) === TILE.WATER ? WATER_SLOW : 1;
  }

  chunkProps(cx: number, cy: number, biome: BiomeId): Prop[] {
    const key = `${cx},${cy},${biome}`;
    let props = this.propCache.get(key);
    if (!props) {
      props = genProps(cx, cy, this.seed, biome);
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
          if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) out.push(p);
        }
      }
    }
    return out;
  }

  /** Push a circle out of solid props (two passes so corners settle). */
  collide(x: number, y: number, r: number, biome: BiomeId): { x: number; y: number } {
    const reach = r + 16;
    const solids = this.propsInRect(x - reach, y - reach, x + reach, y + reach, biome).filter(
      (p) => p.solid,
    );
    let px = x;
    let py = y;
    for (let pass = 0; pass < 2; pass++) {
      for (const p of solids) {
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
    return { x: px, y: py };
  }
}
