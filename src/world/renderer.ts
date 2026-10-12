/**
 * Canvas side of the world: baked chunk images (LRU) with per-tile biomes, animated water and lava
 * redrawn over them, y-sorted prop drawing.
 */
import { PixBuffer } from '../core/pixelart';
import { LIQUID, LIQUID_FRAMES, liquidSet, TEX, TEX_AREA } from './blocks';
import { BIOMES, type BiomeId, type BiomeState } from './biomes';
import { propSprite, shadowSprite } from './propSprites';
import type { Prop } from './props';
import { CHUNK_PX, CHUNK_TILES, genChunkBiomes, genTerrain, TILE_PX } from './terrain';
import { animTiles, LAVA_SHEET, paintChunk } from './tilePaint';
import type { World } from './world';

const MAX_IMAGES = 72;
const MAX_BAKES_PER_FRAME = 4;
/** Animation rates (frames per second) of water and lava. */
const WATER_FPS = 4;
const LAVA_FPS = 3;

/** Liquid sprite sheets (columns = frames, rows = shore masks), shared by every renderer. */
const sheets = new Map<number, HTMLCanvasElement>();

function liquidSheet(id: number): HTMLCanvasElement {
  let c = sheets.get(id);
  if (!c) {
    const set = id === LAVA_SHEET ? liquidSet(LIQUID.LAVA, 0) : liquidSet(LIQUID.WATER, id);
    const buf = new PixBuffer(TEX * LIQUID_FRAMES, TEX * 16);
    for (let mask = 0; mask < 16; mask++) {
      for (let f = 0; f < LIQUID_FRAMES; f++) {
        const off = (mask * LIQUID_FRAMES + f) * TEX_AREA;
        for (let y = 0; y < TEX; y++)
          for (let x = 0; x < TEX; x++)
            buf.data[(mask * TEX + y) * buf.w + f * TEX + x] = set[off + y * TEX + x] ?? 0;
      }
    }
    c = buf.toCanvas();
    sheets.set(id, c);
  }
  return c;
}

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
  /** Animated water/lava tiles of each cached chunk (see tilePaint animTiles), evicted with it. */
  private readonly anims = new Map<number, Uint32Array>();
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
    const anim = animTiles(cx, cy, terrain, biomes, this.world.seed);
    this.lastBakeMs = performance.now() - t0;
    this.maxBakeMs = Math.max(this.maxBakeMs, this.lastBakeMs);
    this.bakedThisFrame++;
    this.images.set(key, canvas);
    if (anim.length > 0) this.anims.set(key, anim);
    if (this.images.size > MAX_IMAGES) {
      const oldest = this.images.keys().next().value;
      if (oldest !== undefined) {
        this.images.delete(oldest);
        this.anims.delete(oldest);
      }
    }
    return canvas;
  }

  /**
   * Redraw the on-screen animated tiles of a chunk drawn at (dx, dy): one drawImage per tile from the
   * liquid sheets, integer frames, each tile offset by its own phase so the water never pulses in unison.
   */
  private drawAnimated(
    ctx: CanvasRenderingContext2D,
    key: number,
    dx: number,
    dy: number,
    w: number,
    h: number,
    animTime: number,
  ): void {
    const list = this.anims.get(key);
    if (!list) return;
    const waterTick = Math.floor(animTime * WATER_FPS);
    const lavaTick = Math.floor(animTime * LAVA_FPS);
    let lastId = -1;
    let sheet: HTMLCanvasElement | null = null;
    for (let i = 0; i < list.length; i++) {
      const e = list[i] ?? 0;
      const x = dx + (e & 15) * TILE_PX;
      const y = dy + ((e >>> 4) & 15) * TILE_PX;
      if (x <= -TILE_PX || y <= -TILE_PX || x >= w || y >= h) continue;
      const id = (e >>> 16) & 255;
      if (id !== lastId) {
        sheet = liquidSheet(id);
        lastId = id;
      }
      if (!sheet) continue;
      const mask = (e >>> 8) & 15;
      const tick = id === LAVA_SHEET ? lavaTick : waterTick;
      const frame = (tick + ((e >>> 12) & 3)) & (LIQUID_FRAMES - 1);
      ctx.drawImage(sheet, frame * TEX, mask * TEX, TEX, TEX, x, y, TEX, TEX);
    }
  }

  /**
   * Draw the terrain under the camera. Biomes are baked into the chunks, so there is no crossfade;
   * `_state` is ignored and only kept so older callers still compile. `animTime` (seconds) drives the
   * water and lava animation.
   */
  drawGround(
    ctx: CanvasRenderingContext2D,
    camX: number,
    camY: number,
    w: number,
    h: number,
    _state?: BiomeState | null,
    force = false,
    animTime = 0,
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
          this.drawAnimated(ctx, (cx + 32768) * 65536 + (cy + 32768), dx, dy, w, h, animTime);
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- legacy crossfade state, ignored
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
