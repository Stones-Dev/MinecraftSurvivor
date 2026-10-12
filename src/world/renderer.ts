/** Canvas side of the world: baked chunk images (LRU), biome crossfade, y-sorted prop drawing. */
import { BIOMES, type BiomeId, type BiomeState } from './biomes';
import { propSprite, shadowSprite } from './propSprites';
import type { Prop } from './props';
import { CHUNK_PX, genTerrain } from './terrain';
import { paintChunk } from './tilePaint';
import type { World } from './world';

const MAX_IMAGES = 72;
const MAX_BAKES_PER_FRAME = 4;

export interface PropItem {
  prop: Prop;
  alpha: number;
  biome: BiomeId;
}

function rgb(c: readonly [number, number, number]): string {
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export class WorldRenderer {
  private readonly images = new Map<string, HTMLCanvasElement>();
  bakedThisFrame = 0;
  lastBakeMs = 0;
  maxBakeMs = 0;

  constructor(readonly world: World) {}

  beginFrame(): void {
    this.bakedThisFrame = 0;
  }

  get cachedChunks(): number {
    return this.images.size;
  }

  chunkImage(cx: number, cy: number, biome: BiomeId, force: boolean): HTMLCanvasElement | null {
    const key = `${cx},${cy},${biome}`;
    const hit = this.images.get(key);
    if (hit) {
      this.images.delete(key);
      this.images.set(key, hit);
      return hit;
    }
    if (!force && this.bakedThisFrame >= MAX_BAKES_PER_FRAME) return null;
    const t0 = performance.now();
    const terrain = genTerrain(cx, cy, this.world.seed);
    const canvas = paintChunk(cx, cy, terrain, BIOMES[biome], this.world.seed).toCanvas();
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

  /** Draw terrain; during a biome crossfade the old palette is drawn first, the new one on top. */
  drawGround(
    ctx: CanvasRenderingContext2D,
    camX: number,
    camY: number,
    w: number,
    h: number,
    state: BiomeState,
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
        if (state.previous) {
          const old = this.chunkImage(cx, cy, state.previous, force);
          if (old) ctx.drawImage(old, dx, dy);
        }
        const img = this.chunkImage(cx, cy, state.current, force);
        if (!img) {
          ctx.fillStyle = rgb(BIOMES[state.current].grass[0]);
          ctx.fillRect(dx, dy, CHUNK_PX, CHUNK_PX);
        } else if (state.previous) {
          ctx.globalAlpha = state.fade;
          ctx.drawImage(img, dx, dy);
          ctx.globalAlpha = 1;
        } else {
          ctx.drawImage(img, dx, dy);
        }
      }
    }
  }

  /** Props on screen (with margin for tall sprites); crossfades props that differ between biomes. */
  collectProps(camX: number, camY: number, w: number, h: number, state: BiomeState): PropItem[] {
    const x0 = camX - 24;
    const x1 = camX + w + 24;
    const y0 = camY - 8;
    const y1 = camY + h + 48;
    const current = this.world.propsInRect(x0, y0, x1, y1, state.current);
    if (!state.previous) return current.map((prop) => ({ prop, alpha: 1, biome: state.current }));
    const previous = this.world.propsInRect(x0, y0, x1, y1, state.previous);
    const prevById = new Map(previous.map((p) => [p.id, p]));
    const curIds = new Map(current.map((p) => [p.id, p]));
    const out: PropItem[] = [];
    for (const prop of current) {
      const old = prevById.get(prop.id);
      const same = old !== undefined && old.kind === prop.kind && old.variant === prop.variant;
      out.push({ prop, alpha: same ? 1 : state.fade, biome: state.current });
    }
    for (const prop of previous) {
      const cur = curIds.get(prop.id);
      if (!cur || cur.kind !== prop.kind || cur.variant !== prop.variant) {
        out.push({ prop, alpha: 1 - state.fade, biome: state.previous });
      }
    }
    return out;
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
