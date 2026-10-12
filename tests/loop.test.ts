import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Loop, STEP } from '../src/core/loop';

describe('Loop', () => {
  let queue: ((t: number) => void)[] = [];
  let now = 0;

  beforeEach(() => {
    queue = [];
    now = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => queue.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => {
      queue = [];
    });
    vi.stubGlobal('performance', { now: () => now });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function frame(dtSec: number): void {
    const cb = queue.shift();
    if (!cb) throw new Error('rAF chain is dead');
    now += dtSec * 1000;
    cb(now);
  }

  it('keeps the rAF chain alive when update or render throws, and reports the error', () => {
    let updates = 0;
    let renders = 0;
    const errors: unknown[] = [];
    const loop = new Loop(
      {
        update() {
          updates++;
          if (updates === 2) throw new Error('boom update');
        },
        render() {
          renders++;
          if (renders === 3) throw new Error('boom render');
        },
      },
      (e) => errors.push(e),
    );
    loop.start();
    for (let i = 0; i < 6; i++) frame(STEP);
    expect(queue.length).toBe(1);
    expect(updates).toBeGreaterThanOrEqual(5);
    expect(renders).toBe(6);
    expect(errors.map((e) => (e as Error).message)).toEqual(['boom update', 'boom render']);
    loop.stop();
  });

  it('logs through console.error by default, throttled so a persistent fault does not spam', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const loop = new Loop({
      update() {
        throw new Error('always');
      },
      render() {},
    });
    loop.start();
    for (let i = 0; i < 30; i++) frame(STEP);
    expect(queue.length).toBe(1);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    loop.stop();
  });
});
