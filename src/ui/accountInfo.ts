/** Pure text helpers for the Profile and Ranking screens (unit-tested; no canvas). */
import type { SaveData } from '../core/save';
import type { AuthState, SessionUser } from '../net/auth';
import type { SyncStatus } from '../net/cloudSave';

export interface AccountBadge {
  label: string;
  color: string;
}

/** The account state badge: Guest / Local profile / Google / Email / Offline cloud (device copy of a cloud account). */
export function accountBadge(
  user: SessionUser | null,
  state: AuthState,
  backendReady: boolean,
): AccountBadge {
  if (!user || state === 'signed-out') return { label: 'Not signed in', color: '#9a9aa8' };
  if (user.kind === 'guest') return { label: 'Guest', color: '#c8c8d0' };
  if (user.kind === 'local') return { label: 'Local profile', color: '#ffd84a' };
  if (!backendReady) return { label: 'Offline cloud', color: '#ff9a3a' };
  if (user.provider === 'google') return { label: 'Google', color: '#7dd0ff' };
  if (user.provider === 'memory') return { label: 'Demo account', color: '#c9a0ff' };
  return { label: 'Email', color: '#7dff9a' };
}

export function formatAgo(ms: number, now = Date.now()): string {
  if (!ms) return 'never';
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export interface SyncLine {
  text: string;
  color: string;
}

/** One line describing where the progress lives and whether it is synced. */
export function syncLine(
  status: SyncStatus,
  cloudAvailable: boolean,
  signedInCloud: boolean,
  lastSyncedAt: number,
  now = Date.now(),
): SyncLine {
  if (!signedInCloud) {
    return cloudAvailable
      ? { text: 'Saved on this device. Sign in to sync.', color: '#c8c8d0' }
      : { text: 'Cloud save disabled; playing locally.', color: '#c8c8d0' };
  }
  switch (status) {
    case 'syncing':
      return { text: 'Syncing...', color: '#7dd0ff' };
    case 'offline':
      return { text: 'Offline: will sync when back online.', color: '#ff9a3a' };
    case 'error':
      return { text: 'Sync problem: retrying soon.', color: '#ff8a8a' };
    case 'conflict':
      return { text: 'Two different saves: choose one.', color: '#ff8a8a' };
    case 'idle':
      return {
        text: lastSyncedAt ? `Synced ${formatAgo(lastSyncedAt, now)}.` : 'Synced.',
        color: '#7dff9a',
      };
    default:
      return { text: 'Saved on this device.', color: '#c8c8d0' };
  }
}

/** m:ss (h:mm:ss from one hour); '-' for nothing. */
export function formatClock(sec: number): string {
  if (!(sec > 0)) return '-';
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

/** Total play time: "1h 05m", "12m 30s", "0m". */
export function formatPlayTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${s}s`;
}

/** 1234567 -> "1.23M", 12345 -> "12.3k", otherwise the plain number. */
export function compactNumber(n: number): string {
  const v = Math.max(0, Math.floor(n));
  if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 1 : 2)}M`;
  if (v >= 1e4) return `${(v / 1e3).toFixed(v >= 1e5 ? 0 : 1)}k`;
  return String(v);
}

export interface LifetimeStats {
  runs: number;
  wins: number;
  kills: number;
  playSeconds: number;
  bestTimeSec: number;
  bestKills: number;
  bosses: number;
}

/** Lifetime numbers; v1 `records` are a floor (older code paths still bump them). */
export function lifetimeStats(s: SaveData): LifetimeStats {
  return {
    runs: Math.max(s.stats.runs, s.records.runs),
    wins: Math.max(s.stats.wins, s.records.wins),
    kills: s.stats.kills,
    playSeconds: s.stats.playSeconds,
    bestTimeSec: Math.max(s.stats.bestTimeSec, s.records.bestTimeSec),
    bestKills: Math.max(s.stats.bestKills, s.records.bestKills),
    bosses: s.stats.bosses,
  };
}
