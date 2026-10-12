/**
 * Biome ambience: a small pool of drifting specks drawn over the world in screen space (cherry
 * petals, snowfall, desert dust, forest leaves, jungle pollen, mushroom spores, swamp and night
 * fireflies, Nether embers). A fixed pool of slots is reused forever, so nothing allocates per frame
 * and the cost is bounded by the quality tier (at most ~100 one-to-three pixel rects).
 *
 * Specks live in screen space and follow the camera at 60%, which reads as "in the air of the world"
 * without ever leaving the view. A slot picks its kind when it (re)spawns from the biome under the
 * hero, so crossing a border blends by itself: old specks finish their short life while new ones
 * of the new biome appear.
 */
import { BIOMES, type Ambient, type BiomeId } from '../world/biomes';

export type AmbientKind = Exclude<Ambient, 'none'>;

/** Slots per quality tier (low, medium, high). */
export const AMBIENT_SLOTS = [28, 56, 96] as const;

/** Fraction of the pool a kind may occupy (a thin dust haze versus a snowstorm). */
export const AMBIENT_DENSITY: Readonly<Record<AmbientKind, number>> = {
  snow: 0.85,
  petals: 0.45,
  fireflies: 0.3,
  dust: 0.5,
  spores: 0.4,
  leaves: 0.22,
  pollen: 0.35,
  embers: 0.5,
};

/** Night level above which forests and swamps light up with fireflies. */
export const FIREFLY_NIGHT = 0.45;

/**
 * Which kind of speck a biome spawns right now (`r` is a uniform [0, 1) number, `night` is the 0..1
 * night factor), or null for none. Pure; exported for tests.
 */
export function pickAmbient(biome: BiomeId, night: number, r: number): AmbientKind | null {
  switch (biome) {
    case 'plains':
      return null;
    case 'forest':
    case 'dark_forest':
      return night > FIREFLY_NIGHT ? 'fireflies' : 'leaves';
    case 'swamp':
      // Fireflies after dusk, drifting green spores by day.
      return night > FIREFLY_NIGHT ? 'fireflies' : 'spores';
    case 'jungle':
      if (night > FIREFLY_NIGHT && r < 0.4) return 'fireflies';
      return r < 0.55 ? 'leaves' : 'pollen';
    case 'snowy_taiga':
      return 'snow';
    case 'desert':
    case 'badlands':
      return 'dust';
    case 'cherry_grove':
      return 'petals';
    case 'mushroom_fields':
      return 'spores';
    case 'nether':
      return 'embers';
  }
}

// --- colours -----------------------------------------------------------------------------------

const rgb = (c: readonly number[]): string => `rgb(${c[0] ?? 0},${c[1] ?? 0},${c[2] ?? 0})`;
const lighten = (c: readonly number[], k: number): string =>
  rgb([0, 1, 2].map((i) => Math.min(255, Math.round((c[i] ?? 0) + (255 - (c[i] ?? 0)) * k))));

const PALETTE: Record<string, readonly string[]> = {
  snow: ['#ffffff', '#ecf4ff', '#d8e8ff'],
  petals: ['#ffb7d5', '#ff9ec4', '#ffd0e4', '#f58ab8'],
  fireflies: ['#e8ff7a', '#b6ff5a', '#fff3a0'],
  spores: ['#c58bff', '#ff8bd0', '#8be0ff'],
  swampSpores: ['#9fd05a', '#b8e070', '#7fb04a'],
  pollen: ['#fff6a0', '#e6ff9a', '#ffd860'],
  embers: ['#ff9a2a', '#ffd24a', '#ff5a1a'],
};

/** Leaf and dust colours come from the biome's own palette so each region looks like itself. */
function biomeColours(kind: AmbientKind, biome: BiomeId): readonly string[] {
  const b = BIOMES[biome];
  if (kind === 'leaves') return [rgb(b.leaves[0]), rgb(b.leaves[1]), rgb(b.leaves[2])];
  if (kind === 'dust') return [lighten(b.sand[0], 0.1), rgb(b.sand[0]), lighten(b.sand[1], 0.25)];
  if (kind === 'spores' && biome === 'swamp') return PALETTE['swampSpores'] ?? [];
  return PALETTE[kind] ?? ['#fff'];
}

const colourCache = new Map<string, readonly string[]>();
function coloursFor(kind: AmbientKind, biome: BiomeId): readonly string[] {
  const key = `${kind}/${biome}`;
  let c = colourCache.get(key);
  if (!c) {
    c = biomeColours(kind, biome);
    colourCache.set(key, c);
  }
  return c;
}

// --- the pool ----------------------------------------------------------------------------------

class Speck {
  alive = false;
  kind: AmbientKind = 'snow';
  colour = '#fff';
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  age = 0;
  life = 1;
  phase = 0;
  size = 1;
  /** Seconds until an idle slot tries to spawn again. */
  idle = 0;
}

/** Small LCG: specks do not need the run's seeded streams, only cheap non-repeating noise. */
class Noise {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 1;
  }
  next(): number {
    this.s = (Math.imul(this.s, 1664525) + 1013904223) >>> 0;
    return this.s / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
}

/** How much of the camera's motion carries the specks (1 = fixed to the world, 0 = fixed to the screen). */
const FOLLOW = 0.6;
const MARGIN = 10;

export class AmbientField {
  private readonly specks: Speck[] = [];
  private readonly rng: Noise;
  private lastCamX = Number.NaN;
  private lastCamY = Number.NaN;
  private warm = 1.5;
  private w = 320;
  private h = 180;
  /** The biome whose specks are being spawned (colours for new specks). */
  private biome: BiomeId = 'plains';

  constructor(seed = 7) {
    this.rng = new Noise(seed);
    for (let i = 0; i < AMBIENT_SLOTS[2]; i++) this.specks.push(new Speck());
  }

  /** Specks currently alive (tests and the debug overlay). */
  activeCount(): number {
    let n = 0;
    for (const s of this.specks) if (s.alive) n++;
    return n;
  }

  private spawn(s: Speck, kind: AmbientKind, anywhere: boolean): void {
    const r = this.rng;
    const cols = coloursFor(kind, this.biome);
    s.kind = kind;
    s.colour = cols[Math.floor(r.next() * cols.length)] ?? '#fff';
    s.alive = true;
    s.age = 0;
    s.phase = r.range(0, 6.283);
    s.size = 1;
    const w = this.w;
    const h = this.h;
    s.x = r.range(-MARGIN, w + MARGIN);
    s.y = r.range(-MARGIN, h + MARGIN);
    switch (kind) {
      case 'snow':
        s.life = r.range(4, 8);
        s.vx = r.range(-4, 8);
        s.vy = r.range(22, 42);
        s.size = r.next() < 0.3 ? 2 : 1;
        if (!anywhere) s.y = -4;
        break;
      case 'petals':
        s.life = r.range(5, 9);
        s.vx = r.range(6, 14);
        s.vy = r.range(9, 18);
        s.size = 2;
        if (!anywhere) s.y = -4;
        break;
      case 'leaves':
        s.life = r.range(5, 9);
        s.vx = r.range(8, 20);
        s.vy = r.range(10, 22);
        s.size = 2;
        if (!anywhere) s.y = -4;
        break;
      case 'dust':
        s.life = r.range(2.5, 4.5);
        s.vx = r.range(26, 58);
        s.vy = r.range(-4, 5);
        s.size = 2;
        if (!anywhere) s.x = -6;
        break;
      case 'fireflies':
        s.life = r.range(5, 9);
        s.vx = 0;
        s.vy = 0;
        break;
      case 'spores':
        s.life = r.range(4, 8);
        s.vx = r.range(-3, 3);
        s.vy = r.range(-9, -3);
        s.size = r.next() < 0.35 ? 2 : 1;
        if (!anywhere) s.y = h + 4;
        break;
      case 'pollen':
        s.life = r.range(5, 9);
        s.vx = r.range(3, 9);
        s.vy = r.range(-3, 3);
        break;
      case 'embers':
        s.life = r.range(1.6, 3);
        s.vx = r.range(-6, 6);
        s.vy = r.range(-30, -14);
        s.size = r.next() < 0.35 ? 2 : 1;
        if (!anywhere) s.y = h + 4;
        break;
    }
  }

  /**
   * Advance the specks. `night` is the 0..1 night factor, `quality` the run's tier, `still` freezes the
   * sway/pulse maths for "reduce flashing" (the specks still drift).
   */
  update(
    dt: number,
    biome: BiomeId,
    night: number,
    camX: number,
    camY: number,
    w: number,
    h: number,
    quality: 0 | 1 | 2,
  ): void {
    this.w = w;
    this.h = h;
    this.biome = biome;
    let dx = 0;
    let dy = 0;
    if (!Number.isNaN(this.lastCamX)) {
      // A teleport (rift, ender pearl) must not fling the specks.
      dx = Math.max(-12, Math.min(12, camX - this.lastCamX)) * FOLLOW;
      dy = Math.max(-12, Math.min(12, camY - this.lastCamY)) * FOLLOW;
    }
    this.lastCamX = camX;
    this.lastCamY = camY;
    this.warm = Math.max(0, this.warm - dt);
    const slots = AMBIENT_SLOTS[quality];
    const rng = this.rng;
    // Spawns per frame are capped so a new biome fades in instead of popping.
    let budget = this.warm > 0 ? 16 : 3;
    for (let i = 0; i < this.specks.length; i++) {
      const s = this.specks[i];
      if (!s) continue;
      if (i >= slots) {
        s.alive = false;
        continue;
      }
      if (s.alive) {
        s.age += dt;
        if (s.age >= s.life) s.alive = false;
      }
      if (!s.alive) {
        s.idle -= dt;
        if (s.idle > 0 || budget <= 0) continue;
        s.idle = rng.range(0.1, 0.5);
        const kind = pickAmbient(biome, night, rng.next());
        if (!kind || i >= slots * AMBIENT_DENSITY[kind]) {
          s.idle = rng.range(0.4, 1);
          continue;
        }
        budget--;
        this.spawn(s, kind, this.warm > 0 || kind === 'fireflies' || kind === 'pollen');
        continue;
      }
      const a = s.age + s.phase;
      switch (s.kind) {
        case 'snow':
          s.x += (s.vx + Math.sin(a * 1.6) * 7) * dt;
          s.y += s.vy * dt;
          break;
        case 'petals':
          s.x += (s.vx + Math.sin(a * 1.3) * 16) * dt;
          s.y += (s.vy + Math.cos(a * 1.7) * 5) * dt;
          break;
        case 'leaves':
          s.x += (s.vx + Math.sin(a * 1.9) * 12) * dt;
          s.y += (s.vy + Math.cos(a * 2.3) * 6) * dt;
          break;
        case 'dust':
          s.x += s.vx * dt;
          s.y += (s.vy + Math.sin(a * 2.2) * 5) * dt;
          break;
        case 'fireflies':
          s.x += Math.sin(a * 0.8) * 9 * dt + Math.sin(a * 2.9) * 3 * dt;
          s.y += Math.cos(a * 1.1) * 6 * dt;
          break;
        case 'spores':
          s.x += (s.vx + Math.sin(a * 1.4) * 5) * dt;
          s.y += s.vy * dt;
          break;
        case 'pollen':
          s.x += (s.vx + Math.sin(a * 1.1) * 5) * dt;
          s.y += (s.vy + Math.cos(a * 0.9) * 4) * dt;
          break;
        case 'embers':
          s.x += (s.vx + Math.sin(a * 5) * 8) * dt;
          s.y += s.vy * dt;
          break;
      }
      s.x -= dx;
      s.y -= dy;
      // Wrap instead of respawning, so the haze keeps its density while the camera runs.
      if (s.x < -MARGIN) s.x += w + 2 * MARGIN;
      else if (s.x > w + MARGIN) s.x -= w + 2 * MARGIN;
      if (s.y < -MARGIN) s.y += h + 2 * MARGIN;
      else if (s.y > h + MARGIN) s.y -= h + 2 * MARGIN;
    }
  }

  draw(ctx: CanvasRenderingContext2D, reduceFlash: boolean): void {
    let colour = '';
    for (const s of this.specks) {
      if (!s.alive) continue;
      const k = s.age / s.life;
      // Fade in over the first 15% and out over the last 25% of the life.
      let alpha = Math.min(1, k / 0.15, (1 - k) / 0.25);
      if (alpha <= 0.02) continue;
      const x = Math.round(s.x);
      const y = Math.round(s.y);
      if (s.kind === 'fireflies') {
        const pulse = reduceFlash ? 0.8 : 0.5 + 0.5 * Math.sin((s.age + s.phase) * 2.6);
        alpha *= 0.25 + 0.75 * pulse;
        if (s.colour !== colour) {
          ctx.fillStyle = s.colour;
          colour = s.colour;
        }
        ctx.globalAlpha = alpha * 0.28;
        ctx.fillRect(x - 1, y - 1, 3, 3);
        ctx.globalAlpha = Math.min(1, alpha * 1.3);
        ctx.fillRect(x, y, 1, 1);
        continue;
      }
      if (s.colour !== colour) {
        ctx.fillStyle = s.colour;
        colour = s.colour;
      }
      switch (s.kind) {
        case 'snow':
          ctx.globalAlpha = alpha * 0.9;
          ctx.fillRect(x, y, s.size, s.size);
          break;
        case 'dust':
          ctx.globalAlpha = alpha * 0.32;
          ctx.fillRect(x, y, 3, 1);
          break;
        case 'embers': {
          const flick = reduceFlash ? 1 : 0.6 + 0.4 * Math.sin((s.age + s.phase) * 18);
          ctx.globalAlpha = alpha * flick;
          ctx.fillRect(x, y, s.size, s.size);
          break;
        }
        case 'spores': {
          ctx.globalAlpha = alpha * 0.7;
          ctx.fillRect(x, y, s.size, s.size);
          break;
        }
        case 'pollen':
          ctx.globalAlpha = alpha * 0.6;
          ctx.fillRect(x, y, 1, 1);
          break;
        default:
          // petals and leaves: a 2x2 flake that flips to 2x1 as it tumbles.
          ctx.globalAlpha = alpha * 0.9;
          ctx.fillRect(x, y, 2, Math.sin((s.age + s.phase) * 3) > 0.2 ? 1 : 2);
          break;
      }
    }
    ctx.globalAlpha = 1;
  }
}
