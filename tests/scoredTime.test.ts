import { describe, expect, it } from 'vitest';
import { scoredTime } from '../src/ui/resultsScreen';

describe('scoredTime', () => {
  it('is the run clock while the dragon lives', () => {
    expect(scoredTime(900, -1)).toBe(900);
  });
  it('stops counting two minutes after the dragon died', () => {
    expect(scoredTime(1010, 1000)).toBe(1010);
    expect(scoredTime(7200, 1000)).toBe(1120);
  });
});
