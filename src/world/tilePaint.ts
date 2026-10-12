/** Procedural Minecraft-style tile painting into a packed-pixel buffer (no DOM). */
import { hash2 } from '../core/noise';
import { pack, PixBuffer } from '../core/pixelart';
import { BIOME_IDS, BIOME_INDEX, BIOMES, type BiomeId } from './biomes';
import { BIOME_BORDER, CHUNK_PX, CHUNK_TILES, TILE, TILE_PX } from './terrain';

/** Per-pixel random bytes, generated once; chunks read it at a seed-derived offset. */
const NOISE = new Uint8Array(256 * 256);
for (let y = 0; y < 256; y++)
  for (let x = 0; x < 256; x++) NOISE[y * 256 + x] = Math.floor(hash2(x, y, 12345) * 256);

/** Packed palette of every biome, indexed by BIOME_INDEX: 12 colours each (see PAL_* offsets). */
const PAL_STRIDE = 12;
const PAL_GRASS = 0; // base, light, dark
const PAL_DIRT = 3; // base, light, dark
const PAL_SAND = 6; // base, dark
const PAL_WATER = 8; // base, light, dark, foam
const PALETTES = new Uint32Array(BIOME_IDS.length * PAL_STRIDE);
const DIRT_THRESHOLD = new Float32Array(BIOME_IDS.length);
const ICE = Uint8Array.from(BIOME_IDS, (id) => (BIOMES[id].iceWater ? 1 : 0));
BIOME_IDS.forEach((id, i) => {
  const b = BIOMES[id];
  const cols = [...b.grass, ...b.dirt, ...b.sand, ...b.water];
  cols.forEach((c, k) => (PALETTES[i * PAL_STRIDE + k] = pack(c)));
  DIRT_THRESHOLD[i] = b.dirtThreshold;
});

/** Scratch: the chunk's dirt/grass noise field on a 2 px grid (reused by every bake). */
const FIELD = new Float32Array((CHUNK_PX >> 1) * (CHUNK_PX >> 1));

/** How far (art px) the biome lookup of a ground pixel is jittered: the width of a soft border. */
const BORDER_WARP = 44;
const BORDER_GRAIN = 12;

/**
 * Paint one chunk (256x256 art px) from its bordered terrain array and its per-tile biome indices.
 *
 * `biomes` is the chunk's biome map with a BIOME_BORDER-tile margin (see genChunkBiomes), or a single
 * biome for the whole chunk. Ground pixels near a biome border look their biome up at a position warped
 * by smooth noise plus per-pixel grain, which dithers the two palettes deterministically (no runtime
 * crossfade). Water, lava and walls always use the tile's own biome so what you see is what you walk on.
 */
export function paintChunk(
  cx: number,
  cy: number,
  terrain: Uint8Array,
  biomes: Uint8Array | BiomeId,
  seed: number,
): PixBuffer {
  const buf = new PixBuffer(CHUNK_PX, CHUNK_PX);
  const ox = Math.floor(hash2(cx, cy, seed + 1) * 256);
  const oy = Math.floor(hash2(cx, cy, seed + 2) * 256);
  const side = CHUNK_TILES + 2;
  const bSide = CHUNK_TILES + 2 * BIOME_BORDER;
  const bmap =
    typeof biomes === 'string' ? new Uint8Array(bSide * bSide).fill(BIOME_INDEX[biomes]) : biomes;
  const biomeAt = (tx: number, ty: number): number =>
    bmap[(ty + BIOME_BORDER) * bSide + tx + BIOME_BORDER] ?? 0;
  // Value-noise lattices (scale 10 px) precomputed for this chunk: same field as valueNoise(X/10, Y/10),
  // but a handful of hashes per chunk instead of four per pixel. The second and third drive the border warp.
  const L = 10;
  const gx0 = Math.floor((cx * CHUNK_PX) / L);
  const gy0 = Math.floor((cy * CHUNK_PX) / L);
  const gw = Math.floor((cx * CHUNK_PX + CHUNK_PX - 1) / L) - gx0 + 2;
  const gh = Math.floor((cy * CHUNK_PX + CHUNK_PX - 1) / L) - gy0 + 2;
  const lattice = (salt: number): Float32Array => {
    const lat = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j++)
      for (let i = 0; i < gw; i++) lat[j * gw + i] = hash2(gx0 + i, gy0 + j, seed + salt);
    return lat;
  };
  const lat = lattice(303);
  const latWx = lattice(919);
  const latWy = lattice(929);
  const noiseAt = (field: Float32Array, X: number, Y: number): number => {
    const u = X / L;
    const v = Y / L;
    const x0 = Math.floor(u);
    const y0 = Math.floor(v);
    const fx = u - x0;
    const fy = v - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const k = (y0 - gy0) * gw + (x0 - gx0);
    const a = field[k] ?? 0;
    const b = field[k + 1] ?? 0;
    const c = field[k + gw] ?? 0;
    const d = field[k + gw + 1] ?? 0;
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  const at = (tx: number, ty: number): number => terrain[(ty + 1) * side + tx + 1] ?? TILE.GRASS;
  const reach = Math.ceil((BORDER_WARP + BORDER_GRAIN) / 2 / TILE_PX);
  // The dirt/grass field is smooth at a 10 px scale: sample it on a 2 px grid once per chunk.
  const half = CHUNK_PX >> 1;
  for (let y = 0; y < half; y++)
    for (let x = 0; x < half; x++)
      FIELD[y * half + x] = noiseAt(lat, cx * CHUNK_PX + x * 2 + 1, cy * CHUNK_PX + y * 2 + 1);
  const warpX = new Float32Array(16);
  const warpY = new Float32Array(16);
  const minT = -BIOME_BORDER;
  const maxT = CHUNK_TILES + BIOME_BORDER - 1;
  const wallBase = pack([52, 50, 60]);
  const wallLight = pack([76, 74, 86]);
  const wallDark = pack([38, 36, 44]);
  const wallMortar = pack([24, 22, 30]);
  const lCrust = pack([58, 30, 22]);
  const lBase = pack([226, 86, 18]);
  const lLight = pack([255, 172, 44]);
  const lDark = pack([166, 48, 10]);

  for (let ty = 0; ty < CHUNK_TILES; ty++) {
    for (let tx = 0; tx < CHUNK_TILES; tx++) {
      const t = at(tx, ty);
      const own = biomeAt(tx, ty);
      const ownPal = own * PAL_STRIDE;
      // Does any tile within the warp reach belong to another biome? Only those tiles pay for the dither.
      let mixed = false;
      for (let dy = -reach; dy <= reach && !mixed; dy++) {
        for (let dx = -reach; dx <= reach; dx++) {
          const nx = Math.max(minT, Math.min(maxT, tx + dx));
          const ny = Math.max(minT, Math.min(maxT, ty + dy));
          if (biomeAt(nx, ny) !== own) {
            mixed = true;
            break;
          }
        }
      }
      if (mixed) {
        // The warp field is smooth (10 px lattice): sample it once per 4x4-pixel block of the tile.
        for (let k = 0; k < 16; k++) {
          const X = cx * CHUNK_PX + tx * TILE_PX + (k & 3) * 4 + 2;
          const Y = cy * CHUNK_PX + ty * TILE_PX + (k >> 2) * 4 + 2;
          warpX[k] = (noiseAt(latWx, X, Y) - 0.5) * BORDER_WARP;
          warpY[k] = (noiseAt(latWy, X, Y) - 0.5) * BORDER_WARP;
        }
      }
      const iceWater = ICE[own] === 1;
      const wBase = PALETTES[ownPal + PAL_WATER] ?? 0;
      const wLight = PALETTES[ownPal + PAL_WATER + 1] ?? 0;
      const wDark = PALETTES[ownPal + PAL_WATER + 2] ?? 0;
      const wFoam = PALETTES[ownPal + PAL_WATER + 3] ?? 0;
      const openL = at(tx - 1, ty) !== TILE.WATER;
      const openR = at(tx + 1, ty) !== TILE.WATER;
      const openU = at(tx, ty - 1) !== TILE.WATER;
      const openD = at(tx, ty + 1) !== TILE.WATER;
      const lavaL = at(tx - 1, ty) !== TILE.LAVA;
      const lavaR = at(tx + 1, ty) !== TILE.LAVA;
      const lavaU = at(tx, ty - 1) !== TILE.LAVA;
      const lavaD = at(tx, ty + 1) !== TILE.LAVA;
      for (let ly = 0; ly < TILE_PX; ly++) {
        for (let lx = 0; lx < TILE_PX; lx++) {
          const px = tx * TILE_PX + lx;
          const py = ty * TILE_PX + ly;
          const j = (NOISE[(((py + oy) & 255) << 8) | ((px + ox) & 255)] ?? 0) / 256;
          let c: number;
          if (t === TILE.WALL) {
            // Basalt bricks: offset rows of 8 px with dark mortar.
            const row = py >> 3;
            const bx = (px + (row % 2) * 8) % 16;
            if (py % 8 === 0 || bx === 0) c = wallMortar;
            else c = j < 0.2 ? wallLight : j > 0.85 ? wallDark : wallBase;
          } else if (t === TILE.LAVA) {
            const dl = Math.min(
              lavaL ? lx : 99,
              lavaR ? TILE_PX - 1 - lx : 99,
              lavaU ? ly : 99,
              lavaD ? TILE_PX - 1 - ly : 99,
            );
            if (dl < 2) c = lCrust;
            else if (j < 0.12) c = lLight;
            else if (j < 0.22) c = lDark;
            else c = lBase;
          } else if (t === TILE.WATER) {
            // Near a border, open water takes the palette of a warped neighbour (like the ground) as
            // long as both agree on frozen or not, so ice always matches the tile's own biome.
            let wb = wBase;
            let wl = wLight;
            let wd = wDark;
            let wf = wFoam;
            if (mixed && !iceWater) {
              const sub = (ly >> 2) * 4 + (lx >> 2);
              const sx = Math.max(
                minT,
                Math.min(
                  maxT,
                  Math.floor((px + (warpX[sub] ?? 0) + (j - 0.5) * BORDER_GRAIN) / TILE_PX),
                ),
              );
              const sy = Math.max(
                minT,
                Math.min(maxT, Math.floor((py + (warpY[sub] ?? 0)) / TILE_PX)),
              );
              const wbi = biomeAt(sx, sy);
              if (ICE[wbi] === 0) {
                const o = wbi * PAL_STRIDE + PAL_WATER;
                wb = PALETTES[o] ?? wBase;
                wl = PALETTES[o + 1] ?? wLight;
                wd = PALETTES[o + 2] ?? wDark;
                wf = PALETTES[o + 3] ?? wFoam;
              }
            }
            const dist = Math.min(
              openL ? lx : 99,
              openR ? TILE_PX - 1 - lx : 99,
              openU ? ly : 99,
              openD ? TILE_PX - 1 - ly : 99,
            );
            if (iceWater) {
              // Frozen water: pale ice with thin cracks.
              if (dist === 0) c = wf;
              else if ((px + py * 2 + ox) % 29 === 0 || (px * 2 - py + oy + 512) % 31 === 0) c = wd;
              else c = j < 0.18 ? wl : wb;
            } else if (dist === 0) c = wf;
            else if (dist < 3) c = j < 0.5 ? wl : wb;
            else if (
              (NOISE[(((py + oy + 91) & 255) << 8) | (((px >> 2) + ox + 17) & 255)] ?? 255) < 13
            )
              c = wl;
            else if (j < 0.05) c = wd;
            else c = wb;
          } else {
            // Ground: the biome is looked up at a warped position near borders (soft, dithered edge).
            let pal = ownPal;
            let bi = own;
            if (mixed) {
              const sub = (ly >> 2) * 4 + (lx >> 2);
              const g = (NOISE[(((px + ox + 37) & 255) << 8) | ((py + oy + 59) & 255)] ?? 0) / 256;
              const wx = px + (warpX[sub] ?? 0) + (j - 0.5) * BORDER_GRAIN;
              const wy = py + (warpY[sub] ?? 0) + (g - 0.5) * BORDER_GRAIN;
              const sx = Math.max(minT, Math.min(maxT, Math.floor(wx / TILE_PX)));
              const sy = Math.max(minT, Math.min(maxT, Math.floor(wy / TILE_PX)));
              bi = biomeAt(sx, sy);
              pal = bi * PAL_STRIDE;
            }
            if (t === TILE.SAND) {
              c = (j < 0.2 ? PALETTES[pal + PAL_SAND + 1] : PALETTES[pal + PAL_SAND]) ?? 0;
            } else {
              const n = FIELD[(py >> 1) * half + (px >> 1)] ?? 0;
              if (n + (j - 0.5) * 0.14 > (DIRT_THRESHOLD[bi] ?? 1)) {
                c = PALETTES[pal + PAL_DIRT + (j < 0.1 ? 1 : j < 0.3 ? 2 : 0)] ?? 0;
              } else {
                const lightP = n > 0.55 ? 0.5 : 0.7;
                const k = j < lightP ? 0 : j < lightP + 0.18 ? 1 : j > 0.93 ? 2 : 0;
                c = PALETTES[pal + PAL_GRASS + k] ?? 0;
              }
            }
          }
          buf.data[py * CHUNK_PX + px] = c;
        }
      }
    }
  }
  return buf;
}
