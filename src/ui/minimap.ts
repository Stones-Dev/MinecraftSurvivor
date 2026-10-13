/**
 * Corner minimap with exploration fog (toggle with M, or tap / click the map; with touch controls up a small
 * map chip stands where the map is while it is hidden).
 *
 * The world is divided into 8x8-tile explored cells (128 px). The hero reveals a disc of cells around
 * itself as it walks; the set is a sparse bitset (one 32x32-cell chunk = 32 words), so a long run costs a
 * few hundred bytes. The window around the hero is painted into a small ImageData only when the hero
 * enters a new cell (the map scrolls in 2 px steps), so the per-frame cost is one drawImage, a panel and
 * a handful of marker rects. Colours are the biome's ground colour (water and lava keep their own).
 *
 * Structures (village, temples, trial chamber, outpost, hut) show as small shaped icons, but only where the
 * hero has explored the cell they stand in (no spoilers through the fog). The list is rebuilt when the
 * window is repainted (a cell crossing), never per frame.
 */
import { cb, cbFor, colorblindMode } from '../core/accessibility';
import type { ColorblindMode } from '../core/save';
import type { RunState } from '../game';
import { getMarkers } from '../systems/npcs';
import { biomeAtTile } from '../world/biomeMap';
import { BIOMES, type BiomeId } from '../world/biomes';
import { poiMarkers, type PoiMarker } from '../world/structures';
import type { StructureId } from '../world/structures/stamp';
import { TILE } from '../world/terrain';
import type { World } from '../world/world';
import type { Rect } from './panel';

/** Tiles per explored cell side, and the cell size in world pixels. */
export const CELL_TILES = 8;
export const CELL_PX = CELL_TILES * 16;
/** Reveal radius around the hero, in cells (about two screens across). */
export const REVEAL_RADIUS = 4;
/** Window size in cells (square) and pixels per cell on the minimap. */
export const WINDOW_CELLS = 20;
export const PX_PER_CELL = 2;

const CHUNK_SHIFT = 5; // 32 x 32 cells per chunk
const CHUNK_MASK = 31;

/** Cell coordinate of a world pixel coordinate. */
export function cellOf(px: number): number {
  return Math.floor(px / CELL_PX);
}

/** Sparse set of explored cells: a bitset per 32x32-cell chunk (word = cell row, bit = cell column). */
export class ExploredSet {
  private readonly chunks = new Map<number, Uint32Array>();
  private n = 0;

  private static key(cx: number, cy: number): number {
    return ((cx >> CHUNK_SHIFT) + 32768) * 65536 + ((cy >> CHUNK_SHIFT) + 32768);
  }

  /** Number of explored cells. */
  get size(): number {
    return this.n;
  }

  /** Number of allocated chunks (memory: 128 bytes each). */
  get chunkCount(): number {
    return this.chunks.size;
  }

  has(cx: number, cy: number): boolean {
    const c = this.chunks.get(ExploredSet.key(cx, cy));
    if (!c) return false;
    return ((c[cy & CHUNK_MASK] ?? 0) >>> (cx & CHUNK_MASK)) % 2 === 1;
  }

  /** Mark a cell explored; true when it was new. */
  add(cx: number, cy: number): boolean {
    const k = ExploredSet.key(cx, cy);
    let c = this.chunks.get(k);
    if (!c) {
      c = new Uint32Array(32);
      this.chunks.set(k, c);
    }
    const row = cy & CHUNK_MASK;
    const bit = 1 << (cx & CHUNK_MASK);
    const word = c[row] ?? 0;
    if ((word & bit) !== 0) return false;
    c[row] = (word | bit) >>> 0;
    this.n++;
    return true;
  }

  /** Reveal every cell whose centre lies within `radius` cells of (cx, cy); returns how many were new. */
  reveal(cx: number, cy: number, radius = REVEAL_RADIUS): number {
    let added = 0;
    const r2 = (radius + 0.5) * (radius + 0.5);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= r2 && this.add(cx + dx, cy + dy)) added++;
      }
    }
    return added;
  }

  clear(): void {
    this.chunks.clear();
    this.n = 0;
  }
}

// --- colours (little-endian RGBA words) --------------------------------------------------------

const pack = (r: number, g: number, b: number, a = 255): number =>
  ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;

const FOG = pack(10, 12, 18, 150);
const LAVA_COLOUR = pack(224, 104, 24);

/** Minimap colour of every biome: its ground colour, shaded a touch so adjacent regions separate. */
export const BIOME_MAP_COLOUR: Readonly<Record<BiomeId, number>> = Object.fromEntries(
  (Object.keys(BIOMES) as BiomeId[]).map((id) => {
    const g = BIOMES[id].grass[0];
    return [id, pack(g[0], g[1], g[2])];
  }),
) as Record<BiomeId, number>;

const WATER_COLOUR: Readonly<Record<BiomeId, number>> = Object.fromEntries(
  (Object.keys(BIOMES) as BiomeId[]).map((id) => {
    const b = BIOMES[id];
    const w = b.iceWater ? ([176, 214, 240] as const) : b.water[0];
    return [id, pack(w[0], w[1], w[2])];
  }),
) as Record<BiomeId, number>;

/** Colour of an explored cell: the biome at its centre, or water / lava when the centre tile is liquid. */
export function cellColour(world: World, cx: number, cy: number): number {
  const tx = cx * CELL_TILES + CELL_TILES / 2;
  const ty = cy * CELL_TILES + CELL_TILES / 2;
  const biome = world.fixedBiome ?? biomeAtTile(tx, ty, world.seed, world.arena);
  const tile = world.tileAt(tx, ty);
  if (tile === TILE.WATER) return WATER_COLOUR[biome];
  if (tile === TILE.LAVA) return LAVA_COLOUR;
  return BIOME_MAP_COLOUR[biome];
}

/**
 * Paint the window of cells around (cx, cy) into `out` (WINDOW_CELLS * PX_PER_CELL squared words).
 * Unexplored cells get the fog colour. Pure given the colour function; exported for tests.
 */
export function paintWindow(
  explored: ExploredSet,
  cx: number,
  cy: number,
  colourOf: (cx: number, cy: number) => number,
  out: Uint32Array,
): void {
  const side = WINDOW_CELLS * PX_PER_CELL;
  const half = WINDOW_CELLS >> 1;
  for (let j = 0; j < WINDOW_CELLS; j++) {
    for (let i = 0; i < WINDOW_CELLS; i++) {
      const x = cx - half + i;
      const y = cy - half + j;
      const c = explored.has(x, y) ? colourOf(x, y) : FOG;
      for (let v = 0; v < PX_PER_CELL; v++) {
        const row = (j * PX_PER_CELL + v) * side + i * PX_PER_CELL;
        for (let u = 0; u < PX_PER_CELL; u++) out[row + u] = c;
      }
    }
  }
}

/**
 * Where a world point lies on the minimap, in minimap pixels relative to its top-left corner, with the
 * window centred on the hero's cell. `inside` is false when the point is beyond the window.
 */
export function mapPoint(
  heroX: number,
  heroY: number,
  x: number,
  y: number,
  out: { x: number; y: number; inside: boolean },
): void {
  const side = WINDOW_CELLS * PX_PER_CELL;
  const half = WINDOW_CELLS >> 1;
  const hcx = cellOf(heroX);
  const hcy = cellOf(heroY);
  // Window origin is the top-left corner of cell (hcx - half, hcy - half).
  const mx = ((x - (hcx - half) * CELL_PX) / CELL_PX) * PX_PER_CELL;
  const my = ((y - (hcy - half) * CELL_PX) / CELL_PX) * PX_PER_CELL;
  out.inside = mx >= 0 && my >= 0 && mx < side && my < side;
  out.x = Math.max(1, Math.min(side - 2, mx));
  out.y = Math.max(1, Math.min(side - 2, my));
}

/** Side of the map in art pixels (the frame adds 2 on each side). */
export const MAP_SIDE = WINDOW_CELLS * PX_PER_CELL;
/** Side of the chip that stands in for a hidden map on touch screens. */
export const CHIP_SIDE = 16;
/** Touch controls need this much height before the map is shown beside them (below it the map hides). */
export const TOUCH_MIN_HEIGHT = 150;
/** With touch controls the map moves this far left so it clears the ability / item buttons. */
export const TOUCH_SHIFT = 48;

export interface MapSlot {
  /** The map window (without its 2 px frame), or null when it is not drawn. */
  map: Rect | null;
  /** The touch toggle chip, or null. */
  chip: Rect | null;
}

/**
 * Where the minimap and its touch chip go for a view: top-right, `top` px down, `right` px across. Without
 * touch controls only the map exists (the M key toggles it). With them the map sits TOUCH_SHIFT px further
 * left, clear of the buttons, and while it is hidden a small chip takes its corner so a tap brings it back; on
 * a view shorter than TOUCH_MIN_HEIGHT (or than the map's top plus 90 px, the item button's reach) neither is
 * drawn.
 */
export function minimapSlot(
  right: number,
  top: number,
  height: number,
  touch: boolean,
  visible: boolean,
  arena = false,
): MapSlot {
  if (arena || (touch && height < Math.max(TOUCH_MIN_HEIGHT, top + 90))) {
    return { map: null, chip: null };
  }
  const edge = touch ? right - TOUCH_SHIFT : right;
  if (visible) {
    return { map: { x: edge - MAP_SIDE - 3, y: top + 1, w: MAP_SIDE, h: MAP_SIDE }, chip: null };
  }
  if (!touch) return { map: null, chip: null };
  return { map: null, chip: { x: edge - 1 - CHIP_SIDE, y: top + 1, w: CHIP_SIDE, h: CHIP_SIDE } };
}

/** Does a tap at (x, y) land on the map (frame included) or chip? `pad` widens it for fingers. */
export function slotHit(slot: MapSlot, x: number, y: number, pad = 3): boolean {
  const r = slot.map
    ? { x: slot.map.x - 2, y: slot.map.y - 2, w: slot.map.w + 4, h: slot.map.h + 4 }
    : slot.chip;
  return !!r && x >= r.x - pad && y >= r.y - pad && x < r.x + r.w + pad && y < r.y + r.h + pad;
}

// --- structure icons ----------------------------------------------------------------------------

/** 3x3 glyph per structure, row-major bits (bit 8 = top-left). Shape carries the identity, colour backs it up. */
export const POI_GLYPH: Readonly<Record<StructureId, number>> = {
  village: 0b111_111_111, // solid square
  desert_temple: 0b010_111_010, // plus
  jungle_temple: 0b101_010_101, // X
  trial_chamber: 0b111_101_111, // ring
  pillager_outpost: 0b111_010_010, // T (banner pole)
  witch_hut: 0b010_101_111, // little roof over a door
};

/**
 * Colour-vision-safe stand-ins for the structure colours (the table in core/accessibility.ts only covers
 * the combat cues). Chosen so that no two differ by less than a delta E of ~30 for any of the three
 * deficiencies; `tests/minimap.test.ts` checks it with the same simulator the accessibility tests use.
 */
const POI_SAFE: Readonly<Record<string, string>> = {
  '#ffd84a': '#ffff00', // village: yellow
  '#e8a040': '#8000ff', // desert temple: violet
  '#6fcf5a': '#a0ffa0', // jungle temple: pale green
  '#d05a5a': '#ff3a3a', // pillager outpost: red
  '#4fd6c0': '#648fff', // trial chamber: blue
  '#9a5ad0': '#cc79a7', // witch hut: pink
};

/** Marker colour of a structure for a colour-blind mode (cb() first, then the POI table). */
export function poiColourFor(mode: ColorblindMode, color: string): string {
  const mapped = cbFor(mode, color);
  if (mapped !== color || mode === 'off') return mapped;
  return POI_SAFE[color.toLowerCase()] ?? color;
}

/** Marker colour of a structure under the current colour-blind setting. */
export function poiColour(color: string): string {
  return poiColourFor(colorblindMode(), color);
}

/** Search radius for structures: the corner of the window (half the side times the diagonal), in px. */
const POI_RADIUS = (WINDOW_CELLS / 2) * CELL_PX * 1.5;

/**
 * Structures worth showing: within the radius of (x, y) and standing in an explored cell. Pure; the minimap
 * calls it on every repaint and keeps the result.
 */
export function discoveredPois(
  world: World,
  explored: ExploredSet,
  x: number,
  y: number,
  radius = POI_RADIUS,
): PoiMarker[] {
  return poiMarkers(world, x, y, radius).filter((m) => explored.has(cellOf(m.x), cellOf(m.y)));
}

/** Paint a 3x3 glyph with a one pixel dark rim whose centre pixel is at (cx, cy). */
function drawGlyph(
  ctx: CanvasRenderingContext2D,
  bits: number,
  cx: number,
  cy: number,
  color: string,
): void {
  ctx.fillStyle = '#101014';
  ctx.fillRect(cx - 2, cy - 2, 5, 5);
  ctx.fillStyle = color;
  for (let i = 0; i < 9; i++) {
    if ((bits >> (8 - i)) & 1) ctx.fillRect(cx - 1 + (i % 3), cy - 1 + Math.floor(i / 3), 1, 1);
  }
}

const STORE_KEY = 'minesurvive.minimap';

function loadVisible(): boolean {
  try {
    return localStorage.getItem(STORE_KEY) !== '0';
  } catch {
    return true;
  }
}

function saveVisible(v: boolean): void {
  try {
    localStorage.setItem(STORE_KEY, v ? '1' : '0');
  } catch {
    // Storage blocked: the toggle just lasts for this session.
  }
}

const pt = { x: 0, y: 0, inside: false };

export class Minimap {
  readonly explored = new ExploredSet();
  /** Player preference (M key, remembered per browser); hidden regardless while touch controls are up. */
  visible = loadVisible();
  private readonly buf = new Uint32Array(WINDOW_CELLS * PX_PER_CELL * WINDOW_CELLS * PX_PER_CELL);
  private canvas: HTMLCanvasElement | null = null;
  private g: CanvasRenderingContext2D | null = null;
  private img: ImageData | null = null;
  private lastCx = Number.NaN;
  private lastCy = Number.NaN;
  private lastWorld: World | null = null;
  private dirty = true;
  /** Structures in explored cells near the hero, rebuilt with the window. */
  private pois: PoiMarker[] = [];
  /** The structure list is stale: rebuild it on the next frame that does not repaint the window. */
  private poisDue = false;
  /** Where the map or chip was drawn last frame (for taps). */
  private slot: MapSlot = { map: null, chip: null };

  /** A tap / click at (x, y) on the map or its chip toggles it; true when it did. */
  tap(x: number, y: number): boolean {
    if (!slotHit(this.slot, x, y)) return false;
    this.toggle();
    return true;
  }

  toggle(): void {
    this.visible = !this.visible;
    saveVisible(this.visible);
  }

  /** Reveal around the hero when it has entered a new cell. Cheap enough to call every frame. */
  update(run: RunState): void {
    const world = run.world;
    if (world !== this.lastWorld) {
      // The Nether rift is another world: the overworld fog is kept, the rift just hides the map.
      this.lastWorld = world;
      this.dirty = true;
    }
    if (world.arena) return;
    const cx = cellOf(run.player.x);
    const cy = cellOf(run.player.y);
    if (cx === this.lastCx && cy === this.lastCy) return;
    this.lastCx = cx;
    this.lastCy = cy;
    this.explored.reveal(cx, cy);
    this.dirty = true;
  }

  private ensureCanvas(): boolean {
    if (this.g) return true;
    if (typeof document === 'undefined') return false;
    const side = WINDOW_CELLS * PX_PER_CELL;
    this.canvas = document.createElement('canvas');
    this.canvas.width = side;
    this.canvas.height = side;
    this.g = this.canvas.getContext('2d');
    this.img = this.g ? new ImageData(new Uint8ClampedArray(this.buf.buffer), side, side) : null;
    return this.g !== null && this.img !== null;
  }

  /**
   * Draw the map with its top-right corner at (right, top), or the touch chip while it is hidden on a touch
   * screen (see `minimapSlot`).
   */
  draw(
    ctx: CanvasRenderingContext2D,
    run: RunState,
    right: number,
    top: number,
    height: number,
    touch: boolean,
    time: number,
  ): void {
    this.update(run);
    this.slot = minimapSlot(right, top, height, touch, this.visible, !!run.world.arena);
    if (this.slot.chip) drawChip(ctx, this.slot.chip);
    if (!this.slot.map || !this.ensureCanvas()) return;
    const side = MAP_SIDE;
    const x = this.slot.map.x;
    const y = this.slot.map.y;
    if (this.dirty && this.g && this.img) {
      paintWindow(
        this.explored,
        this.lastCx,
        this.lastCy,
        (cx, cy) => cellColour(run.world, cx, cy),
        this.buf,
      );
      this.g.putImageData(this.img, 0, 0);
      this.dirty = false;
      this.poisDue = true; // the structure query runs next frame, so the two costs never share one
    } else if (this.poisDue) {
      this.poisDue = false;
      this.pois = discoveredPois(
        run.world,
        this.explored,
        (this.lastCx + 0.5) * CELL_PX,
        (this.lastCy + 0.5) * CELL_PX,
      );
    }
    // Frame and map.
    ctx.fillStyle = '#101014';
    ctx.fillRect(x - 2, y - 2, side + 4, side + 4);
    ctx.fillStyle = '#4a4a56';
    ctx.fillRect(x - 1, y - 1, side + 2, side + 2);
    if (this.canvas) ctx.drawImage(this.canvas, x, y);
    const p = run.player;
    // Structures the hero has explored, under the live markers. Only those inside the window.
    for (const m of this.pois) {
      mapPoint(p.x, p.y, m.x, m.y, pt);
      if (pt.inside)
        drawGlyph(
          ctx,
          POI_GLYPH[m.id],
          x + Math.round(pt.x),
          y + Math.round(pt.y),
          poiColour(m.color),
        );
    }
    // Markers: portal, trader, villager flag, Charged mobs, the End portal. Beyond the window they stick to the edge.
    for (const m of getMarkers(run)) {
      mapPoint(p.x, p.y, m.x, m.y, pt);
      const blink = pt.inside || Math.floor(time * 3) % 2 === 0;
      if (!blink) continue;
      ctx.fillStyle = '#101014';
      ctx.fillRect(x + Math.round(pt.x) - 2, y + Math.round(pt.y) - 2, 4, 4);
      ctx.fillStyle = cb(m.color);
      ctx.fillRect(x + Math.round(pt.x) - 1, y + Math.round(pt.y) - 1, 2, 2);
    }
    // The hero: a white dot with a dark rim.
    mapPoint(p.x, p.y, p.x, p.y, pt);
    ctx.fillStyle = '#101014';
    ctx.fillRect(x + Math.round(pt.x) - 2, y + Math.round(pt.y) - 2, 4, 4);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + Math.round(pt.x) - 1, y + Math.round(pt.y) - 1, 2, 2);
  }
}

/** The touch chip: a tiny map glyph on a dark tile, as faint as the other touch buttons. */
function drawChip(ctx: CanvasRenderingContext2D, r: Rect): void {
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#101014';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = '#4a4a56';
  ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  ctx.fillStyle = '#3f7a45';
  ctx.fillRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6);
  ctx.fillStyle = '#4f86c8';
  ctx.fillRect(r.x + r.w - 8, r.y + r.h - 7, 5, 4);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(r.x + 6, r.y + 6, 2, 2);
  ctx.restore();
}
