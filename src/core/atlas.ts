import type { AnimDef } from './animator';
import { columnBottoms, findFeet, type Feet } from './feet';

interface FrameInfo {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  ox: number;
  oy: number;
}

interface AtlasJson {
  version: number;
  pages: string[];
  frames: Record<string, FrameInfo>;
  anims: Record<string, AnimDef>;
}

export class Atlas {
  private constructor(
    private readonly data: AtlasJson,
    private readonly pages: HTMLImageElement[],
  ) {}

  static async load(baseUrl: string): Promise<Atlas> {
    const res = await fetch(`${baseUrl}atlas/atlas.json`);
    if (!res.ok) throw new Error(`Cannot load atlas.json (${res.status})`);
    const data = (await res.json()) as AtlasJson;
    const pages = await Promise.all(
      data.pages.map(
        (name) =>
          new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Cannot load ${name}`));
            img.src = `${baseUrl}atlas/${name}`;
          }),
      ),
    );
    return new Atlas(data, pages);
  }

  anim(id: string): AnimDef {
    const def = this.data.anims[id];
    if (!def) throw new Error(`Unknown animation: ${id}`);
    return def;
  }

  /** Pixel size of a frame, or null when the key is unknown (used to fit portraits into boxes). */
  frameSize(key: string): { w: number; h: number } | null {
    const f = this.data.frames[key];
    return f ? { w: f.w, h: f.h } : null;
  }

  hasAnim(id: string): boolean {
    return id in this.data.anims;
  }

  /**
   * Walk-cycle pose for sprites that only have an idle pose: the lower `legFrac` of the frame (the legs) is
   * shifted sideways by `legDx` px and the upper body is lifted by `lift` px, both whole pixels so the pixel art
   * stays crisp. Feet anchor at (x, y); `flip` mirrors around the anchor.
   */
  drawWalk(
    ctx: CanvasRenderingContext2D,
    key: string,
    x: number,
    y: number,
    flip: boolean,
    legDx: number,
    lift: number,
    legFrac = 0.34,
    offX = 0,
    offY = 0,
  ): void {
    const f = this.data.frames[key];
    const page = f ? this.pages[f.page] : undefined;
    if (!f || !page) return;
    const cut = Math.max(1, Math.min(f.h - 1, Math.round(f.h * legFrac)));
    const upper = f.h - cut;
    const dx = Math.round(x);
    const dy = Math.round(y - f.oy) + offY;
    const draw = (left: number): void => {
      ctx.drawImage(page, f.x, f.y, f.w, upper, left, dy - lift, f.w, upper);
      ctx.drawImage(page, f.x, f.y + upper, f.w, cut, left + legDx, dy + upper, f.w, cut);
    };
    if (flip) {
      ctx.save();
      ctx.translate(dx, 0);
      ctx.scale(-1, 1);
      draw(Math.round(-f.ox + offX));
      ctx.restore();
    } else {
      draw(Math.round(dx - f.ox + offX));
    }
  }

  private readonly tintCache = new Map<string, Map<string, HTMLCanvasElement>>();

  /**
   * Like `draw`, with `color` (css, use a low alpha) washed over the frame's opaque pixels. The tinted copy of
   * each frame is built once and cached per colour.
   */
  drawTinted(
    ctx: CanvasRenderingContext2D,
    key: string,
    x: number,
    y: number,
    flip: boolean,
    scale: number,
    color: string,
  ): void {
    const f = this.data.frames[key];
    const page = f ? this.pages[f.page] : undefined;
    if (!f || !page) return;
    let byKey = this.tintCache.get(color);
    if (!byKey) {
      byKey = new Map();
      this.tintCache.set(color, byKey);
    }
    let c = byKey.get(key);
    if (!c) {
      c = document.createElement('canvas');
      c.width = f.w;
      c.height = f.h;
      const g = c.getContext('2d');
      if (g) {
        g.drawImage(page, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = color;
        g.fillRect(0, 0, f.w, f.h);
      }
      byKey.set(key, c);
    }
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.scale(flip ? -scale : scale, scale);
    ctx.drawImage(c, Math.round(-f.ox), -f.oy);
    ctx.restore();
  }

  private readonly feetCache = new Map<string, Feet | null>();

  /** Where the feet are in a frame (see `core/feet.ts`), read from its pixels once; null without a canvas. */
  feetOf(key: string): Feet | null {
    const hit = this.feetCache.get(key);
    if (hit !== undefined) return hit;
    let feet: Feet | null = null;
    const f = this.data.frames[key];
    const page = f ? this.pages[f.page] : undefined;
    if (f && page && typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = f.w;
      c.height = f.h;
      const g = c.getContext('2d', { willReadFrequently: true });
      if (g) {
        g.drawImage(page, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
        feet = findFeet(columnBottoms(g.getImageData(0, 0, f.w, f.h).data, f.w, f.h), f.ox, f.oy);
      }
    }
    this.feetCache.set(key, feet);
    return feet;
  }

  /**
   * Draw a frame with its feet anchor at (x, y); flip mirrors around the anchor; scale grows it from the feet.
   * `offX`/`offY` shift the sprite in frame space (whole px; +x moves it right when unflipped, left when flipped).
   */
  draw(
    ctx: CanvasRenderingContext2D,
    key: string,
    x: number,
    y: number,
    flip = false,
    scale = 1,
    offX = 0,
    offY = 0,
  ): void {
    const f = this.data.frames[key];
    const page = f ? this.pages[f.page] : undefined;
    if (!f || !page) return;
    if (scale !== 1) {
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      ctx.scale(flip ? -scale : scale, scale);
      ctx.drawImage(page, f.x, f.y, f.w, f.h, -f.ox + offX, -f.oy + offY, f.w, f.h);
      ctx.restore();
      return;
    }
    const dx = Math.round(x);
    const dy = Math.round(y - f.oy) + offY;
    if (flip) {
      // Mirror around the anchor: the anchor column of the frame stays on `dx` (not the frame's centre).
      ctx.save();
      ctx.translate(dx, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(page, f.x, f.y, f.w, f.h, Math.round(-f.ox + offX), dy, f.w, f.h);
      ctx.restore();
    } else {
      ctx.drawImage(page, f.x, f.y, f.w, f.h, Math.round(dx - f.ox + offX), dy, f.w, f.h);
    }
  }
}
