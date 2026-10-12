export interface Hashable {
  x: number;
  y: number;
  radius: number;
}

/** Uniform-grid spatial hash rebuilt every frame; entities are binned by centre. */
export class SpatialHash<T extends Hashable> {
  private readonly cells = new Map<number, T[]>();
  private used: T[][] = [];
  private clears = 0;

  /** `maxRadius` is the largest entity radius stored; it bounds how far past the query circle to look. */
  constructor(
    private readonly cell = 32,
    private readonly maxRadius = 24,
  ) {}

  private key(cx: number, cy: number): number {
    return (cx + 32768) * 65536 + (cy + 32768);
  }

  clear(): void {
    for (const bucket of this.used) bucket.length = 0;
    this.used.length = 0;
    // A long run that drifts in one direction would otherwise keep one empty bucket per cell ever visited.
    if (++this.clears >= 600) {
      this.clears = 0;
      for (const [k, b] of this.cells) if (b.length === 0) this.cells.delete(k);
    }
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
    const reach = r + this.maxRadius;
    const x0 = Math.floor((x - reach) / this.cell);
    const x1 = Math.floor((x + reach) / this.cell);
    const y0 = Math.floor((y - reach) / this.cell);
    const y1 = Math.floor((y + reach) / this.cell);
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
