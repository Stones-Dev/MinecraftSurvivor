import type { SaveData } from '../core/save';
import { cloudConfigured, firebaseConfig } from './config';

/**
 * Cloud backend abstraction. The game only talks to `CloudBackend`; `FirebaseBackend` is the real
 * one (loaded lazily so the Firebase SDK lives in its own chunk) and `MemoryBackend` is an
 * in-memory fake for tests and the `?cloud=memory` demo. Every method rejects with a `CloudError`.
 *
 * Firestore layout (see firestore.rules):
 *   saves/{uid}          { save, updatedAt, v }      v = revision, +1 per write
 *   profiles/{uid}       { nick, lower, avatar, at }
 *   names/{lower}        { uid }                     unique nickname claims
 *   runs/{uid}           { startedAt }               server time of the current run (anti-cheat)
 *   lb/{board}/e/{uid}   LeaderboardEntry            one best entry per player and board
 */
export type AuthProvider = 'google' | 'password' | 'memory';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  provider: AuthProvider;
}

/** A save as stored remotely. `v` is the revision (1 on create, +1 on every write). */
export interface RemoteSave<T = SaveData> {
  save: T;
  /** Server time of the last write (ms). */
  updatedAt: number;
  v: number;
}

export interface PublicProfile {
  nick: string;
  avatar: string;
}

export interface LeaderboardEntry {
  uid: string;
  nick: string;
  /** Hero id used as the avatar. */
  avatar: string;
  /** Hero played in this run (per-hero filter). */
  hero: string;
  timeSec: number;
  kills: number;
  /** Server time of the submission (ms). */
  at: number;
}

export type LeaderboardSubmission = Omit<LeaderboardEntry, 'at'>;

export interface CloudAuth {
  current(): AuthUser | null;
  /** Resolves once the persisted session (if any) has been restored. */
  ready(): Promise<void>;
  onChange(cb: (user: AuthUser | null) => void): () => void;
  signInGoogle(): Promise<AuthUser>;
  signInEmail(email: string, password: string): Promise<AuthUser>;
  signUpEmail(email: string, password: string, displayName: string): Promise<AuthUser>;
  signOut(): Promise<void>;
  sendReset(email: string): Promise<void>;
}

export interface CloudLeaderboard {
  /** Store the entry only if it beats the player's current one; resolves true when it did. */
  submit(board: string, entry: LeaderboardSubmission): Promise<boolean>;
  /** Best entries, longest time first (ties: more kills first). `hero` filters by hero. */
  top(board: string, n: number, hero?: string): Promise<LeaderboardEntry[]>;
  /** 1-based position of the player's entry, or null when they have none. */
  rank(board: string, uid: string): Promise<number | null>;
  get(board: string, uid: string): Promise<LeaderboardEntry | null>;
}

export interface CloudBackend {
  readonly kind: 'firebase' | 'memory';
  readonly auth: CloudAuth;
  /** The raw remote save (migrate it before use), or null when the account has none. */
  getSave(uid: string): Promise<RemoteSave<unknown> | null>;
  /**
   * Write the save if the remote revision still equals `baseRev` (0 = no remote save yet);
   * otherwise reject with CloudError('conflict') so a newer remote is never overwritten.
   */
  putSave(uid: string, save: SaveData, baseRev: number): Promise<RemoteSave>;
  getProfile(uid: string): Promise<PublicProfile | null>;
  nicknameAvailable(nick: string): Promise<boolean>;
  /**
   * Claim `nick` (unique, case-insensitive) for `uid` and make it the profile nickname, releasing
   * the previous one. Resolves false when someone else holds it.
   */
  claimNickname(uid: string, nick: string, avatar?: string): Promise<boolean>;
  /** Update the public profile; `nick` must be the one the player already claimed. */
  setProfile(uid: string, profile: PublicProfile): Promise<void>;
  /** Record the server time at which a run starts (leaderboard anti-cheat). */
  markRunStart(uid: string): Promise<void>;
  readonly leaderboard: CloudLeaderboard;
}

export interface LoadBackendOptions {
  /** Use the in-memory demo backend when Firebase is not configured (dev/demo: `?cloud=memory`). */
  memoryFallback?: boolean;
  /** Simulated latency for the memory backend. */
  latencyMs?: number;
}

let pending: Promise<CloudBackend | null> | null = null;

/**
 * The cloud backend for this build, or null when none is configured or the SDK fails to load
 * (offline first visit, blocked script). The Firebase SDK is only fetched here, through a dynamic
 * import, so the main bundle never includes it. Never rejects.
 */
export function loadBackend(opts: LoadBackendOptions = {}): Promise<CloudBackend | null> {
  if (pending) return pending;
  const load = async (): Promise<CloudBackend | null> => {
    if (cloudConfigured && firebaseConfig) {
      try {
        const mod = await import('./firebaseBackend');
        return mod.createFirebaseBackend(firebaseConfig);
      } catch (e) {
        console.warn('[cloud] Firebase failed to load; staying local.', e);
        pending = null; // allow a later retry (e.g. when back online)
        return null;
      }
    }
    if (opts.memoryFallback) {
      const mod = await import('./memoryBackend');
      return new mod.MemoryBackend({ latencyMs: opts.latencyMs ?? 250, persist: true });
    }
    return null;
  };
  pending = load();
  return pending;
}
