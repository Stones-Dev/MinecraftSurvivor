export interface Hashable {
  x: number;
  y: number;
  radius: number;
}

/** Uniform-grid spatial hash rebuilt every frame; entities are binned by centre. */
export class SpatialHash<T extends Hashable> {
  private readonly cells = new Map<number, T[]>();
  private used: T[][] = [];

  constructor(private readonly cell = 32) {}

  private key(cx: number, cy: number): number {
    return (cx + 32768) * 65536 + (cy + 32768);
  }

  clear(): void {
    for (const bucket of this.used) bucket.length = 0;
    this.used.length = 0;
  }

  insert(e: T): void {
    const k = this.key(Math.floor(e.x / this.cell), Math.floor(e.y / this.cell));
    let bucket = this.cells.get(k);
    if (!bucket) {
      bucket = [];
      this.cells.set(k, bucket);
    }
    if (bucket.length === 0) this.used.push(bucket);
    bucket.push(e);
  }

  /** Entities whose circle touches the circle (x, y, r); results are written into `out`. */
  query(x: number, y: number, r: number, out: T[]): T[] {
    out.length = 0;
    const x0 = Math.floor((x - r) / this.cell) - 1;
    const x1 = Math.floor((x + r) / this.cell) + 1;
    const y0 = Math.floor((y - r) / this.cell) - 1;
    const y1 = Math.floor((y + r) / this.cell) + 1;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const bucket = this.cells.get(this.key(cx, cy));
        if (!bucket) continue;
        for (const e of bucket) {
          const dx = e.x - x;
          const dy = e.y - y;
          const sum = r + e.radius;
          if (dx * dx + dy * dy <= sum * sum) out.push(e);
        }
      }
    }
    return out;
  }
}
