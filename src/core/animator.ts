export interface AnimDef {
  frames: string[];
  fps: number;
  loop: boolean;
}

/** Steps through an animation's frame keys; pure, no DOM. */
export class Animator {
  private time = 0;

  constructor(private def: AnimDef) {}

  play(def: AnimDef): void {
    if (def !== this.def) {
      this.def = def;
      this.time = 0;
    }
  }

  update(dt: number): void {
    this.time += dt;
  }

  get done(): boolean {
    return !this.def.loop && this.time * this.def.fps >= this.def.frames.length;
  }

  get frameKey(): string {
    const n = this.def.frames.length;
    const i = Math.floor(this.time * this.def.fps);
    const key = this.def.frames[this.def.loop ? i % n : Math.min(i, n - 1)];
    if (key === undefined) throw new Error('Animation has no frames');
    return key;
  }
}
