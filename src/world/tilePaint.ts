/** Procedural Minecraft-style tile painting into a packed-pixel buffer (no DOM). */
import { hash2 } from '../core/noise';
import { pack, PixBuffer } from '../core/pixelart';
import type { Biome } from './biomes';
import { CHUNK_PX, CHUNK_TILES, TILE, TILE_PX } from './terrain';

/** Per-pixel random bytes, generated once; chunks read it at a seed-derived offset. */
const NOISE = new Uint8Array(256 * 256);
for (let y = 0; y < 256; y++)
  for (let x = 0; x < 256; x++) NOISE[y * 256 + x] = Math.floor(hash2(x, y, 12345) * 256);

/** Paint one chunk (256x256 art px) from its bordered terrain array. */
export function paintChunk(
  cx: number,
  cy: number,
  terrain: Uint8Array,
  biome: Biome,
  seed: number,
): PixBuffer {
  const buf = new PixBuffer(CHUNK_PX, CHUNK_PX);
  const ox = Math.floor(hash2(cx, cy, seed + 1) * 256);
  const oy = Math.floor(hash2(cx, cy, seed + 2) * 256);
  const side = CHUNK_TILES + 2;
  const [gBase, gLight, gDark] = biome.grass.map(pack) as [number, number, number];
  const [dBase, dLight, dDark] = biome.dirt.map(pack) as [number, number, number];
  const [sBase, sDark] = biome.sand.map(pack) as [number, number];
  const [wBase, wLight, wDark, wFoam] = biome.water.map(pack) as [number, number, number, number];
  // Value-noise lattice (scale 10 px) precomputed for this chunk: same field as valueNoise(X/10, Y/10),
  // but a handful of hashes per chunk instead of four per pixel.
  const L = 10;
  const gx0 = Math.floor((cx * CHUNK_PX) / L);
  const gy0 = Math.floor((cy * CHUNK_PX) / L);
  const gw = Math.floor((cx * CHUNK_PX + CHUNK_PX - 1) / L) - gx0 + 2;
  const gh = Math.floor((cy * CHUNK_PX + CHUNK_PX - 1) / L) - gy0 + 2;
  const lat = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++)
    for (let i = 0; i < gw; i++) lat[j * gw + i] = hash2(gx0 + i, gy0 + j, seed + 303);
  const noiseAt = (X: number, Y: number): number => {
    const u = X / L;
    const v = Y / L;
    const x0 = Math.floor(u);
    const y0 = Math.floor(v);
    const fx = u - x0;
    const fy = v - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const k = (y0 - gy0) * gw + (x0 - gx0);
    const a = lat[k] ?? 0;
    const b = lat[k + 1] ?? 0;
    const c = lat[k + gw] ?? 0;
    const d = lat[k + gw + 1] ?? 0;
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  const raw = (tx: number, ty: number): number => terrain[(ty + 1) * side + tx + 1] ?? TILE.GRASS;
  // Lava only exists in biomes that allow it; elsewhere the tile is plain ground.
  const at = (tx: number, ty: number): number => {
    const t = raw(tx, ty);
    return t === TILE.LAVA && !biome.lava ? TILE.GRASS : t;
  };
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
          const X = cx * CHUNK_PX + px;
          const Y = cy * CHUNK_PX + py;
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
            const dist = Math.min(
              openL ? lx : 99,
              openR ? TILE_PX - 1 - lx : 99,
              openU ? ly : 99,
              openD ? TILE_PX - 1 - ly : 99,
            );
            if (biome.iceWater) {
              // Frozen water: pale ice with thin cracks.
              if (dist === 0) c = wFoam;
              else if ((px + py * 2 + ox) % 29 === 0 || (px * 2 - py + oy + 512) % 31 === 0)
                c = wDark;
              else c = j < 0.18 ? wLight : wBase;
            } else if (dist === 0) c = wFoam;
            else if (dist < 3) c = j < 0.5 ? wLight : wBase;
            else if (
              (NOISE[(((py + oy + 91) & 255) << 8) | (((px >> 2) + ox + 17) & 255)] ?? 255) < 13
            )
              c = wLight;
            else if (j < 0.05) c = wDark;
            else c = wBase;
          } else if (t === TILE.SAND) {
            c = j < 0.2 ? sDark : sBase;
          } else {
            const n = noiseAt(X, Y);
            if (n + (j - 0.5) * 0.14 > biome.dirtThreshold) {
              c = j < 0.1 ? dLight : j < 0.3 ? dDark : dBase;
            } else {
              const lightP = n > 0.55 ? 0.5 : 0.7;
              c = j < lightP ? gBase : j < lightP + 0.18 ? gLight : j > 0.93 ? gDark : gBase;
            }
          }
          buf.data[py * CHUNK_PX + px] = c;
        }
      }
    }
  }
  return buf;
}
