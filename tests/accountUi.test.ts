import { describe, expect, it } from 'vitest';
import {
  accountBadge,
  compactNumber,
  formatClock,
  formatPlayTime,
  lifetimeStats,
  syncLine,
} from '../src/ui/accountInfo';
import { avatarChoices } from '../src/ui/profileScreen';
import { clampScroll, visibleRange } from '../src/ui/rankingScreen';
import { defaultSave } from '../src/core/save';
import type { SessionUser } from '../src/net/auth';

const user = (over: Partial<SessionUser>): SessionUser => ({
  kind: 'cloud',
  id: 'u1',
  name: 'Kid',
  avatar: 'steve',
  email: 'a@b.co',
  provider: 'password',
  needsNickname: false,
  ...over,
});

describe('account badge', () => {
  it('names every account state', () => {
    expect(accountBadge(null, 'signed-out', false).label).toBe('Not signed in');
    expect(accountBadge(user({ kind: 'guest', provider: 'guest' }), 'guest', false).label).toBe(
      'Guest',
    );
    expect(accountBadge(user({ kind: 'local', provider: 'local' }), 'local', false).label).toBe(
      'Local profile',
    );
    expect(accountBadge(user({ provider: 'google' }), 'cloud', true).label).toBe('Google');
    expect(accountBadge(user({ provider: 'password' }), 'cloud', true).label).toBe('Email');
    expect(accountBadge(user({}), 'cloud', false).label).toBe('Offline cloud');
  });
});

describe('sync line', () => {
  const now = 1_000_000;
  it('explains a build without cloud', () => {
    expect(syncLine('local', false, false, 0, now).text).toBe(
      'Cloud save disabled; playing locally.',
    );
  });
  it('invites guests to sign in when the cloud exists', () => {
    expect(syncLine('local', true, false, 0, now).text).toContain('Sign in');
  });
  it('reports each sync status for a cloud account', () => {
    expect(syncLine('idle', true, true, now - 5 * 60_000, now).text).toBe('Synced 5 min ago.');
    expect(syncLine('syncing', true, true, 0, now).text).toBe('Syncing...');
    expect(syncLine('offline', true, true, 0, now).text).toContain('Offline');
    expect(syncLine('error', true, true, 0, now).text).toContain('Sync problem');
    expect(syncLine('conflict', true, true, 0, now).text).toContain('choose');
  });
});

describe('formatting', () => {
  it('formats clocks, play time and big numbers', () => {
    expect(formatClock(0)).toBe('-');
    expect(formatClock(65.9)).toBe('1:05');
    expect(formatClock(3725)).toBe('1:02:05');
    expect(formatPlayTime(45)).toBe('45s');
    expect(formatPlayTime(750)).toBe('12m 30s');
    expect(formatPlayTime(3900)).toBe('1h 05m');
    expect(compactNumber(999)).toBe('999');
    expect(compactNumber(12345)).toBe('12.3k');
    expect(compactNumber(250000)).toBe('250k');
    expect(compactNumber(1_234_567)).toBe('1.23M');
  });

  it('lifetime stats never report less than the v1 records', () => {
    const d = defaultSave(1);
    d.records = { bestTimeSec: 500, bestKills: 300, wins: 2, runs: 9 };
    d.stats.runs = 4;
    d.stats.bestTimeSec = 700;
    const s = lifetimeStats(d);
    expect(s.runs).toBe(9);
    expect(s.wins).toBe(2);
    expect(s.bestTimeSec).toBe(700);
    expect(s.bestKills).toBe(300);
  });
});

describe('ranking scroll', () => {
  it('clamps the offset to the list', () => {
    expect(clampScroll(-3, 20, 6)).toBe(0);
    expect(clampScroll(99, 20, 6)).toBe(14);
    expect(clampScroll(5, 4, 6)).toBe(0);
  });
  it('returns the visible window', () => {
    expect(visibleRange(0, 20, 6)).toEqual([0, 6]);
    expect(visibleRange(99, 20, 6)).toEqual([14, 20]);
    expect(visibleRange(0, 3, 6)).toEqual([0, 3]);
    expect(visibleRange(0, 0, 6)).toEqual([0, 0]);
  });
});

describe('avatar choices', () => {
  it('offers owned heroes plus Steve and the current avatar', () => {
    const d = defaultSave(1);
    d.owned = { alex: { level: 1, shards: 0, obtainedAt: 1 } };
    expect(avatarChoices(d, 'steve')).toEqual(['steve', 'alex']);
    expect(avatarChoices(d, 'creeper')).toEqual(['steve', 'alex', 'creeper']);
  });
});
