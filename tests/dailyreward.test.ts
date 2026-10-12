import { describe, expect, it } from 'vitest';
import { defaultSave } from '../src/core/save';
import { DAILY_LOGIN_REWARDS } from '../src/data/missions';
import { claimDailyReward, dailyRewardState } from '../src/systems/missions';

const at = (y: number, m: number, d: number, h = 12): number => new Date(y, m - 1, d, h).getTime();
const DAY1 = at(2026, 10, 12);

describe('daily login reward', () => {
  it('has seven escalating days ending with a rare egg', () => {
    expect(DAILY_LOGIN_REWARDS).toHaveLength(7);
    const em = DAILY_LOGIN_REWARDS.map((r) => r.emeralds ?? 0);
    expect(em).toEqual([...em].sort((a, b) => a - b));
    expect(new Set(em).size).toBe(7);
    expect(DAILY_LOGIN_REWARDS[6]?.rareSpawnEggs).toBe(1);
    expect(DAILY_LOGIN_REWARDS.slice(0, 6).some((r) => r.rareSpawnEggs)).toBe(false);
  });

  it('a fresh save can claim day 1, once per day', () => {
    const s = defaultSave(DAY1);
    const st = dailyRewardState(s, DAY1);
    expect(st).toMatchObject({ status: 'ready', canClaim: true, day: 1, streak: 0, done: 0 });
    const em = s.currencies.emeralds;
    const r = claimDailyReward(s, DAY1);
    expect(r).toMatchObject({ ok: true, streak: 1, day: 1 });
    expect(s.currencies.emeralds).toBe(em + 50);
    expect(s.dailyReward).toEqual({ lastClaimDay: '2026-10-12', streak: 1 });
    // Same day again, even hours later: nothing.
    expect(claimDailyReward(s, at(2026, 10, 12, 23))).toEqual({ ok: false, reason: 'claimed' });
    expect(s.currencies.emeralds).toBe(em + 50);
    expect(dailyRewardState(s, DAY1)).toMatchObject({
      status: 'claimed',
      canClaim: false,
      done: 1,
    });
  });

  it('builds a streak on consecutive local days and pays the day-7 rare egg', () => {
    const s = defaultSave(DAY1);
    for (let i = 0; i < 7; i++) {
      const before = s.currencies.rareSpawnEggs;
      const r = claimDailyReward(s, at(2026, 10, 12 + i, i % 2 ? 0 : 23)); // alternate edges of the day
      expect(r).toMatchObject({ ok: true, streak: i + 1, day: i + 1 });
      expect(s.currencies.rareSpawnEggs).toBe(before + (i === 6 ? 1 : 0));
    }
    // Day 8 starts a new cycle at day 1 but keeps the streak counting.
    const st = dailyRewardState(s, at(2026, 10, 19));
    expect(st).toMatchObject({ status: 'ready', day: 1, nextStreak: 8, done: 0, streak: 7 });
    const r = claimDailyReward(s, at(2026, 10, 19));
    expect(r).toMatchObject({ ok: true, streak: 8, day: 1 });
    expect(s.stats.counters['best.streak']).toBe(8);
  });

  it('resets the streak after a missed day', () => {
    const s = defaultSave(DAY1);
    claimDailyReward(s, at(2026, 10, 12));
    claimDailyReward(s, at(2026, 10, 13));
    claimDailyReward(s, at(2026, 10, 14));
    expect(s.dailyReward.streak).toBe(3);
    const st = dailyRewardState(s, at(2026, 10, 16)); // skipped the 15th
    expect(st).toMatchObject({ status: 'ready', broken: true, streak: 0, day: 1, nextStreak: 1 });
    const em = s.currencies.emeralds;
    const r = claimDailyReward(s, at(2026, 10, 16));
    expect(r).toMatchObject({ ok: true, streak: 1, day: 1 });
    expect(s.currencies.emeralds).toBe(em + 50);
  });

  it('a claim just after midnight continues the streak (local days, not 24 h)', () => {
    const s = defaultSave(DAY1);
    claimDailyReward(s, at(2026, 10, 12, 23));
    const r = claimDailyReward(s, at(2026, 10, 13, 0));
    expect(r).toMatchObject({ ok: true, streak: 2 });
  });

  describe('clock safety', () => {
    it('never goes backwards: an earlier clock cannot claim or change the streak', () => {
      const s = defaultSave(DAY1);
      claimDailyReward(s, at(2026, 10, 12));
      claimDailyReward(s, at(2026, 10, 13));
      const snap = JSON.stringify(s.dailyReward);
      const em = s.currencies.emeralds;
      expect(dailyRewardState(s, at(2026, 10, 11)).status).toBe('clock-behind');
      expect(claimDailyReward(s, at(2026, 10, 11))).toEqual({ ok: false, reason: 'clock-behind' });
      expect(claimDailyReward(s, at(2026, 10, 12))).toEqual({ ok: false, reason: 'clock-behind' });
      expect(JSON.stringify(s.dailyReward)).toBe(snap);
      expect(s.currencies.emeralds).toBe(em);
    });

    it('ignores an unset, invalid or absurdly far-future clock', () => {
      const s = defaultSave(DAY1);
      for (const t of [
        0,
        -1,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        at(2150, 1, 1),
        at(1999, 1, 1),
      ]) {
        expect(dailyRewardState(s, t)).toMatchObject({ status: 'clock-invalid', canClaim: false });
        expect(claimDailyReward(s, t)).toEqual({ ok: false, reason: 'clock-invalid' });
      }
      expect(s.dailyReward).toEqual({ lastClaimDay: '', streak: 0 });
    });

    it('a claim made with a far-future clock does not lock the player out forever', () => {
      const s = defaultSave(DAY1);
      s.dailyReward = { lastClaimDay: '2031-06-01', streak: 40 };
      const st = dailyRewardState(s, DAY1);
      expect(st.status).toBe('ready');
      expect(st.nextStreak).toBe(1); // the bogus streak is not carried over
    });

    it('a jump far ahead only grants one claim and restarts the streak', () => {
      const s = defaultSave(DAY1);
      claimDailyReward(s, DAY1);
      const r = claimDailyReward(s, at(2027, 3, 1));
      expect(r).toMatchObject({ ok: true, streak: 1 });
      expect(claimDailyReward(s, at(2027, 3, 1))).toMatchObject({ ok: false });
    });

    it('tampered save values cannot produce an out-of-range cycle day', () => {
      const s = defaultSave(DAY1);
      s.dailyReward = { lastClaimDay: '2026-10-11', streak: 99999 };
      const st = dailyRewardState(s, DAY1);
      expect(st.day).toBeGreaterThanOrEqual(1);
      expect(st.day).toBeLessThanOrEqual(7);
      s.dailyReward = { lastClaimDay: 'garbage', streak: -4 };
      expect(dailyRewardState(s, DAY1)).toMatchObject({ status: 'ready', day: 1, nextStreak: 1 });
    });
  });
});
