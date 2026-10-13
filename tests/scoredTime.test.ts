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

describe('resultsScreen records the capped time everywhere', () => {
  it('stores and submits scoredTime, not the idle End clock (bestTime, playSeconds, leaderboard)', async () => {
    const { RunState } = await import('../src/game');
    const { resultsScreen } = await import('../src/ui/resultsScreen');
    const { defaultSave } = await import('../src/core/save');
    const { vi } = await import('vitest');
    const run = new RunState(1, 0);
    run.time = 7200; // two hours of idling in the End
    run.endKilledAt = 1000;
    const data = defaultSave();
    const submit = vi.fn(() => Promise.resolve([] as string[]));
    const app = {
      data: () => data,
      store: { save: () => undefined },
      leaderboard: () => ({ submitRun: submit }),
      goHub: () => undefined,
    };
    resultsScreen(app as never, run, true);
    expect(data.stats.bestTimeSec).toBe(1120);
    expect(data.stats.playSeconds).toBe(1120);
    expect(submit).toHaveBeenCalledTimes(1);
    expect((submit.mock.calls[0] as unknown[])[0]).toMatchObject({ timeSec: 1120 });
  });
});
