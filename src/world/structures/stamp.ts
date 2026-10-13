/**
 * Structure framework, part 1: the data model and the `Stamp` builder.
 *
 * A structure is a rectangular **blueprint** of tiles that is stamped over the generated terrain at a
 * deterministic site (see ../structures.ts for placement, caching and the World hooks):
 *
 * - `mat` / `solid`: per tile, a ground material (blocks.ts `MAT`) painted instead of the biome's own
 *   ground, and whether the tile is a solid wall (collision for the hero, enemies, allies and enemy
 *   projectiles; pathing treats it as blocked). Tiles left at 0 keep the natural terrain.
 * - `props`: chests, furniture, crops... placed at tile coordinates (they use the normal prop system:
 *   y-sorted sprites, collision radius, `propState`, `world.removeProp`).
 * - `actors`: where NPCs (and later guards) stand. The runtime (systems/structureInteract.ts) spawns
 *   them when the hero comes near and removes them when he leaves.
 * - `entry`: a walkable tile just outside the main door. Tests flood-fill from it to every chest and NPC.
 *
 * How to add a structure (the whole recipe):
 *   1. Add its id to `StructureId` below.
 *   2. Write `src/world/structures/<name>.ts` exporting a `StructureDef` whose `build(ctx)` returns a
 *      Blueprint made with `new Stamp(w, h)` (ASCII rows + a legend, or the rect helpers).
 *   3. Register the def in `src/world/structures/registry.ts`.
 *   4. New materials go in blocks.ts (append to `MAT`/`RECIPES`), new prop kinds in props.ts +
 *      propSprites.ts, interactions in systems/structureInteract.ts (chests/loot: data/lootTables.ts).
 *   5. `tests/structures.test.ts` already walks every registered def (determinism, footprint on dry land,
 *      flood fill to every chest and actor): a new def is covered by adding it to the registry.
 */
import type { BiomeId } from '../biomes';
import { MAT, type MaterialId } from '../blocks';
import type { PropKind } from '../props';

/** Radius (tiles) of the generous zone around the starting meadow, see `StructureDef.nearChance`. */
export const NEAR_SPAWN_TILES = 170;

export type StructureId = 'village' | 'desert_temple';

/** Who stands at an actor marker. 'golem' is the village's iron golem (patrols, defends). */
export type ActorRole = 'smith' | 'cleric' | 'librarian' | 'farmer' | 'golem';

export interface StampProp {
  kind: PropKind;
  /** Tile inside the blueprint. */
  tx: number;
  ty: number;
  /** Feet offset inside the tile, in pixels (default: the tile centre). */
  ox?: number;
  oy?: number;
  /** `type + 8 * shape` like the natural props (crop species, bed colour...). */
  variant?: number;
}

export interface StampActor {
  role: ActorRole;
  tx: number;
  ty: number;
}

export interface Blueprint {
  width: number;
  height: number;
  /** Material id + 1 per tile, row-major (0 = leave the terrain alone). */
  mat: Uint8Array;
  /** 1 where the tile is a solid wall. */
  solid: Uint8Array;
  props: StampProp[];
  actors: StampActor[];
  /** Walkable tile (blueprint coordinates, may lie outside the footprint) in front of the main door. */
  entry: { tx: number; ty: number };
  /** Optional walkable tile inside (debug `?structAt=in` start, screenshots). */
  inside?: { tx: number; ty: number };
}

/** Everything `StructureDef.build` may depend on: the same inputs always give the same blueprint. */
export interface BuildContext {
  seed: number;
  /** Biome at the middle of the footprint (picks the style: wood, sandstone, snow...). */
  biome: BiomeId;
  /** World tile of the blueprint's top-left corner. */
  tx: number;
  ty: number;
  /** Deterministic [0, 1) stream for this instance. */
  rand: () => number;
}

export interface StructureDef {
  id: StructureId;
  name: string;
  /** Footprint in tiles. */
  width: number;
  height: number;
  /** Biomes the footprint's middle and four corners must lie in. */
  allowedBiomes: readonly BiomeId[];
  /** Tiles between the world origin (the starting meadow) and the nearest footprint tile. */
  minDistFromSpawn: number;
  /**
   * Placement grid, in tiles: at most one instance per `spacing` x `spacing` cell, jittered inside it with
   * `EDGE_MARGIN` tiles to spare on every side, so two instances are always at least `2 * EDGE_MARGIN`
   * tiles apart. Must be larger than `width + 2 * EDGE_MARGIN` (and `height`).
   */
  spacing: number;
  /** Probability that a cell tries to host one (the rest of the cells stay empty). */
  chance: number;
  /**
   * Higher probability for cells whose middle is within `NEAR_SPAWN_TILES` of the origin, so a normal
   * 5-15 minute run finds content (optional: defaults to `chance`).
   */
  nearChance?: number;
  /** Lower wins when two structures want the same ground. */
  priority: number;
  /** Natural props (trees, rocks, flowers) within this many tiles of the footprint are removed. */
  clearance: number;
  build(ctx: BuildContext): Blueprint;
  /** Marker colour for the minimap hook (`poiMarkers`). */
  color: string;
}

// ---------------------------------------------------------------------------------------------------
// Overlay encoding (shared by the painter, the collision and the tests)

/** Overlay byte: low 6 bits = material id + 1 (0 = none), bit 6 = solid wall. */
export const OV_MAT_MASK = 63;
export const OV_SOLID = 64;

export function overlayByte(mat: MaterialId, solid: boolean): number {
  return (mat + 1) | (solid ? OV_SOLID : 0);
}

// ---------------------------------------------------------------------------------------------------
// Stamp builder

/** One legend entry of `Stamp.ascii`. Every field is optional: `{}` leaves the terrain as it is. */
export interface Cell {
  mat?: MaterialId;
  solid?: boolean;
  prop?: { kind: PropKind; variant?: number; ox?: number; oy?: number };
  actor?: ActorRole;
}

export class Stamp {
  readonly mat: Uint8Array;
  readonly solid: Uint8Array;
  readonly props: StampProp[] = [];
  readonly actors: StampActor[] = [];
  /** See `Blueprint.entry`; set with `enter()`. */
  entry = { tx: 0, ty: 0 };
  /** See `Blueprint.inside`; set with `within()`. */
  private innerSpot: { tx: number; ty: number } | undefined;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.mat = new Uint8Array(width * height);
    this.solid = new Uint8Array(width * height);
  }

  private inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /** Paint one tile (walkable unless `solid`). Out-of-range tiles are ignored. */
  set(x: number, y: number, mat: MaterialId, solid = false): this {
    if (!this.inside(x, y)) return this;
    this.mat[y * this.width + x] = mat + 1;
    this.solid[y * this.width + x] = solid ? 1 : 0;
    return this;
  }

  /** Walkable floor over a rectangle. */
  floor(x: number, y: number, w: number, h: number, mat: MaterialId): this {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, mat, false);
    return this;
  }

  /** Solid wall block over a rectangle. */
  wall(x: number, y: number, w: number, h: number, mat: MaterialId): this {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, mat, true);
    return this;
  }

  /** Give a tile back to the terrain (a doorway cut through a wall that should show natural ground). */
  clear(x: number, y: number): this {
    if (!this.inside(x, y)) return this;
    this.mat[y * this.width + x] = 0;
    this.solid[y * this.width + x] = 0;
    return this;
  }

  prop(
    kind: PropKind,
    tx: number,
    ty: number,
    opts: Omit<StampProp, 'kind' | 'tx' | 'ty'> = {},
  ): this {
    this.props.push({ kind, tx, ty, ...opts });
    return this;
  }

  actor(role: ActorRole, tx: number, ty: number): this {
    this.actors.push({ role, tx, ty });
    return this;
  }

  /** A walkable tile inside the structure (debug start). */
  within(tx: number, ty: number): this {
    this.innerSpot = { tx, ty };
    return this;
  }

  /** The walkable tile in front of the main door (flood-fill start for tests, debug teleport target). */
  enter(tx: number, ty: number): this {
    this.entry = { tx, ty };
    return this;
  }

  /**
   * Fill from text rows (one character per tile, all rows the same length) and a legend. Characters
   * missing from the legend are an error, so a typo cannot silently leave a hole in a wall.
   */
  ascii(rows: readonly string[], legend: Readonly<Record<string, Cell>>, x0 = 0, y0 = 0): this {
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const ch = row.charAt(i);
        const cell = legend[ch];
        if (!cell) throw new Error(`Stamp.ascii: no legend entry for '${ch}' at ${i},${j}`);
        const x = x0 + i;
        const y = y0 + j;
        if (cell.mat !== undefined) this.set(x, y, cell.mat, cell.solid === true);
        if (cell.prop) this.prop(cell.prop.kind, x, y, cell.prop);
        if (cell.actor) this.actor(cell.actor, x, y);
      }
    });
    return this;
  }

  /** Mirror left-right (variety without a second layout). Props keep their sprite orientation. */
  mirrorX(): this {
    const w = this.width;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < w >> 1; x++) {
        const a = y * w + x;
        const b = y * w + (w - 1 - x);
        [this.mat[a], this.mat[b]] = [this.mat[b] ?? 0, this.mat[a] ?? 0];
        [this.solid[a], this.solid[b]] = [this.solid[b] ?? 0, this.solid[a] ?? 0];
      }
    }
    for (const p of this.props) {
      p.tx = w - 1 - p.tx;
      if (p.ox !== undefined) p.ox = 16 - p.ox;
    }
    for (const a of this.actors) a.tx = w - 1 - a.tx;
    this.entry = { tx: w - 1 - this.entry.tx, ty: this.entry.ty };
    if (this.innerSpot) this.innerSpot = { tx: w - 1 - this.innerSpot.tx, ty: this.innerSpot.ty };
    return this;
  }

  build(): Blueprint {
    return {
      width: this.width,
      height: this.height,
      mat: this.mat,
      solid: this.solid,
      props: this.props,
      actors: this.actors,
      entry: this.entry,
      inside: this.innerSpot,
    };
  }
}

/** Convenience re-export so structure files need a single import for materials. */
export { MAT };
