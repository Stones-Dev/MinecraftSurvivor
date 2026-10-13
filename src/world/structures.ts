/**
 * World structures (v1.4): deterministic, seeded placement of villages, temples... on a coarse grid, and the
 * queries the rest of the game needs. The data model, the `Stamp` builder and the "how to add a structure"
 * recipe live in ./structures/stamp.ts; the defs in ./structures/*.ts; the list in ./structures/registry.ts.
 *
 * Placement (pure function of the seed, no state but caches):
 * - every structure def has its own grid of `spacing` x `spacing` tile cells; a cell hosts at most one
 *   instance, with probability `chance`, jittered inside the cell (EDGE_MARGIN tiles to spare) by
 *   hash(seed, cell, def), up to ATTEMPTS jitters until one site is valid;
 * - a site is valid when the footprint keeps `minDistFromSpawn` tiles from the origin, its middle and
 *   corners lie in the def's biomes, no tile within 2 of the footprint is water or lava, and it does not
 *   touch an instance of a def with a smaller `priority` (evaluated first, so there is no cycle);
 * - blueprints are built once per site (`def.build`), props get stable ids `s:<key>:<n>`.
 *
 * The World owns one `StructureIndex` per overworld (null in arenas and with a fixed debug biome) and hooks
 * it into `tileAt`, `collide`, `overlapsSolid`, `chunkProps` and the chunk painter. Chunks without any
 * structure cost a single Map lookup everywhere (see tests/structures.test.ts for the budgets).
 */
import { hash2 } from '../core/noise';
import { biomeAtTile } from './biomeMap';
import type { BiomeId } from './biomes';
import type { MaterialId } from './blocks';
import { type Prop, propRadius } from './props';
import { CHUNK_TILES, TILE, TILE_PX, tileAt } from './terrain';
import { STRUCTURE_DEFS } from './structures/registry';
import {
  type Blueprint,
  NEAR_SPAWN_TILES,
  OV_SOLID,
  type StructureDef,
  type StructureId,
  overlayByte,
} from './structures/stamp';
import type { World } from './world';

export { OV_MAT_MASK, OV_SOLID } from './structures/stamp';
export type { Blueprint, StructureDef, StructureId } from './structures/stamp';

/** Tiles kept free between a footprint and the edge of its grid cell (instances are >= 2x this apart). */
export const EDGE_MARGIN = 4;
const ATTEMPTS = 3;
/** Tiles around a footprint that must be dry (water would lap at the walls). */
const DRY_MARGIN = 2;
/** Tiles of free ground kept between two different structures. */
const GAP = 3;

export interface PlacedStructure {
  /** `<def id>@<tx>,<ty>`: unique, stable per seed. */
  key: string;
  def: StructureDef;
  /** World tile of the top-left corner of the footprint. */
  tx: number;
  ty: number;
  width: number;
  height: number;
  /** Biome at the middle of the footprint (drives the style). */
  biome: BiomeId;
  blueprint: Blueprint;
  /** Structure props in world coordinates (ids `s:<key>:<n>`). */
  props: Prop[];
  /** Middle of the footprint and the tile in front of the door, in world pixels. */
  cx: number;
  cy: number;
  entryX: number;
  entryY: number;
}

/** What the world needs to know about the structures touching one chunk. */
export interface ChunkStructures {
  /** Overlay of the chunk plus a 1-tile border ((N+2)^2 bytes, see overlayByte), null when none touches it. */
  overlay: Uint8Array | null;
  /** Structure props whose feet lie in the chunk. */
  props: Prop[];
  /** Structures whose cleared zone (footprint + clearance) reaches the chunk. */
  clear: PlacedStructure[];
}

const OV_SIDE = CHUNK_TILES + 2;
const MAX_CHUNKS = 600;

function chunkKey(cx: number, cy: number): number {
  return (cx + 32768) * 65536 + (cy + 32768);
}

/** Distance in tiles from the world origin to the nearest tile of a rectangle. */
function originDistance(tx: number, ty: number, w: number, h: number): number {
  const dx = Math.max(tx, -(tx + w - 1), 0);
  const dy = Math.max(ty, -(ty + h - 1), 0);
  return Math.hypot(dx, dy);
}

export class StructureIndex {
  private readonly defs: readonly StructureDef[];
  private readonly sites = new Map<string, PlacedStructure | null>();
  private readonly chunks = new Map<number, ChunkStructures | null>();
  private readonly out = { x: 0, y: 0 };

  constructor(
    readonly seed: number,
    defs: readonly StructureDef[] = STRUCTURE_DEFS,
  ) {
    this.defs = [...defs].sort((a, b) => a.priority - b.priority);
  }

  /** The instance a cell hosts (cached), or null. `rank` indexes the priority-sorted defs. */
  private site(rank: number, gx: number, gy: number): PlacedStructure | null {
    const key = `${rank}:${gx}:${gy}`;
    const hit = this.sites.get(key);
    if (hit !== undefined) return hit;
    const placed = this.findSite(rank, gx, gy);
    this.sites.set(key, placed);
    return placed;
  }

  private findSite(rank: number, gx: number, gy: number): PlacedStructure | null {
    const def = this.defs[rank];
    if (!def) return null;
    const salt = this.seed + 9000 + rank * 131;
    const midX = (gx + 0.5) * def.spacing;
    const midY = (gy + 0.5) * def.spacing;
    const chance =
      Math.hypot(midX, midY) < NEAR_SPAWN_TILES ? (def.nearChance ?? def.chance) : def.chance;
    if (hash2(gx, gy, salt) >= chance) return null;
    const room = def.spacing - def.width - 2 * EDGE_MARGIN;
    const roomY = def.spacing - def.height - 2 * EDGE_MARGIN;
    for (let a = 0; a < ATTEMPTS; a++) {
      const tx =
        gx * def.spacing + EDGE_MARGIN + Math.floor(hash2(gx * 7 + a, gy, salt + 1) * (room + 1));
      const ty =
        gy * def.spacing + EDGE_MARGIN + Math.floor(hash2(gx, gy * 7 + a, salt + 2) * (roomY + 1));
      const biome = this.validSite(rank, def, tx, ty);
      if (biome) return this.place(def, tx, ty, biome);
    }
    return null;
  }

  /** The biome at the middle when the site is valid, else null. */
  private validSite(rank: number, def: StructureDef, tx: number, ty: number): BiomeId | null {
    const { width: w, height: h } = def;
    if (originDistance(tx, ty, w, h) < def.minDistFromSpawn) return null;
    const mid = biomeAtTile(tx + (w >> 1), ty + (h >> 1), this.seed);
    if (!def.allowedBiomes.includes(mid)) return null;
    for (const [x, y] of [
      [tx, ty],
      [tx + w - 1, ty],
      [tx, ty + h - 1],
      [tx + w - 1, ty + h - 1],
    ] as const) {
      if (!def.allowedBiomes.includes(biomeAtTile(x, y, this.seed))) return null;
    }
    if (!this.dry(tx - DRY_MARGIN, ty - DRY_MARGIN, w + 2 * DRY_MARGIN, h + 2 * DRY_MARGIN))
      return null;
    if (this.conflicts(rank, tx - GAP, ty - GAP, w + 2 * GAP, h + 2 * GAP)) return null;
    return mid;
  }

  /** No water or lava in the rectangle (coarse probe first: lakes are big). */
  private dry(x0: number, y0: number, w: number, h: number): boolean {
    const bad = (x: number, y: number): boolean => {
      const t = tileAt(x, y, this.seed);
      return t === TILE.WATER || t === TILE.LAVA;
    };
    for (let y = y0; y < y0 + h; y += 3)
      for (let x = x0; x < x0 + w; x += 3) if (bad(x, y)) return false;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (bad(x, y)) return false;
    return true;
  }

  /** Does a higher-priority instance touch the rectangle? */
  private conflicts(rank: number, x0: number, y0: number, w: number, h: number): boolean {
    for (let j = 0; j < rank; j++) {
      const o = this.defs[j];
      if (!o) continue;
      for (let gy = Math.floor(y0 / o.spacing); gy <= Math.floor((y0 + h - 1) / o.spacing); gy++) {
        for (
          let gx = Math.floor(x0 / o.spacing);
          gx <= Math.floor((x0 + w - 1) / o.spacing);
          gx++
        ) {
          const p = this.site(j, gx, gy);
          if (p && p.tx < x0 + w && p.tx + p.width > x0 && p.ty < y0 + h && p.ty + p.height > y0)
            return true;
        }
      }
    }
    return false;
  }

  private place(def: StructureDef, tx: number, ty: number, biome: BiomeId): PlacedStructure {
    let i = 0;
    const seed = this.seed;
    const bp = def.build({
      seed,
      biome,
      tx,
      ty,
      rand: () => hash2(i++, tx * 7919 + ty, seed + 31337),
    });
    const key = `${def.id}@${tx},${ty}`;
    const props: Prop[] = bp.props.map((p, n) => {
      const radius = propRadius(p.kind);
      return {
        id: `s:${key}:${n}`,
        kind: p.kind,
        biome,
        variant: p.variant ?? 0,
        x: (tx + p.tx) * TILE_PX + (p.ox ?? TILE_PX / 2),
        y: (ty + p.ty) * TILE_PX + (p.oy ?? TILE_PX / 2),
        radius,
        solid: radius > 0,
      };
    });
    return {
      key,
      def,
      tx,
      ty,
      width: bp.width,
      height: bp.height,
      biome,
      blueprint: bp,
      props,
      cx: (tx + bp.width / 2) * TILE_PX,
      cy: (ty + bp.height / 2) * TILE_PX,
      entryX: (tx + bp.entry.tx + 0.5) * TILE_PX,
      entryY: (ty + bp.entry.ty + 0.5) * TILE_PX,
    };
  }

  // -------------------------------------------------------------------------------------------------
  // Queries

  /** Instances whose footprint touches the tile rectangle (inclusive). */
  inTileRect(x0: number, y0: number, x1: number, y1: number): PlacedStructure[] {
    const out: PlacedStructure[] = [];
    for (let rank = 0; rank < this.defs.length; rank++) {
      const def = this.defs[rank];
      if (!def) continue;
      for (let gy = Math.floor(y0 / def.spacing); gy <= Math.floor(y1 / def.spacing); gy++) {
        for (let gx = Math.floor(x0 / def.spacing); gx <= Math.floor(x1 / def.spacing); gx++) {
          const p = this.site(rank, gx, gy);
          if (p && p.tx <= x1 && p.tx + p.width > x0 && p.ty <= y1 && p.ty + p.height > y0)
            out.push(p);
        }
      }
    }
    return out;
  }

  /** Everything the world needs for one chunk (null when no structure reaches it). Cached. */
  chunk(cx: number, cy: number): ChunkStructures | null {
    const key = chunkKey(cx, cy);
    const hit = this.chunks.get(key);
    if (hit !== undefined) return hit;
    const built = this.buildChunk(cx, cy);
    this.chunks.set(key, built);
    if (this.chunks.size > MAX_CHUNKS) {
      const oldest = this.chunks.keys().next().value;
      if (oldest !== undefined) this.chunks.delete(oldest);
    }
    return built;
  }

  private buildChunk(cx: number, cy: number): ChunkStructures | null {
    const x0 = cx * CHUNK_TILES;
    const y0 = cy * CHUNK_TILES;
    const reach = 4; // >= every def's clearance
    const near = this.inTileRect(
      x0 - reach,
      y0 - reach,
      x0 + CHUNK_TILES - 1 + reach,
      y0 + CHUNK_TILES - 1 + reach,
    );
    if (near.length === 0) return null;
    let overlay: Uint8Array | null = null;
    const props: Prop[] = [];
    const clear: PlacedStructure[] = [];
    for (const p of near) {
      const c = p.def.clearance;
      if (
        p.tx - c <= x0 + CHUNK_TILES - 1 &&
        p.tx + p.width + c > x0 &&
        p.ty - c <= y0 + CHUNK_TILES - 1 &&
        p.ty + p.height + c > y0
      )
        clear.push(p);
      if (
        p.tx <= x0 + CHUNK_TILES &&
        p.tx + p.width > x0 - 1 &&
        p.ty <= y0 + CHUNK_TILES &&
        p.ty + p.height > y0 - 1
      ) {
        overlay ??= new Uint8Array(OV_SIDE * OV_SIDE);
        const bp = p.blueprint;
        for (let j = 0; j < bp.height; j++) {
          const ty = p.ty + j;
          if (ty < y0 - 1 || ty > y0 + CHUNK_TILES) continue;
          for (let i = 0; i < bp.width; i++) {
            const tx = p.tx + i;
            if (tx < x0 - 1 || tx > x0 + CHUNK_TILES) continue;
            const m = bp.mat[j * bp.width + i] ?? 0;
            if (m === 0) continue;
            overlay[(ty - y0 + 1) * OV_SIDE + (tx - x0 + 1)] = overlayByte(
              (m - 1) as MaterialId,
              bp.solid[j * bp.width + i] === 1,
            );
          }
        }
      }
      for (const pr of p.props) {
        if (
          Math.floor(pr.x / (CHUNK_TILES * TILE_PX)) === cx &&
          Math.floor(pr.y / (CHUNK_TILES * TILE_PX)) === cy
        )
          props.push(pr);
      }
    }
    if (!overlay && props.length === 0 && clear.length === 0) return null;
    return { overlay, props, clear };
  }

  /** Overlay byte of a world tile (0 = none; see overlayByte). */
  overlayAt(tx: number, ty: number): number {
    const cx = Math.floor(tx / CHUNK_TILES);
    const cy = Math.floor(ty / CHUNK_TILES);
    const cs = this.chunk(cx, cy);
    if (!cs?.overlay) return 0;
    return cs.overlay[(ty - cy * CHUNK_TILES + 1) * OV_SIDE + (tx - cx * CHUNK_TILES + 1)] ?? 0;
  }

  solidAt(tx: number, ty: number): boolean {
    return (this.overlayAt(tx, ty) & OV_SOLID) !== 0;
  }

  /** Is a natural prop at this feet position inside a cleared zone? */
  isCleared(cs: ChunkStructures, px: number, py: number): boolean {
    const tx = Math.floor(px / TILE_PX);
    const ty = Math.floor(py / TILE_PX);
    for (const p of cs.clear) {
      const c = p.def.clearance;
      if (tx >= p.tx - c && tx < p.tx + p.width + c && ty >= p.ty - c && ty < p.ty + p.height + c)
        return true;
    }
    return false;
  }

  /** Visit every solid tile in a tile rectangle (inclusive): pathing marks them blocked. */
  forEachSolid(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    fn: (tx: number, ty: number) => void,
  ): void {
    for (let cy = Math.floor(y0 / CHUNK_TILES); cy <= Math.floor(y1 / CHUNK_TILES); cy++) {
      for (let cx = Math.floor(x0 / CHUNK_TILES); cx <= Math.floor(x1 / CHUNK_TILES); cx++) {
        const ov = this.chunk(cx, cy)?.overlay;
        if (!ov) continue;
        for (let j = 0; j < CHUNK_TILES; j++) {
          for (let i = 0; i < CHUNK_TILES; i++) {
            if (((ov[(j + 1) * OV_SIDE + i + 1] ?? 0) & OV_SOLID) === 0) continue;
            const tx = cx * CHUNK_TILES + i;
            const ty = cy * CHUNK_TILES + j;
            if (tx >= x0 && tx <= x1 && ty >= y0 && ty <= y1) fn(tx, ty);
          }
        }
      }
    }
  }

  /** Does the circle touch a solid tile? */
  overlapsSolid(x: number, y: number, r: number): boolean {
    const tx0 = Math.floor((x - r) / TILE_PX);
    const tx1 = Math.floor((x + r) / TILE_PX);
    const ty0 = Math.floor((y - r) / TILE_PX);
    const ty1 = Math.floor((y + r) / TILE_PX);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (!this.solidAt(tx, ty)) continue;
        const qx = Math.max(tx * TILE_PX, Math.min(x, (tx + 1) * TILE_PX));
        const qy = Math.max(ty * TILE_PX, Math.min(y, (ty + 1) * TILE_PX));
        if ((x - qx) * (x - qx) + (y - qy) * (y - qy) < r * r) return true;
      }
    }
    return false;
  }

  /**
   * Push a circle out of solid tiles (two passes so corners settle). A centre that ended up inside a solid
   * tile (teleports, spawns) is moved to the nearest free tile first. Returns the (shared) result object.
   */
  collide(px: number, py: number, r: number): { x: number; y: number } {
    const o = this.out;
    o.x = px;
    o.y = py;
    const cxa = Math.floor((px - r) / (CHUNK_TILES * TILE_PX));
    const cxb = Math.floor((px + r) / (CHUNK_TILES * TILE_PX));
    const cya = Math.floor((py - r) / (CHUNK_TILES * TILE_PX));
    const cyb = Math.floor((py + r) / (CHUNK_TILES * TILE_PX));
    let any = false;
    for (let cy = cya; cy <= cyb && !any; cy++)
      for (let cx = cxa; cx <= cxb; cx++) if (this.chunk(cx, cy)?.overlay) any = true;
    if (!any) return o;
    if (this.solidAt(Math.floor(o.x / TILE_PX), Math.floor(o.y / TILE_PX))) this.escape(o);
    for (let pass = 0; pass < 2; pass++) {
      const tx0 = Math.floor((o.x - r) / TILE_PX);
      const tx1 = Math.floor((o.x + r) / TILE_PX);
      const ty0 = Math.floor((o.y - r) / TILE_PX);
      const ty1 = Math.floor((o.y + r) / TILE_PX);
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          if (!this.solidAt(tx, ty)) continue;
          const qx = Math.max(tx * TILE_PX, Math.min(o.x, (tx + 1) * TILE_PX));
          const qy = Math.max(ty * TILE_PX, Math.min(o.y, (ty + 1) * TILE_PX));
          const dx = o.x - qx;
          const dy = o.y - qy;
          const d2 = dx * dx + dy * dy;
          if (d2 >= r * r || d2 < 1e-9) continue;
          const d = Math.sqrt(d2);
          o.x = qx + (dx / d) * r;
          o.y = qy + (dy / d) * r;
        }
      }
    }
    return o;
  }

  /** Move a point that lies inside a solid tile to the centre of the nearest free tile (rings up to 8). */
  private escape(o: { x: number; y: number }): void {
    const tx = Math.floor(o.x / TILE_PX);
    const ty = Math.floor(o.y / TILE_PX);
    let best = Infinity;
    let bx = tx;
    let by = ty;
    for (let ring = 1; ring <= 8 && best === Infinity; ring++) {
      for (let dy = -ring; dy <= ring; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring || this.solidAt(tx + dx, ty + dy))
            continue;
          const cx = (tx + dx + 0.5) * TILE_PX;
          const cy = (ty + dy + 0.5) * TILE_PX;
          const d = (cx - o.x) ** 2 + (cy - o.y) ** 2;
          if (d < best) {
            best = d;
            bx = tx + dx;
            by = ty + dy;
          }
        }
      }
    }
    o.x = (bx + 0.5) * TILE_PX;
    o.y = (by + 0.5) * TILE_PX;
  }

  /** Nearest instance of a structure to a world pixel position within `maxPx`, or null. */
  nearest(id: StructureId, x: number, y: number, maxPx = 6000): PlacedStructure | null {
    const rank = this.defs.findIndex((d) => d.id === id);
    const def = this.defs[rank];
    if (!def) return null;
    const cellPx = def.spacing * TILE_PX;
    const gx0 = Math.floor(x / cellPx);
    const gy0 = Math.floor(y / cellPx);
    let best: PlacedStructure | null = null;
    let bestD = maxPx;
    const maxRing = Math.ceil(maxPx / cellPx) + 1;
    for (let ring = 0; ring <= maxRing; ring++) {
      // Every cell on this ring is at least (ring - 1) cells away.
      if (best && (ring - 1) * cellPx > bestD) break;
      for (let dy = -ring; dy <= ring; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          const p = this.site(rank, gx0 + dx, gy0 + dy);
          if (!p) continue;
          const d = Math.hypot(p.cx - x, p.cy - y);
          if (d <= bestD) {
            bestD = d;
            best = p;
          }
        }
      }
    }
    return best;
  }
}

/**
 * Terrain codes of a bordered chunk terrain array with the structure overlay applied: solid tiles become
 * TILE.WALL (contact shadows and neighbour shading in the painter), floors TILE.GRASS (walkable, dry).
 */
export function applyOverlay(terrain: Uint8Array, overlay: Uint8Array): void {
  for (let i = 0; i < overlay.length; i++) {
    const v = overlay[i] ?? 0;
    if (v === 0) continue;
    terrain[i] = (v & OV_SOLID) !== 0 ? TILE.WALL : TILE.GRASS;
  }
}

// ---------------------------------------------------------------------------------------------------
// World-level helpers (pixel coordinates, like the prop queries)

/** Structures whose footprint touches the pixel rectangle. Empty for worlds without structures. */
export function structuresInRect(
  world: World,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): PlacedStructure[] {
  if (!world.structures) return [];
  return world.structures.inTileRect(
    Math.floor(x0 / TILE_PX),
    Math.floor(y0 / TILE_PX),
    Math.floor(x1 / TILE_PX),
    Math.floor(y1 / TILE_PX),
  );
}

/** Nearest instance of a structure id around a pixel position (debug teleport, tests). */
export function findNearestStructure(
  world: World,
  id: StructureId,
  x: number,
  y: number,
  maxPx = 6000,
): PlacedStructure | null {
  return world.structures?.nearest(id, x, y, maxPx) ?? null;
}

export interface PoiMarker {
  id: StructureId;
  key: string;
  name: string;
  /** Middle of the structure, world pixels. */
  x: number;
  y: number;
  color: string;
}

/**
 * Points of interest within `radius` pixels of (x, y), for the minimap (hook for the lead: draw one dot
 * per marker; markers are static, so a caller may cache them per explored cell). Every structure shows,
 * visited or not; filter by fog in the caller if undiscovered ones should stay hidden.
 */
export function poiMarkers(world: World, x: number, y: number, radius: number): PoiMarker[] {
  return structuresInRect(world, x - radius, y - radius, x + radius, y + radius)
    .filter((p) => Math.hypot(p.cx - x, p.cy - y) <= radius)
    .map((p) => ({
      id: p.def.id,
      key: p.key,
      name: p.def.name,
      x: p.cx,
      y: p.cy,
      color: p.def.color,
    }));
}
