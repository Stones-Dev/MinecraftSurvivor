/** BFS distance field around the player (rebuilt every 200 ms) so walkers path around trees and rocks. */
import type { BiomeId } from '../world/biomes';
import { TILE_PX } from '../world/terrain';
import type { World } from '../world/world';

const R = 24; // tiles around the player
const SIDE = 2 * R + 1;
const UNSEEN = 0x7fff;
const EVERY = 0.2;

export class Pathing {
  private readonly dist = new Int16Array(SIDE * SIDE);
  private readonly blocked = new Uint8Array(SIDE * SIDE);
  private readonly queue = new Int32Array(SIDE * SIDE);
  private ox = 0;
  private oy = 0;
  private timer = 0;

  update(dt: number, px: number, py: number, world: World, biome: BiomeId): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = EVERY;
    this.rebuild(px, py, world, biome);
  }

  private rebuild(px: number, py: number, world: World, biome: BiomeId): void {
    this.ox = Math.floor(px / TILE_PX) - R;
    this.oy = Math.floor(py / TILE_PX) - R;
    this.blocked.fill(0);
    this.dist.fill(UNSEEN);
    const props = world.propsInRect(
      this.ox * TILE_PX,
      this.oy * TILE_PX,
      (this.ox + SIDE) * TILE_PX,
      (this.oy + SIDE) * TILE_PX,
      biome,
    );
    for (const p of props) {
      if (!p.solid) continue;
      const tx = Math.floor(p.x / TILE_PX) - this.ox;
      const ty = Math.floor(p.y / TILE_PX) - this.oy;
      if (tx >= 0 && ty >= 0 && tx < SIDE && ty < SIDE) this.blocked[ty * SIDE + tx] = 1;
    }
    const start = R * SIDE + R;
    this.blocked[start] = 0;
    this.dist[start] = 0;
    let head = 0;
    let tail = 0;
    this.queue[tail++] = start;
    while (head < tail) {
      const cur = this.queue[head++] ?? 0;
      const cx = cur % SIDE;
      const cy = (cur - cx) / SIDE;
      const d = (this.dist[cur] ?? 0) + 1;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= SIDE || ny >= SIDE) continue;
          const ni = ny * SIDE + nx;
          if (this.blocked[ni] || (this.dist[ni] ?? 0) !== UNSEEN) continue;
          if (
            dx !== 0 &&
            dy !== 0 &&
            (this.blocked[cy * SIDE + nx] || this.blocked[ny * SIDE + cx])
          )
            continue;
          this.dist[ni] = d;
          this.queue[tail++] = ni;
        }
      }
    }
  }

  /**
   * Unit direction from (x, y) towards the player along the cheapest route, written to `out`.
   * Returns false when the position is outside the field, unreachable, or already next to the player.
   */
  dir(x: number, y: number, out: { x: number; y: number }): boolean {
    const tx = Math.floor(x / TILE_PX) - this.ox;
    const ty = Math.floor(y / TILE_PX) - this.oy;
    if (tx < 1 || ty < 1 || tx >= SIDE - 1 || ty >= SIDE - 1) return false;
    const here = this.dist[ty * SIDE + tx] ?? UNSEEN;
    if (here === UNSEEN || here <= 1) return false;
    let best = here;
    let bx = 0;
    let by = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const d = this.dist[(ty + dy) * SIDE + tx + dx] ?? UNSEEN;
        if (d < best) {
          best = d;
          bx = dx;
          by = dy;
        }
      }
    }
    if (bx === 0 && by === 0) return false;
    // Aim at the centre of the chosen neighbour tile.
    const cxw = (this.ox + tx + bx + 0.5) * TILE_PX;
    const cyw = (this.oy + ty + by + 0.5) * TILE_PX;
    const ddx = cxw - x;
    const ddy = cyw - y;
    const len = Math.hypot(ddx, ddy) || 1;
    out.x = ddx / len;
    out.y = ddy / len;
    return true;
  }
}
