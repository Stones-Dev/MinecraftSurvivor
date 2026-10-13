/** Pure world queries (no DOM): biomes, terrain, props and collision. Rendering lives in renderer.ts. */
import { biomeAtTile, biomeIndexAtTile, findBiome } from './biomeMap';
import { BIOME_INDEX, BIOMES, type BiomeId } from './biomes';
import { genProps, type Prop } from './props';
import { OV_SOLID, StructureIndex } from './structures';
import { type Arena, CHUNK_PX, TILE, TILE_PX, tileAt } from './terrain';

const MAX_PROP_CHUNKS = 220;
export const WATER_SLOW = 0.6;

export type Surface = 'ground' | 'water' | 'ice' | 'lava' | 'soul';
export const SOUL_SLOW = 0.65;

/** Numeric cache key for a chunk (no string building in the collision hot path). */
function chunkKey(cx: number, cy: number): number {
  return (cx + 32768) * 65536 + (cy + 32768);
}

/** A solid disc that is not a prop (the End's obsidian pillars): see `World.solids`. */
export interface SolidDisc {
  x: number;
  y: number;
  r: number;
}

export class World {
  private readonly propCache = new Map<number, Prop[]>();
  /** Extra solid discs (End pillars): the hero, companions and ground foes collide with them. */
  solids: SolidDisc[] = [];
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
  ) {
    // Villages, temples... (world/structures.ts): overworld only, and not with a debug-fixed biome.
    this.structures = arena || fixedBiome !== undefined ? null : new StructureIndex(seed);
  }

  /** Placed structures of this world (null in arenas and gallery worlds). */
  readonly structures: StructureIndex | null;

  /** Terrain code of a tile; solid structure tiles read as TILE.WALL, structure floors as TILE.GRASS. */
  tileAt(tx: number, ty: number): number {
    if (this.structures) {
      const ov = this.structures.overlayAt(tx, ty);
      if (ov !== 0) return (ov & OV_SOLID) !== 0 ? TILE.WALL : TILE.GRASS;
    }
    return tileAt(tx, ty, this.seed, this.arena);
  }

  tileAtPx(x: number, y: number): number {
    return this.tileAt(Math.floor(x / TILE_PX), Math.floor(y / TILE_PX));
  }

  /** Structure overlay of a chunk with a 1-tile border (renderer / painter), or null. */
  structureOverlay(cx: number, cy: number): Uint8Array | null {
    return this.structures?.chunk(cx, cy)?.overlay ?? null;
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

  /** Bring a removed prop back (regrowing crops). */
  restoreProp(p: Prop): void {
    if (!this.removed.delete(`${p.id}|${p.kind}`)) return;
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
      // The End grows nothing: its pillars are `solids`, drawn by the End renderer.
      props =
        this.arena?.kind === 'end' ? [] : genProps(cx, cy, this.seed, this.fixedBiome, this.arena);
      const cs = this.structures?.chunk(cx, cy);
      if (cs) {
        // Structures clear the natural props around them and bring their own (chests, furniture, crops).
        const idx = this.structures;
        props = props.filter((p) => !idx?.isCleared(cs, p.x, p.y)).concat(cs.props);
      }
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
    if (this.structures?.overlapsSolid(x, y, r)) return true;
    for (const d of this.solids) {
      const dx = x - d.x;
      const dy = y - d.y;
      const min = r + d.r;
      if (dx * dx + dy * dy < min * min) return true;
    }
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

  /**
   * `collide` for a move or a teleport from (x0, y0) to (x1, y1): walks the segment in steps of at most
   * SWEEP_STEP_PX and stops at the last position before a solid structure tile, so a thin wall cannot be
   * jumped. Props and water are crossed exactly as `collide` alone would (only the destination is pushed out
   * of props); the arena wall is convex, so the final `collide` keeps the result inside it. Returns a fresh
   * object.
   */
  collideSwept(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    r: number,
  ): { x: number; y: number } {
    const st = this.structures;
    let ex = x1;
    let ey = y1;
    if (st) {
      const dx = x1 - x0;
      const dy = y1 - y0;
      const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / SWEEP_STEP_PX));
      let lx = x0;
      let ly = y0;
      for (let i = 1; i <= n; i++) {
        const px = x0 + (dx * i) / n;
        const py = y0 + (dy * i) / n;
        // A hair smaller than `r`: a hero hugging a wall sits exactly `r` from it.
        if (st.overlapsSolid(px, py, r - 0.05)) {
          ex = lx;
          ey = ly;
          break;
        }
        lx = px;
        ly = py;
      }
    }
    const c = this.collide(ex, ey, r);
    return { x: c.x, y: c.y };
  }

  /** Push a circle out of solid props (two passes so corners settle). */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- legacy biome argument, ignored
  collide(x: number, y: number, r: number, _biome?: BiomeId): { x: number; y: number } {
    const reach = r + 8;
    let px = x;
    let py = y;
    if (this.arena) ({ x: px, y: py } = this.clampArena(px, py, r));
    if (this.structures) {
      // Walls first (tile collision); props then settle the result as before.
      const w = this.structures.collide(px, py, r);
      px = w.x;
      py = w.y;
    }
    for (let pass = 0; pass < 2; pass++) {
      for (const d of this.solids) {
        const dx = px - d.x;
        const dy = py - d.y;
        const min = r + d.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        const dd = Math.sqrt(d2);
        if (dd < 1e-6) {
          px += min;
        } else {
          px = d.x + (dx / dd) * min;
          py = d.y + (dy / dd) * min;
        }
      }
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
    if (this.structures) {
      // A prop next to a wall must not push the circle back into it.
      const w = this.structures.collide(px, py, r);
      return { x: w.x, y: w.y };
    }
    return { x: px, y: py };
  }
}

/** Longest sub-step of a swept move: a quarter of a tile, so a 1-tile wall can never be stepped over. */
export const SWEEP_STEP_PX = 4;

/**
 * Nearest walkable spot (dry ground, clear of solid props) inside a biome, searching outward from the origin
 * deterministically. Used by the `?biome=` debug start and by tests. Biomes with big lakes (swamp, snowy
 * taiga, mushroom fields) can have water at the cell centre, so the search widens in tiers: grass of the
 * biome, then grass or sand of the biome, then any dry grass or sand nearby, then null.
 */
export function findBiomeGround(
  world: World,
  biome: BiomeId,
  maxTiles = 1500,
): { x: number; y: number } | null {
  const cell =
    findBiome(biome, world.seed, 0, 0, maxTiles, 2) ?? findBiome(biome, world.seed, 0, 0, maxTiles);
  if (!cell) return null;
  const dry = (tx: number, ty: number, sandOk: boolean): boolean => {
    const t = world.tileAt(tx, ty);
    return t === TILE.GRASS || (sandOk && t === TILE.SAND);
  };
  const tiers: ((tx: number, ty: number) => boolean)[] = [
    (tx, ty) => dry(tx, ty, false) && world.biomeAtTile(tx, ty) === biome,
    (tx, ty) => dry(tx, ty, true) && world.biomeAtTile(tx, ty) === biome,
    (tx, ty) => dry(tx, ty, true),
  ];
  for (const accept of tiers) {
    for (let r = 0; r <= 40; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const tx = cell.tx + dx;
          const ty = cell.ty + dy;
          if (!accept(tx, ty)) continue;
          // Never start inside (or hugging) a village, temple, trial hall...: the hero could be sealed in.
          if (
            world.structures &&
            world.structures.inTileRect(tx - 3, ty - 3, tx + 3, ty + 3).length > 0
          )
            continue;
          const x = tx * TILE_PX + TILE_PX / 2;
          const y = ty * TILE_PX + TILE_PX / 2;
          if (!world.overlapsSolid(x, y, 8)) return { x, y };
        }
      }
    }
  }
  return null;
}
