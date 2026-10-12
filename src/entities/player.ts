import type { InputSource } from '../core/input';
import type { BiomeId } from '../world/biomes';
import type { World } from '../world/world';

export class Player {
  x = 0;
  y = 0;
  /** Sprites face right by default; -1 mirrors them. */
  facing: 1 | -1 = 1;
  moving = false;
  readonly radius = 5;
  speed = 72; // art px per second (4.5 tiles/s)

  update(dt: number, input: InputSource, world: World, biome: BiomeId): void {
    const v = input.moveVector();
    this.moving = v.x !== 0 || v.y !== 0;
    if (v.x !== 0) this.facing = v.x > 0 ? 1 : -1;
    if (!this.moving) return;
    const step = this.speed * world.speedFactor(this.x, this.y) * dt;
    const next = world.collide(this.x + v.x * step, this.y + v.y * step, this.radius, biome);
    this.x = next.x;
    this.y = next.y;
  }
}
