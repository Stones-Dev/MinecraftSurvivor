import { describe, expect, it } from 'vitest';
import { Projectile } from '../src/entities/projectile';
import { drawProjectile } from '../src/render/entities';

function draw(pr: Projectile, quality: 0 | 1 | 2): { rects: string[]; xs: number[]; ys: number[] } {
  const rects: string[] = [];
  const xs: number[] = [];
  const ys: number[] = [];
  const st: Record<string, unknown> = { globalAlpha: 1, fillStyle: '' };
  const ctx = new Proxy(st, {
    get(t, k) {
      if (k in t) return t[k as string];
      if (k === 'fillRect')
        return (x: number, y: number, w: number, h: number) => {
          rects.push(`${x},${y},${w},${h}`);
          if (st.fillStyle !== 'rgba(0,0,0,0.2)') {
            xs.push(x);
            ys.push(y);
          }
        };
      return () => undefined;
    },
    set(t, k, v) {
      t[k as string] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  drawProjectile(ctx, pr, 0, 0, 0, 0, quality);
  expect(st.globalAlpha).toBe(1); // trails restore the alpha
  return { rects, xs, ys };
}

function proj(style: Projectile['style'], vx: number, vy: number): Projectile {
  const p = new Projectile(100, 100, vx, vy, 2, 1, 0, true, 1);
  p.rx = 100;
  p.ry = 100;
  p.style = style;
  return p;
}

describe('projectile sprites', () => {
  it('draws arrows about 14 px long, with a trail on the higher tiers only', () => {
    const lo = draw(proj('arrow', 200, 0), 0);
    const hi = draw(proj('arrow', 200, 0), 2);
    const len = (r: { xs: number[] }): number => Math.max(...r.xs) - Math.min(...r.xs) + 1;
    expect(len(lo)).toBeGreaterThanOrEqual(14);
    expect(len(lo)).toBeLessThanOrEqual(15);
    expect(hi.rects.length).toBeGreaterThan(lo.rects.length);
    expect(draw(proj('arrow', 200, 0), 1).rects.length).toBeLessThan(hi.rects.length);
  });

  it('draws tridents about 18 px long and a diagonal arrow along its direction', () => {
    const t = draw(proj('trident', 200, 0), 0);
    expect(Math.max(...t.xs) - Math.min(...t.xs) + 1).toBeGreaterThanOrEqual(18);
    const d = draw(proj('arrow', 100, 100), 0);
    const w = Math.max(...d.xs) - Math.min(...d.xs);
    const h = Math.max(...d.ys) - Math.min(...d.ys);
    expect(Math.abs(w - h)).toBeLessThanOrEqual(3);
    expect(w).toBeGreaterThan(8);
  });

  it('spins a thrown trident (boomerang) at 720 degrees per second', () => {
    const at = (life: number): string => {
      const p = proj('trident', 200, 0);
      p.boomerang = true;
      p.life = life;
      return draw(p, 0).rects.join('|');
    };
    expect(at(1)).toBe(at(0.5)); // one full turn in half a second
    expect(at(1)).not.toBe(at(0.75)); // a quarter turn in between
    expect(at(1)).not.toBe(at(0.9));
  });
});
