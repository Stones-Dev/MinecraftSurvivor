/**
 * Daily and weekly missions plus the daily login reward: pure functions over a SaveData.
 *
 * - Days and weeks are LOCAL time (a day ends at the player's midnight; weeks start on Monday).
 * - The sets are rolled deterministically from the date key (and the heroes the player owns, so a
 *   class mission is never impossible), so everybody who owns the same heroes sees the same missions.
 * - Progress comes from a finished run (`applyRunToMissions`) or a meta event (`applyMetaToMissions`).
 * - Everything read from the save is re-validated: unknown ids are dropped, progress is clamped.
 */
import { Rng } from '../core/rng';
import type { MissionProgress, SaveData } from '../core/save';
import {
  DAILY_LOGIN_REWARDS,
  DAILY_MISSIONS,
  ENEMY_GROUPS,
  MISSION_BY_ID,
  WEEKLY_MISSIONS,
  type MissionDef,
  type MissionKind,
  type MissionReward,
} from '../data/missions';
import { biomesVisited, bumpCounter, maxCounter, type RunRecord } from './runStats';

export const DAILY_COUNT = 3;
export const WEEKLY_COUNT = 2;
/** Rerolls granted with every new daily set (they can be used on daily or weekly missions). */
export const DAILY_REROLLS = 2;
/** Local clocks outside this window are ignored (unset or absurd). */
export const CLOCK_MIN = Date.UTC(2024, 0, 1);
export const CLOCK_MAX = Date.UTC(2100, 0, 1);
/** A stored day this far in the future cannot be a legitimate "yesterday": treat it as stale. */
const FAR_FUTURE_DAYS = 30;

const p2 = (n: number): string => String(n).padStart(2, '0');

export const clockValid = (now: number): boolean =>
  Number.isFinite(now) && now >= CLOCK_MIN && now < CLOCK_MAX;

/** yyyy-mm-dd of `now` in the local time zone. */
export function localDayKey(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/** ISO-8601 week key (yyyy-Www) of the local calendar date: weeks start on Monday. */
export function localWeekKey(now: number): string {
  const l = new Date(now);
  const t = new Date(Date.UTC(l.getFullYear(), l.getMonth(), l.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - y0) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${p2(week)}`;
}

/** Whole days since 1970-01-01 of a yyyy-mm-dd key (calendar arithmetic, immune to DST). */
export function dayNumber(key: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return Number.NaN;
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000);
}

/** Monotonic number for a yyyy-Www key (NaN when malformed). */
export function weekNumber(key: string): number {
  const m = /^(\d{4})-W(\d{2})$/.exec(key);
  return m ? Number(m[1]) * 53 + Number(m[2]) : Number.NaN;
}

/** Milliseconds until the next local midnight (daily) or the next local Monday 00:00 (weekly). */
export function msUntilReset(kind: MissionKind, now: number): number {
  const d = new Date(now);
  const add = kind === 'daily' ? 1 : 8 - (d.getDay() || 7);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + add).getTime() - now;
}

function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

const poolOf = (kind: MissionKind): readonly MissionDef[] =>
  kind === 'daily' ? DAILY_MISSIONS : WEEKLY_MISSIONS;
const countOf = (kind: MissionKind): number => (kind === 'daily' ? DAILY_COUNT : WEEKLY_COUNT);

/** Hero ids the save owns (class missions are only rolled for owners). */
const ownedHeroes = (save: SaveData): string[] => Object.keys(save.owned);

const eligible = (def: MissionDef, owned: readonly string[]): boolean =>
  !def.heroes || def.heroes.some((h) => owned.includes(h));

/**
 * Deterministic pick of `count` templates from `seedKey`: shuffled by a seeded rng, preferring
 * distinct metrics, skipping `taken` ids. Pure.
 */
export function rollMissionIds(
  kind: MissionKind,
  seedKey: string,
  owned: readonly string[],
  count: number,
  taken: readonly string[] = [],
): string[] {
  const rng = new Rng(hashStr(`${kind}|${seedKey}`));
  const pool = poolOf(kind).filter((d) => eligible(d, owned) && !taken.includes(d.id));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const a = pool[i];
    const b = pool[j];
    if (a && b) {
      pool[i] = b;
      pool[j] = a;
    }
  }
  const metrics = new Set(
    taken.map((id) => MISSION_BY_ID.get(id)?.metric).filter((m): m is string => !!m),
  );
  const out: string[] = [];
  for (const d of pool) {
    if (out.length >= count) break;
    if (metrics.has(d.metric)) continue;
    metrics.add(d.metric);
    out.push(d.id);
  }
  for (const d of pool) {
    if (out.length >= count) break;
    if (!out.includes(d.id)) out.push(d.id);
  }
  return out;
}

const fresh = (id: string): MissionProgress => ({ id, progress: 0, claimed: false });

/** Add a reward to the save's wallet (capped like the save sanitizer). */
export function grantReward(save: SaveData, r: MissionReward): void {
  const cap = (v: number): number => Math.min(1e9, Math.max(0, Math.floor(v)));
  const c = save.currencies;
  c.emeralds = cap(c.emeralds + (r.emeralds ?? 0));
  c.spawnEggs = cap(c.spawnEggs + (r.spawnEggs ?? 0));
  c.rareSpawnEggs = cap(c.rareSpawnEggs + (r.rareSpawnEggs ?? 0));
}

const addReward = (a: MissionReward, b: MissionReward): MissionReward => ({
  emeralds: (a.emeralds ?? 0) + (b.emeralds ?? 0),
  spawnEggs: (a.spawnEggs ?? 0) + (b.spawnEggs ?? 0),
  rareSpawnEggs: (a.rareSpawnEggs ?? 0) + (b.rareSpawnEggs ?? 0),
});

/** Drop unknown/duplicate entries and clamp progress to the template's target. */
function cleanList(list: MissionProgress[], kind: MissionKind): MissionProgress[] {
  const seen = new Set<string>();
  const out: MissionProgress[] = [];
  for (const m of list) {
    const def = MISSION_BY_ID.get(m.id);
    if (!def || def.kind !== kind || seen.has(m.id)) continue;
    seen.add(m.id);
    const progress = Number.isFinite(m.progress)
      ? Math.min(def.target, Math.max(0, Math.floor(m.progress)))
      : 0;
    // A claimed mission is by definition complete.
    out.push({
      id: m.id,
      progress: m.claimed === true ? def.target : progress,
      claimed: m.claimed === true,
    });
  }
  return out.slice(0, countOf(kind));
}

export interface Rollover {
  dailyRolled: boolean;
  weeklyRolled: boolean;
  /** Rewards of completed-but-unclaimed missions of the sets that just expired (granted automatically). */
  autoClaimed: MissionReward;
  /** True when anything in `save.missions` changed (the caller should save). */
  changed: boolean;
}

function stale(cur: number, today: number): boolean {
  // Unset or malformed -> roll. Older than today -> roll. Slightly in the future (clock moved back):
  // keep, the clock never rewinds a set. Far in the future (a clock that was set ahead): treat as stale.
  if (!Number.isFinite(cur)) return true;
  return cur < today || cur - today > FAR_FUTURE_DAYS;
}

/**
 * Make `save.missions` current for `now`: validate what is stored, roll a new daily set when the local
 * day changed (and a weekly set when the ISO week changed), refill missing slots. Idempotent.
 */
export function ensureMissions(save: SaveData, now: number): Rollover {
  const before = JSON.stringify(save.missions);
  const out: Rollover = {
    dailyRolled: false,
    weeklyRolled: false,
    autoClaimed: {},
    changed: false,
  };
  const m = save.missions;
  m.daily = cleanList(m.daily, 'daily');
  m.weekly = cleanList(m.weekly, 'weekly');
  if (clockValid(now)) {
    const owned = ownedHeroes(save);
    const today = localDayKey(now);
    const week = localWeekKey(now);
    const expire = (list: MissionProgress[]): void => {
      for (const e of list) {
        const def = MISSION_BY_ID.get(e.id);
        if (def && !e.claimed && e.progress >= def.target) {
          grantReward(save, def.reward);
          out.autoClaimed = addReward(out.autoClaimed, def.reward);
          bumpCounter(save, 'missionsClaimed', 1);
        }
      }
    };
    if (stale(dayNumber(m.day), dayNumber(today))) {
      expire(m.daily);
      m.day = today;
      m.daily = rollMissionIds('daily', today, owned, DAILY_COUNT).map(fresh);
      m.rerollsLeft = DAILY_REROLLS;
      out.dailyRolled = true;
    }
    if (stale(weekNumber(m.weekKey), weekNumber(week))) {
      expire(m.weekly);
      m.weekKey = week;
      m.weekly = rollMissionIds('weekly', week, owned, WEEKLY_COUNT).map(fresh);
      out.weeklyRolled = true;
    }
    // Refill a set that lost entries (tampered or from an older template list).
    for (const kind of ['daily', 'weekly'] as const) {
      const list = kind === 'daily' ? m.daily : m.weekly;
      const need = countOf(kind) - list.length;
      if (need > 0) {
        const key = kind === 'daily' ? m.day : m.weekKey;
        const extra = rollMissionIds(
          kind,
          `${key}|fill`,
          owned,
          need,
          list.map((e) => e.id),
        );
        list.push(...extra.map(fresh));
      }
    }
  }
  out.changed = JSON.stringify(save.missions) !== before;
  return out;
}

export interface MissionView {
  def: MissionDef;
  progress: number;
  claimed: boolean;
  done: boolean;
}

/** The stored missions of a kind with their templates (unknown ids are skipped). */
export function missionViews(save: SaveData, kind: MissionKind): MissionView[] {
  const list = kind === 'daily' ? save.missions.daily : save.missions.weekly;
  const out: MissionView[] = [];
  for (const e of list) {
    const def = MISSION_BY_ID.get(e.id);
    if (!def || def.kind !== kind) continue;
    const progress = Math.min(def.target, Math.max(0, Math.floor(e.progress) || 0));
    out.push({ def, progress, claimed: e.claimed, done: progress >= def.target });
  }
  return out;
}

/** Flat metrics of one finished run, keyed like the templates' `metric`. */
export function runSample(rec: RunRecord): Record<string, number> {
  const s: Record<string, number> = {
    kills: rec.kills,
    timeSec: Math.floor(rec.timeSec),
    level: rec.level,
    bosses: rec.bosses,
    minis: rec.minis,
    abilityCasts: rec.abilityCasts,
    emeraldsPicked: rec.emeraldsPicked,
    eggsFound: rec.eggsFound + rec.rareEggsFound,
    rescues: rec.rescues,
    trades: rec.trades,
    rifts: rec.rifts,
    damageDealt: rec.damageDealt,
    itemsUsed: rec.itemsUsed,
    biomes: biomesVisited(rec.timeByBiome).length,
    runs: 1,
    wins: rec.won ? 1 : 0,
  };
  for (const [id, n] of Object.entries(rec.killsByType)) s[`kills.${id}`] = n;
  for (const [group, ids] of Object.entries(ENEMY_GROUPS)) {
    s[`kills.${group}`] = ids.reduce((a, id) => a + (rec.killsByType[id] ?? 0), 0);
  }
  for (const [b, sec] of Object.entries(rec.timeByBiome)) s[`sec.${b}`] = Math.floor(sec);
  for (const [k, n] of Object.entries(rec.struct ?? {})) s[`struct.${k}`] = n;
  return s;
}

export interface MissionChange {
  kind: MissionKind;
  id: string;
  text: string;
  before: number;
  after: number;
  target: number;
  completedNow: boolean;
}

function applyTo(
  list: MissionProgress[],
  kind: MissionKind,
  sample: Readonly<Record<string, number>>,
  hero: string | null,
): MissionChange[] {
  const out: MissionChange[] = [];
  for (const e of list) {
    const def = MISSION_BY_ID.get(e.id);
    if (!def || def.kind !== kind || e.claimed) continue;
    if (def.heroes && (hero === null || !def.heroes.includes(hero))) continue;
    const raw = sample[def.metric];
    const v = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
    if (v <= 0) continue;
    const before = Math.min(def.target, Math.max(0, Math.floor(e.progress) || 0));
    const next = def.mode === 'sum' ? before + v : Math.max(before, v);
    const after = Math.min(def.target, next);
    if (after === before) continue;
    e.progress = after;
    out.push({
      kind,
      id: def.id,
      text: def.text,
      before,
      after,
      target: def.target,
      completedNow: before < def.target && after >= def.target,
    });
  }
  return out;
}

/** Credit a finished run to today's missions (rolling the sets first). Returns what moved. */
export function applyRunToMissions(save: SaveData, rec: RunRecord, now: number): MissionChange[] {
  ensureMissions(save, now);
  const sample = runSample(rec);
  return [
    ...applyTo(save.missions.daily, 'daily', sample, rec.hero),
    ...applyTo(save.missions.weekly, 'weekly', sample, rec.hero),
  ];
}

/** Credit a meta event (`{ eggsOpened: 3 }`) to the missions; no hero filter applies. */
export function applyMetaToMissions(
  save: SaveData,
  sample: Readonly<Record<string, number>>,
  now: number,
): MissionChange[] {
  ensureMissions(save, now);
  return [
    ...applyTo(save.missions.daily, 'daily', sample, null),
    ...applyTo(save.missions.weekly, 'weekly', sample, null),
  ];
}

export interface MissionPreview {
  kind: MissionKind;
  def: MissionDef;
  progress: number;
  projected: number;
}

/** What today's missions would read if `rec` ended now (no mutation): used by the pause screen. */
export function missionPreview(save: SaveData, rec: RunRecord): MissionPreview[] {
  const clone = (l: MissionProgress[]): MissionProgress[] => l.map((e) => ({ ...e }));
  const sample = runSample(rec);
  const out: MissionPreview[] = [];
  for (const kind of ['daily', 'weekly'] as const) {
    const base = clone(kind === 'daily' ? save.missions.daily : save.missions.weekly);
    const moved = clone(base);
    applyTo(moved, kind, sample, rec.hero);
    for (const e of base) {
      const def = MISSION_BY_ID.get(e.id);
      if (!def || def.kind !== kind || e.claimed) continue;
      const after = moved.find((x) => x.id === e.id);
      out.push({
        kind,
        def,
        progress: Math.min(def.target, Math.max(0, Math.floor(e.progress) || 0)),
        projected: after?.progress ?? e.progress,
      });
    }
  }
  return out;
}

export type ClaimResult =
  { ok: true; reward: MissionReward } | { ok: false; reason: 'unknown' | 'not-done' | 'claimed' };

/** Claim a completed mission. Idempotent: a second claim changes nothing. */
export function claimMission(save: SaveData, kind: MissionKind, id: string): ClaimResult {
  const list = kind === 'daily' ? save.missions.daily : save.missions.weekly;
  const e = list.find((x) => x.id === id);
  const def = MISSION_BY_ID.get(id);
  if (!e || !def || def.kind !== kind) return { ok: false, reason: 'unknown' };
  if (e.claimed) return { ok: false, reason: 'claimed' };
  if (!(Math.floor(e.progress) >= def.target)) return { ok: false, reason: 'not-done' };
  e.claimed = true;
  e.progress = def.target;
  grantReward(save, def.reward);
  bumpCounter(save, 'missionsClaimed', 1);
  return { ok: true, reward: def.reward };
}

/**
 * Swap an unfinished, unclaimed mission for another template. Uses one of `rerollsLeft`. The new
 * template is picked deterministically from the date, the slot and the number of rerolls used, and
 * is never one that is already in the set (so the swapped-out template does not come back).
 */
export function rerollMission(save: SaveData, kind: MissionKind, id: string): boolean {
  const m = save.missions;
  if (m.rerollsLeft <= 0) return false;
  const list = kind === 'daily' ? m.daily : m.weekly;
  const slot = list.findIndex((x) => x.id === id);
  const def = MISSION_BY_ID.get(id);
  const e = list[slot];
  if (slot < 0 || !e || !def || e.claimed || e.progress >= def.target) return false;
  const key = kind === 'daily' ? m.day : m.weekKey;
  const used = Math.max(0, DAILY_REROLLS - m.rerollsLeft);
  const taken = list.map((x) => x.id);
  const next = rollMissionIds(
    kind,
    `${key}|reroll|${slot}|${used}`,
    ownedHeroes(save),
    1,
    taken,
  )[0];
  if (!next) return false;
  list[slot] = fresh(next);
  m.rerollsLeft -= 1;
  bumpCounter(save, 'rerolls', 1);
  return true;
}

/** Completed-but-unclaimed missions, plus one when the daily login reward can be claimed. */
export function missionsClaimable(save: SaveData, now: number = Date.now()): number {
  let n = 0;
  for (const kind of ['daily', 'weekly'] as const) {
    for (const v of missionViews(save, kind)) if (v.done && !v.claimed) n++;
  }
  if (dailyRewardState(save, now).canClaim) n++;
  return n;
}

// ---------------------------------------------------------------------------------------------
// Daily login reward
// ---------------------------------------------------------------------------------------------

export type DailyStatus = 'ready' | 'claimed' | 'clock-behind' | 'clock-invalid';

export interface DailyRewardState {
  status: DailyStatus;
  canClaim: boolean;
  /** Consecutive days claimed that are still alive (0 after a missed day). */
  streak: number;
  /** Day of the 7-day cycle (1..7) that the next claim grants (or, once claimed, the one just granted). */
  day: number;
  /** Days of the current cycle already claimed (0..7), for the strip. */
  done: number;
  reward: MissionReward;
  /** Streak the save will hold after a claim now. */
  nextStreak: number;
  /** True when the player skipped at least one day since the last claim. */
  broken: boolean;
}

const cycleDay = (streak: number): number => ((Math.max(1, streak) - 1) % 7) + 1;
const rewardFor = (streak: number): MissionReward =>
  DAILY_LOGIN_REWARDS[cycleDay(streak) - 1] ?? {};

/**
 * Where the login reward stands at `now`. Clock safety: a clock outside 2024..2100 is ignored; a
 * clock that went back never grants (and never rewinds the streak); a stored claim day absurdly far
 * in the future (a clock that was once set ahead) is discarded so the player is not locked out.
 */
export function dailyRewardState(save: SaveData, now: number): DailyRewardState {
  const dr = save.dailyReward;
  const streak = Math.max(0, Math.floor(dr.streak) || 0);
  const mk = (
    status: DailyStatus,
    live: number,
    nextStreak: number,
    done: number,
    broken: boolean,
  ): DailyRewardState => ({
    status,
    canClaim: status === 'ready',
    streak: live,
    day: cycleDay(status === 'claimed' ? live : nextStreak),
    done,
    reward: rewardFor(status === 'claimed' ? live : nextStreak),
    nextStreak,
    broken,
  });
  if (!clockValid(now)) return mk('clock-invalid', streak, streak + 1, streak % 7, false);
  const last = dayNumber(dr.lastClaimDay);
  if (!Number.isFinite(last) || streak <= 0) return mk('ready', 0, 1, 0, false);
  const gap = dayNumber(localDayKey(now)) - last;
  if (gap === 0) return mk('claimed', streak, streak, cycleDay(streak), false);
  if (gap < 0) {
    if (-gap > FAR_FUTURE_DAYS) return mk('ready', 0, 1, 0, true);
    return mk('clock-behind', streak, streak + 1, streak % 7, false);
  }
  if (gap === 1) return mk('ready', streak, streak + 1, streak % 7, false);
  return mk('ready', 0, 1, 0, true);
}

export type DailyClaim =
  | { ok: true; reward: MissionReward; streak: number; day: number }
  | { ok: false; reason: DailyStatus };

/** Claim today's login reward. Idempotent within a day; the streak only ever moves forward by one. */
export function claimDailyReward(save: SaveData, now: number): DailyClaim {
  const st = dailyRewardState(save, now);
  if (!st.canClaim) return { ok: false, reason: st.status };
  save.dailyReward.lastClaimDay = localDayKey(now);
  save.dailyReward.streak = Math.min(100000, st.nextStreak);
  grantReward(save, st.reward);
  bumpCounter(save, 'dailyClaims', 1);
  maxCounter(save, 'best.streak', save.dailyReward.streak);
  return { ok: true, reward: st.reward, streak: save.dailyReward.streak, day: st.day };
}
