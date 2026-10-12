import { describe, expect, it } from 'vitest';
import { defaultSave } from '../src/core/save';
import { CloudError } from '../src/net/errors';
import {
  boardId,
  CloudLeaderboardService,
  currentBoards,
  dayKeyUTC,
  isBetterEntry,
  isoWeekKey,
  LocalLeaderboard,
  normalizeRun,
  validBoardId,
} from '../src/net/leaderboard';
import { MemoryBackend, MemoryServer } from '../src/net/memoryBackend';

const codeOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return e instanceof CloudError ? e.code : 'other';
  }
};

describe('board ids', () => {
  it('uses ISO weeks and UTC days', () => {
    expect(isoWeekKey(new Date(Date.UTC(2026, 0, 1)))).toBe('2026-W01'); // Thursday
    expect(isoWeekKey(new Date(Date.UTC(2027, 0, 1)))).toBe('2026-W53'); // 2026 has 53 weeks
    expect(isoWeekKey(new Date(Date.UTC(2024, 11, 30)))).toBe('2025-W01'); // Monday
    expect(isoWeekKey(new Date(Date.UTC(2026, 9, 12)))).toBe('2026-W42');
    expect(dayKeyUTC(new Date(Date.UTC(2026, 9, 2, 23, 59)))).toBe('2026-10-02');
    const d = new Date(Date.UTC(2026, 9, 12, 10));
    expect(boardId('all', d)).toBe('time_all');
    expect(boardId('week', d)).toBe('time_week_2026-W42');
    expect(boardId('day', d)).toBe('time_day_2026-10-12');
    expect(currentBoards(d).every(validBoardId)).toBe(true);
    expect(validBoardId('time_all_x')).toBe(false);
    expect(validBoardId('../saves')).toBe(false);
  });

  it('ranks by time then kills and normalizes runs to what the rules accept', () => {
    expect(isBetterEntry({ timeSec: 10, kills: 0 }, { timeSec: 9, kills: 99 })).toBe(true);
    expect(isBetterEntry({ timeSec: 10, kills: 5 }, { timeSec: 10, kills: 4 })).toBe(true);
    expect(isBetterEntry({ timeSec: 10, kills: 4 }, { timeSec: 10, kills: 4 })).toBe(false);
    expect(normalizeRun({ hero: 'steve', timeSec: 61.9, kills: 10.5 })).toEqual({
      timeSec: 61,
      kills: 10,
    });
    expect(normalizeRun({ hero: 'steve', timeSec: 1e9, kills: 1e9 }).timeSec).toBe(7200);
    expect(normalizeRun({ hero: 'steve', timeSec: 10, kills: 1e9 }).kills).toBe(400);
  });
});

async function setup() {
  const server = new MemoryServer();
  let t = Date.UTC(2026, 9, 12, 12);
  server.now = () => t;
  const backend = new MemoryBackend({ server });
  const u = await backend.auth.signInGoogle();
  await backend.claimNickname(u.uid, 'Builder', 'alex');
  const advance = (sec: number): void => {
    t += sec * 1000;
  };
  return { server, backend, uid: u.uid, advance, clock: () => new Date(t) };
}

describe('cloud leaderboard (memory backend rules)', () => {
  it('keeps one best entry per player and board', async () => {
    const { backend, uid, advance } = await setup();
    const entry = { uid, nick: 'Builder', avatar: 'alex', hero: 'alex', timeSec: 100, kills: 50 };
    await backend.markRunStart(uid);
    advance(101);
    expect(await backend.leaderboard.submit('time_all', entry)).toBe(true);
    expect(await backend.leaderboard.submit('time_all', { ...entry, timeSec: 90 })).toBe(false);
    expect(await backend.leaderboard.submit('time_all', { ...entry, kills: 60 })).toBe(true);
    const top = await backend.leaderboard.top('time_all', 10);
    expect(top).toHaveLength(1);
    expect(top[0]).toMatchObject({ timeSec: 100, kills: 60, nick: 'Builder' });
    expect(await backend.leaderboard.rank('time_all', uid)).toBe(1);
    expect(await backend.leaderboard.rank('time_day_2026-10-12', uid)).toBeNull();
  });

  it('rejects times longer than the real time since the run started', async () => {
    const { backend, uid, advance } = await setup();
    const entry = { uid, nick: 'Builder', avatar: 'alex', hero: 'steve', timeSec: 600, kills: 1 };
    expect(await codeOf(backend.leaderboard.submit('time_all', entry))).toBe('permission'); // no run
    await backend.markRunStart(uid);
    advance(300);
    expect(await codeOf(backend.leaderboard.submit('time_all', entry))).toBe('permission');
    advance(296); // 596 s elapsed + 5 s slack >= 600
    expect(await backend.leaderboard.submit('time_all', entry)).toBe(true);
  });

  it('rejects impostor nicknames, other uids, bad boards and implausible kills', async () => {
    const { backend, uid, advance } = await setup();
    await backend.markRunStart(uid);
    advance(100);
    const ok = { uid, nick: 'Builder', avatar: 'alex', hero: 'steve', timeSec: 60, kills: 10 };
    expect(await codeOf(backend.leaderboard.submit('time_all', { ...ok, nick: 'Notch' }))).toBe(
      'permission',
    );
    expect(await codeOf(backend.leaderboard.submit('time_all', { ...ok, uid: 'x' }))).toBe(
      'permission',
    );
    expect(await codeOf(backend.leaderboard.submit('lb_hack', ok))).toBe('permission');
    expect(await codeOf(backend.leaderboard.submit('time_all', { ...ok, kills: 5000 }))).toBe(
      'permission',
    );
    expect(await codeOf(backend.leaderboard.submit('time_all', { ...ok, timeSec: 1.5 }))).toBe(
      'permission',
    );
  });

  it('sorts, filters by hero and ranks among several players', async () => {
    const { server, backend, uid, advance } = await setup();
    const others = ['Zed', 'Amy', 'Kit'].map(
      (n) => new MemoryBackend({ server, googleAccount: { email: `${n}@x.io`, displayName: n } }),
    );
    await backend.markRunStart(uid);
    const ids: string[] = [];
    for (const [i, b] of others.entries()) {
      const u = await b.auth.signInGoogle();
      ids.push(u.uid);
      await b.claimNickname(u.uid, ['Zed', 'Amy', 'Kit'][i] ?? 'x');
      await b.markRunStart(u.uid);
    }
    advance(1000);
    const times = [300, 500, 300];
    for (const [i, b] of others.entries()) {
      await b.leaderboard.submit('time_all', {
        uid: ids[i] ?? '',
        nick: ['Zed', 'Amy', 'Kit'][i] ?? '',
        avatar: 'steve',
        hero: i === 1 ? 'alex' : 'steve',
        timeSec: times[i] ?? 0,
        kills: i,
      });
    }
    await backend.leaderboard.submit('time_all', {
      uid,
      nick: 'Builder',
      avatar: 'alex',
      hero: 'alex',
      timeSec: 400,
      kills: 3,
    });
    const top = await backend.leaderboard.top('time_all', 10);
    expect(top.map((e) => e.nick)).toEqual(['Amy', 'Builder', 'Kit', 'Zed']);
    expect((await backend.leaderboard.top('time_all', 10, 'alex')).map((e) => e.nick)).toEqual([
      'Amy',
      'Builder',
    ]);
    expect((await backend.leaderboard.top('time_all', 2)).length).toBe(2);
    expect(await backend.leaderboard.rank('time_all', uid)).toBe(2);
    expect(await backend.leaderboard.rank('time_all', ids[0] ?? '')).toBe(3); // tie on time
  });
});

describe('CloudLeaderboardService', () => {
  it('submits a run to every current board, and only where it improves', async () => {
    const { backend, uid, advance, clock } = await setup();
    const svc = new CloudLeaderboardService(
      backend,
      () => ({ uid, nick: 'Builder', avatar: 'alex' }),
      clock,
    );
    await svc.runStarted();
    advance(200);
    const improved = await svc.submitRun({ hero: 'alex', timeSec: 180.7, kills: 90 });
    expect(improved).toEqual(currentBoards(clock()));
    expect((await svc.top('week', 5))[0]?.timeSec).toBe(180);
    expect(await svc.rank('day')).toBe(1);
    const calls = backend.calls;
    await svc.runStarted();
    advance(100);
    expect(await svc.submitRun({ hero: 'alex', timeSec: 90, kills: 1 })).toEqual([]);
    expect(backend.calls).toBe(calls + 1); // only the run-start mark: bests are remembered
  });

  it('never throws: rejected or offline submissions are skipped', async () => {
    const { backend, uid, advance, clock } = await setup();
    const svc = new CloudLeaderboardService(
      backend,
      () => ({ uid, nick: 'Builder', avatar: 'alex' }),
      clock,
    );
    await svc.runStarted();
    advance(10);
    expect(await svc.submitRun({ hero: 'alex', timeSec: 3600, kills: 1 })).toEqual([]); // too long
    backend.offline = true;
    await svc.runStarted();
    expect(await svc.submitRun({ hero: 'alex', timeSec: 5, kills: 1 })).toEqual([]);
    const anon = new CloudLeaderboardService(backend, () => null, clock);
    expect(await anon.submitRun({ hero: 'alex', timeSec: 5, kills: 1 })).toEqual([]);
    expect(await anon.rank('all')).toBeNull();
  });
});

describe('LocalLeaderboard', () => {
  it('lists the player bests per hero from the save', async () => {
    const s = defaultSave(1);
    s.profile.name = 'Ana';
    const lb = new LocalLeaderboard(() => s);
    expect(await lb.top('all', 10)).toEqual([]);
    expect(await lb.rank()).toBeNull();
    s.stats.bestTimeSec = 99;
    expect((await lb.top('all', 10))[0]).toMatchObject({ nick: 'Ana', timeSec: 99 });
    s.stats.perHero = {
      steve: { runs: 3, bestTimeSec: 300.5, bestKills: 40 },
      alex: { runs: 1, bestTimeSec: 600, bestKills: 10 },
      rana: { runs: 0, bestTimeSec: 0, bestKills: 0 },
    };
    expect((await lb.top('week', 10)).map((e) => [e.hero, e.timeSec])).toEqual([
      ['alex', 600],
      ['steve', 300],
    ]);
    expect((await lb.top('all', 10, 'steve')).map((e) => e.hero)).toEqual(['steve']);
    expect(await lb.rank()).toBe(1);
    expect(lb.online).toBe(false);
  });
});
