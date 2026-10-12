import type { AnimDef } from './animator';

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

  /** Draw a frame with its feet anchor at (x, y); flip mirrors around the anchor; scale grows it from the feet. */
  draw(
    ctx: CanvasRenderingContext2D,
    key: string,
    x: number,
    y: number,
    flip = false,
    scale = 1,
  ): void {
    const f = this.data.frames[key];
    const page = f ? this.pages[f.page] : undefined;
    if (!f || !page) return;
    if (scale !== 1) {
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      ctx.scale(flip ? -scale : scale, scale);
      ctx.drawImage(page, f.x, f.y, f.w, f.h, -f.ox, -f.oy, f.w, f.h);
      ctx.restore();
      return;
    }
    const dx = Math.round(x);
    const dy = Math.round(y - f.oy);
    if (flip) {
      ctx.save();
      ctx.translate(dx, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(page, f.x, f.y, f.w, f.h, Math.round(-f.w + f.ox), dy, f.w, f.h);
      ctx.restore();
    } else {
      ctx.drawImage(page, f.x, f.y, f.w, f.h, Math.round(dx - f.ox), dy, f.w, f.h);
    }
  }
}
