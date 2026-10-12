/**
 * The live world behind the title and the hub: real baked terrain and props at dusk, a slow camera drift,
 * mobs strolling by (title), cloud shadows and fireflies drifting at their own depth (parallax).
 */
import type { Atlas } from '../core/atlas';
import { frameAt } from '../core/animator';
import { Rng } from '../core/rng';
import { ENEMIES } from '../data/enemies';
import { drawNight } from '../systems/daynight';
import type { BiomeId } from '../world/biomes';
import { WorldRenderer } from '../world/renderer';
import { findBiomeGround, World } from '../world/world';

interface Kind {
  /** Atlas animation prefix (`<id>.walk`). */
  id: string;
  speed: number;
  /** Enemy id whose `faceLeft` flag applies (mob sheets differ in the way they face). */
  enemy?: string;
  scale?: number;
}

const KINDS: readonly Kind[] = [
  { id: 'mob.zombie', speed: 13, enemy: 'zombie' },
  { id: 'mob.skeleton', speed: 17, enemy: 'skeleton' },
  { id: 'mob.creeper', speed: 15, enemy: 'creeper' },
  { id: 'mob.spider', speed: 26, enemy: 'spider' },
  { id: 'mob.husk', speed: 12, enemy: 'husk' },
  { id: 'pet.pig', speed: 11 },
  { id: 'pet.cow', speed: 9 },
  { id: 'pet.sheep_white', speed: 10 },
  { id: 'pet.chicken', speed: 19 },
  { id: 'pet.fox', speed: 28 },
  { id: 'ally.wolf_white', speed: 24 },
];

interface Walker {
  kind: Kind;
  x: number;
  y: number;
  dir: 1 | -1;
  t: number;
}

interface Fly {
  x: number;
  y: number;
  phase: number;
  speed: number;
  /** Parallax depth: how much faster than the ground it slides past. */
  depth: number;
}

export interface SceneFrame {
  camX: number;
  camY: number;
}

export interface SceneOptions {
  atlas: Atlas;
  seed: number;
  biome?: BiomeId;
  /** Strolling mobs (title) and the camera drift amplitude in px (0 = static camera). */
  walkers: number;
  drift: number;
}

export class MenuScene {
  readonly world: World;
  readonly renderer: WorldRenderer;
  /** World position of the spot the hub's hero stands on (feet). */
  readonly stage: { x: number; y: number };
  private time = 0;
  private baked = false;
  private readonly rng: Rng;
  private readonly walkers: Walker[] = [];
  private readonly flies: Fly[] = [];
  private readonly kinds: Kind[];
  private lastW = 0;
  private lastH = 0;

  constructor(private readonly opts: SceneOptions) {
    this.world = new World(opts.seed);
    this.renderer = new WorldRenderer(this.world);
    this.rng = new Rng(opts.seed ^ 0x5eed);
    const spot = opts.biome ? findBiomeGround(this.world, opts.biome) : null;
    this.stage = spot ?? { x: 0, y: 0 };
    this.kinds = KINDS.filter((k) => opts.atlas.hasAnim(`${k.id}.walk`));
    for (let i = 0; i < 18; i++) {
      this.flies.push({
        x: this.rng.range(0, 1),
        y: this.rng.range(0.25, 0.95),
        phase: this.rng.range(0, 6.28),
        speed: this.rng.range(0.4, 1),
        depth: this.rng.range(1.2, 2.4),
      });
    }
  }

  /** Seconds since the scene started. */
  get clock(): number {
    return this.time;
  }

  update(dt: number): void {
    this.time += dt;
    for (const w of this.walkers) {
      w.x += w.kind.speed * w.dir * dt;
      w.t += dt;
    }
  }

  private spawn(camX: number, w: number, first: boolean): Walker | null {
    const kind = this.rng.pick(this.kinds.length > 0 ? this.kinds : KINDS);
    if (!kind) return null;
    const dir: 1 | -1 = this.rng.chance(0.5) ? 1 : -1;
    const lane = this.rng.pick([-4, 6, 16, 26, 36]);
    const x = first
      ? camX + this.rng.range(20, w - 20)
      : dir > 0
        ? camX - 28 - this.rng.range(0, 70)
        : camX + w + 28 + this.rng.range(0, 70);
    return { kind, x, y: this.stage.y + lane, dir, t: this.rng.range(0, 3) };
  }

  /** Camera offset of the slow drift (a gentle sway back and forth). */
  private driftX(): number {
    return Math.round(this.opts.drift * Math.sin(this.time * 0.05));
  }

  /**
   * Draw the world so that the stage spot sits at screen (stageX, stageY). Mobs, props and cloud shadows
   * are depth sorted or layered; the dusk grading is applied last. Returns the camera used.
   */
  render(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    stageX: number,
    stageY: number,
    clearBand: { left: number; right: number; up: number; down: number },
  ): SceneFrame {
    const { atlas } = this.opts;
    const camX = Math.round(this.stage.x - stageX + this.driftX());
    const camY = Math.round(this.stage.y - stageY);
    if (w !== this.lastW || h !== this.lastH) {
      this.lastW = w;
      this.lastH = h;
      this.baked = false;
    }
    this.renderer.beginFrame();
    this.renderer.drawGround(ctx, camX, camY, w, h, null, !this.baked, this.time);
    this.baked = true;

    // Walkers: refill, recycle the ones that left the screen.
    if (this.opts.walkers > 0 && this.walkers.length === 0) {
      for (let i = 0; i < this.opts.walkers; i++) {
        const k = this.spawn(camX, w, true);
        if (k) this.walkers.push(k);
      }
    }
    this.walkers.forEach((k, i) => {
      if (k.x < camX - 110 || k.x > camX + w + 110) {
        const n = this.spawn(camX, w, false);
        if (n) this.walkers[i] = n;
      }
    });

    // Props and walkers in one y-sorted pass.
    type Drawable = { y: number; draw: () => void };
    const list: Drawable[] = [];
    const sx = this.stage.x;
    const sy = this.stage.y;
    for (const item of this.renderer.collectProps(camX, camY, w, h, null)) {
      const p = item.prop;
      const inBand =
        p.x > sx - clearBand.left &&
        p.x < sx + clearBand.right &&
        p.y > sy - clearBand.up &&
        p.y < sy + clearBand.down;
      if (!inBand) list.push({ y: p.y, draw: () => this.renderer.drawProp(ctx, item, camX, camY) });
    }
    for (const k of this.walkers) {
      list.push({
        y: k.y,
        draw: () => {
          const anim = atlas.anim(`${k.kind.id}.walk`);
          const key = frameAt(anim, k.t);
          const left = k.kind.enemy ? ENEMIES[k.kind.enemy]?.faceLeft === true : false;
          this.renderer.drawShadow(ctx, k.x, k.y, 1, camX, camY);
          atlas.draw(ctx, key, k.x - camX, k.y - camY, left ? k.dir > 0 : k.dir < 0, k.kind.scale ?? 1);
        },
      });
    }
    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.draw();
    return { camX, camY };
  }

  /** Cloud shadows and fireflies, drawn over the world in screen space (parallax: faster than the ground). */
  drawAtmosphere(ctx: CanvasRenderingContext2D, w: number, h: number, camX: number): void {
    // Cloud shadows: a few big soft rectangles sliding at 1.7x the camera's speed.
    ctx.fillStyle = 'rgba(8,10,30,0.13)';
    for (let i = 0; i < 4; i++) {
      const cw = 90 + i * 37;
      const span = w + cw * 2;
      const x = ((((i * 211 - camX * 1.7 + this.time * 3) % span) + span) % span) - cw;
      const y = (i * 53 + 20) % Math.max(40, h - 30);
      ctx.fillRect(Math.round(x + 8), Math.round(y), cw - 16, 20);
      ctx.fillRect(Math.round(x), Math.round(y + 6), cw, 12);
      ctx.fillRect(Math.round(x + 14), Math.round(y + 18), cw - 30, 8);
    }
    // Fireflies.
    for (const f of this.flies) {
      const span = w + 40;
      const x = (((f.x * span - camX * f.depth * 0.6 + Math.sin(this.time * f.speed + f.phase) * 9) % span) + span) % span - 20;
      const y = f.y * h + Math.sin(this.time * f.speed * 1.3 + f.phase * 2) * 7;
      const glow = 0.35 + 0.65 * Math.max(0, Math.sin(this.time * 1.7 * f.speed + f.phase));
      ctx.globalAlpha = 0.22 * glow;
      ctx.fillStyle = '#e8ff7a';
      ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
      ctx.globalAlpha = 0.9 * glow;
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  /** Dusk grading: navy tint with a warm glow at the horizon, a vignette on top. */
  drawGrade(ctx: CanvasRenderingContext2D, w: number, h: number, strength = 1): void {
    drawNight(ctx, w, h, 0.85 * strength);
    const glow = ctx.createLinearGradient(0, 0, 0, h);
    glow.addColorStop(0, 'rgba(214,110,70,0)');
    glow.addColorStop(1, `rgba(214,110,70,${(0.22 * strength).toFixed(3)})`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
  }
}
