import { describe, expect, it } from 'vitest';
import { Animator } from '../src/core/animator';
import { pickZoom } from '../src/core/canvas';

describe('Animator', () => {
  const def = { frames: ['a', 'b', 'c'], fps: 10, loop: true };

  it('steps frames at the given fps and loops', () => {
    const an = new Animator(def);
    expect(an.frameKey).toBe('a');
    an.update(0.11);
    expect(an.frameKey).toBe('b');
    an.update(0.2);
    expect(an.frameKey).toBe('a');
  });

  it('holds the last frame of a non-looping animation', () => {
    const an = new Animator({ ...def, loop: false });
    an.update(5);
    expect(an.frameKey).toBe('c');
    expect(an.done).toBe(true);
  });
});

describe('pickZoom', () => {
  it('uses x3 on large viewports and x2 on small ones', () => {
    expect(pickZoom(1920, 1080)).toBe(3);
    expect(pickZoom(1024, 768)).toBe(2);
  });
});
