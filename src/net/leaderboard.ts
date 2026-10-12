import type { SaveData } from '../core/save';
import type { CloudBackend, LeaderboardEntry, LeaderboardSubmission } from './backend';
import { toCloudError } from './errors';

/**
 * Time-survived leaderboards. Boards are `<mode>_<period>`:
 *   time_all                 all time
 *   time_week_<yyyy-Www>     ISO week (UTC)
 *   time_day_<yyyy-mm-dd>    day (UTC)
 * One entry per player per board (`lb/{board}/e/{uid}`), replaced only when better: longer time,
 * or the same whole second with more kills. The hero is a field so a board can be filtered per hero.
 *
 * Anti-cheat (firestore.rules): when a run starts the client writes `runs/{uid}.startedAt` with the
 * server time; the rules reject an entry whose time exceeds the real time elapsed since then
 * plus RUN_TIME_SLACK_SEC, and entries with more kills than MAX_KILLS_PER_SEC allows.
 */
export const RUN_TIME_SLACK_SEC = 5;
export const MAX_RUN_SEC = 7200;
export const MAX_KILLS_PER_SEC = 10;
/** Flat allowance added to the per-second kill bound (mirrors firestore.rules). */
export const MAX_KILLS_BASE = 20;
export type Period = 'all' | 'week' | 'day';
export const PERIODS: readonly Period[] = ['day', 'week', 'all'];

const BOARD_RE = /^time_(all|week_\d{4}-W\d{2}|day_\d{4}-\d{2}-\d{2})$/;
export const validBoardId = (board: string): boolean => BOARD_RE.test(board);

const p2 = (n: number): string => String(n).padStart(2, '0');

/** yyyy-mm-dd (UTC). */
export function dayKeyUTC(date: Date): string {
  return `${date.getUTCFullYear()}-${p2(date.getUTCMonth() + 1)}-${p2(date.getUTCDate())}`;
}

/** ISO-8601 week key yyyy-Www (UTC): weeks start on Monday, week 1 holds the first Thursday. */
export function isoWeekKey(date: Date): string {
  const t = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - y0) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${p2(week)}`;
}

export function boardId(period: Period, date = new Date()): string {
  if (period === 'all') return 'time_all';
  return period === 'week' ? `time_week_${isoWeekKey(date)}` : `time_day_${dayKeyUTC(date)}`;
}

export function currentBoards(date = new Date()): string[] {
  return PERIODS.map((p) => boardId(p, date));
}

/** Sort: longest time first, then more kills, then earliest submission. */
export function compareEntries(a: LeaderboardEntry, b: LeaderboardEntry): number {
  return b.timeSec - a.timeSec || b.kills - a.kills || a.at - b.at;
}

export function isBetterEntry(
  next: Pick<LeaderboardEntry, 'timeSec' | 'kills'>,
  old: Pick<LeaderboardEntry, 'timeSec' | 'kills'>,
): boolean {
  return next.timeSec > old.timeSec || (next.timeSec === old.timeSec && next.kills > old.kills);
}

export interface RunResult {
  hero: string;
  timeSec: number;
  kills: number;
}

/** Whole seconds and kills within the bounds the rules accept. */
export function normalizeRun(r: RunResult): { timeSec: number; kills: number } {
  const timeSec = Math.max(0, Math.min(MAX_RUN_SEC, Math.floor(r.timeSec)));
  const kills = Math.max(
    0,
    Math.min(MAX_KILLS_BASE + timeSec * MAX_KILLS_PER_SEC, Math.floor(r.kills)),
  );
  return { timeSec, kills };
}

/** Read side shared by the cloud and local leaderboards. */
export interface LeaderboardView {
  readonly online: boolean;
  top(period: Period, n: number, hero?: string): Promise<LeaderboardEntry[]>;
  rank(period: Period): Promise<number | null>;
}

/**
 * Cloud leaderboard for the signed-in player. Remembers the player's bests per board (in memory,
 * seeded by one read) so finishing a run writes only where it improves.
 */
export class CloudLeaderboardService implements LeaderboardView {
  readonly online = true;
  private readonly bests = new Map<string, { timeSec: number; kills: number } | null>();

  constructor(
    private readonly backend: CloudBackend,
    private readonly player: () => { uid: string; nick: string; avatar: string } | null,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** Call when a run starts (anti-cheat timestamp). Never rejects. */
  async runStarted(): Promise<void> {
    const p = this.player();
    if (!p) return;
    try {
      await this.backend.markRunStart(p.uid);
    } catch (e) {
      console.warn('[leaderboard] run start not recorded', toCloudError(e).code);
    }
  }

  /** Submit a finished run to every current board where it improves. Returns improved boards. */
  async submitRun(run: RunResult): Promise<string[]> {
    const p = this.player();
    if (!p || !p.nick) return [];
    const { timeSec, kills } = normalizeRun(run);
    if (timeSec <= 0) return [];
    const improved: string[] = [];
    for (const board of currentBoards(this.clock())) {
      try {
        let best = this.bests.get(board);
        if (best === undefined) {
          best = await this.backend.leaderboard.get(board, p.uid);
          this.bests.set(board, best);
        }
        if (best && !isBetterEntry({ timeSec, kills }, best)) continue;
        const entry: LeaderboardSubmission = {
          uid: p.uid,
          nick: p.nick,
          avatar: p.avatar,
          hero: run.hero,
          timeSec,
          kills,
        };
        if (await this.backend.leaderboard.submit(board, entry)) improved.push(board);
        this.bests.set(board, { timeSec, kills });
      } catch (e) {
        console.warn('[leaderboard] submit failed', board, toCloudError(e).code);
      }
    }
    return improved;
  }

  top(period: Period, n: number, hero?: string): Promise<LeaderboardEntry[]> {
    return this.backend.leaderboard.top(boardId(period, this.clock()), n, hero);
  }

  async rank(period: Period): Promise<number | null> {
    const p = this.player();
    return p ? this.backend.leaderboard.rank(boardId(period, this.clock()), p.uid) : null;
  }
}

/**
 * Offline leaderboard built from the device save: one row per hero with the player's bests.
 * Periods are ignored (the save keeps all-time bests only).
 */
export class LocalLeaderboard implements LeaderboardView {
  readonly online = false;

  constructor(private readonly data: () => SaveData) {}

  entries(hero?: string): LeaderboardEntry[] {
    const s = this.data();
    const nick = s.profile.name || 'You';
    const rows: LeaderboardEntry[] = Object.entries(s.stats.perHero)
      .filter(([id, h]) => (!hero || id === hero) && h.runs > 0)
      .map(([id, h]) => ({
        uid: s.profile.id,
        nick,
        avatar: s.profile.avatar,
        hero: id,
        timeSec: Math.floor(h.bestTimeSec),
        kills: h.bestKills,
        at: 0,
      }));
    if (!rows.length && !hero && s.stats.bestTimeSec > 0) {
      // Saves from before per-hero stats: one overall row.
      rows.push({
        uid: s.profile.id,
        nick,
        avatar: s.profile.avatar,
        hero: s.loadout.hero,
        timeSec: Math.floor(s.stats.bestTimeSec),
        kills: s.stats.bestKills,
        at: 0,
      });
    }
    return rows.sort(compareEntries);
  }

  top(_period: Period, n: number, hero?: string): Promise<LeaderboardEntry[]> {
    return Promise.resolve(this.entries(hero).slice(0, n));
  }

  rank(): Promise<number | null> {
    return Promise.resolve(this.entries().length ? 1 : null);
  }
}
