/** Canvas side of the world: baked chunk images (LRU) with per-tile biomes, y-sorted prop drawing. */
import { BIOMES, type BiomeId, type BiomeState } from './biomes';
import { propSprite, shadowSprite } from './propSprites';
import type { Prop } from './props';
import { CHUNK_PX, CHUNK_TILES, genChunkBiomes, genTerrain } from './terrain';
import { paintChunk } from './tilePaint';
import type { World } from './world';

const MAX_IMAGES = 72;
const MAX_BAKES_PER_FRAME = 4;

export interface PropItem {
  prop: Prop;
  /** Kept for callers that fade props; always 1 now that biomes no longer crossfade. */
  alpha: number;
  biome: BiomeId;
}

function rgb(c: readonly [number, number, number]): string {
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export class WorldRenderer {
  private readonly images = new Map<number, HTMLCanvasElement>();
  private readonly biomeIndexAt: (tx: number, ty: number) => number;
  bakedThisFrame = 0;
  lastBakeMs = 0;
  maxBakeMs = 0;

  constructor(readonly world: World) {
    this.biomeIndexAt = (tx, ty) => world.biomeIndexAtTile(tx, ty);
  }

  beginFrame(): void {
    this.bakedThisFrame = 0;
  }

  get cachedChunks(): number {
    return this.images.size;
  }

  /** Baked image of a chunk (null when this frame's bake budget is spent and `force` is off). */
  chunkImage(cx: number, cy: number, force: boolean): HTMLCanvasElement | null {
    const key = (cx + 32768) * 65536 + (cy + 32768);
    const hit = this.images.get(key);
    if (hit) {
      this.images.delete(key);
      this.images.set(key, hit);
      return hit;
    }
    if (!force && this.bakedThisFrame >= MAX_BAKES_PER_FRAME) return null;
    const t0 = performance.now();
    const terrain = genTerrain(cx, cy, this.world.seed, this.world.arena);
    const biomes = genChunkBiomes(cx, cy, this.biomeIndexAt);
    const canvas = paintChunk(cx, cy, terrain, biomes, this.world.seed).toCanvas();
    this.lastBakeMs = performance.now() - t0;
    this.maxBakeMs = Math.max(this.maxBakeMs, this.lastBakeMs);
    this.bakedThisFrame++;
    this.images.set(key, canvas);
    if (this.images.size > MAX_IMAGES) {
      const oldest = this.images.keys().next().value;
      if (oldest !== undefined) this.images.delete(oldest);
    }
    return canvas;
  }

  /**
   * Draw the terrain under the camera. Biomes are baked into the chunks, so there is no crossfade;
   * `_state` is ignored and only kept so older callers still compile.
   */
  drawGround(
    ctx: CanvasRenderingContext2D,
    camX: number,
    camY: number,
    w: number,
    h: number,
    _state?: BiomeState | null,
    force = false,
  ): void {
    const cx0 = Math.floor(camX / CHUNK_PX);
    const cx1 = Math.floor((camX + w - 1) / CHUNK_PX);
    const cy0 = Math.floor(camY / CHUNK_PX);
    const cy1 = Math.floor((camY + h - 1) / CHUNK_PX);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const dx = cx * CHUNK_PX - camX;
        const dy = cy * CHUNK_PX - camY;
        const img = this.chunkImage(cx, cy, force);
        if (img) {
          ctx.drawImage(img, dx, dy);
        } else {
          // Not baked yet (budget spent): flat fill in the colour of the chunk's centre biome.
          const b = this.world.biomeAtTile(
            cx * CHUNK_TILES + (CHUNK_TILES >> 1),
            cy * CHUNK_TILES + (CHUNK_TILES >> 1),
          );
          ctx.fillStyle = rgb(BIOMES[b].grass[0]);
          ctx.fillRect(dx, dy, CHUNK_PX, CHUNK_PX);
        }
      }
    }
  }

  /** Props on screen (with margin for tall sprites), each drawn with the biome it grew in. */
  collectProps(
    camX: number,
    camY: number,
    w: number,
    h: number,
    _state?: BiomeState | null,
  ): PropItem[] {
    const x0 = camX - 24;
    const x1 = camX + w + 24;
    const y0 = camY - 8;
    const y1 = camY + h + 48;
    return this.world
      .propsInRect(x0, y0, x1, y1)
      .map((prop) => ({ prop, alpha: 1, biome: prop.biome }));
  }

  drawShadow(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    scale: number,
    camX: number,
    camY: number,
  ): void {
    const s = shadowSprite();
    ctx.drawImage(
      s,
      Math.round(x - camX - 12 * scale),
      Math.round(y - camY - 4 * scale),
      24 * scale,
      8 * scale,
    );
  }

  drawProp(ctx: CanvasRenderingContext2D, item: PropItem, camX: number, camY: number): void {
    const { prop } = item;
    const sprite = propSprite(prop.kind, item.biome, prop.variant);
    if (item.alpha < 1) ctx.globalAlpha = item.alpha;
    ctx.drawImage(
      sprite.canvas,
      Math.round(prop.x - camX - sprite.ox),
      Math.round(prop.y - camY - sprite.oy),
    );
    if (item.alpha < 1) ctx.globalAlpha = 1;
  }
}
