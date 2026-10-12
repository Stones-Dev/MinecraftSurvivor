import { makeId, type SaveData } from '../core/save';
import type {
  AuthUser,
  CloudAuth,
  CloudBackend,
  CloudLeaderboard,
  LeaderboardEntry,
  LeaderboardSubmission,
  PublicProfile,
  RemoteSave,
} from './backend';
import { CloudError } from './errors';
import { compareEntries, isBetterEntry, validBoardId, RUN_TIME_SLACK_SEC } from './leaderboardCore';
import { nicknameError, normalizeNick } from './validate';

/**
 * In-memory CloudBackend: the test double for every net test and a demo backend (`?cloud=memory`).
 * It enforces the same semantics as firestore.rules (owner-only writes, revision checks, unique
 * nicknames, best-only leaderboard entries, elapsed-time anti-cheat) so tests exercise real rules.
 * Several backends can share one `MemoryServer` to simulate several devices.
 */
interface UserRecord {
  uid: string;
  email: string | null;
  password: string | null;
  displayName: string | null;
  provider: AuthUser['provider'];
}

interface ServerState {
  users: Record<string, UserRecord>;
  saves: Record<string, RemoteSave<unknown>>;
  profiles: Record<string, PublicProfile & { lower: string }>;
  names: Record<string, string>;
  runs: Record<string, number>;
  lb: Record<string, Record<string, LeaderboardEntry>>;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export class MemoryServer {
  state: ServerState = { users: {}, saves: {}, profiles: {}, names: {}, runs: {}, lb: {} };
  /** Server clock (ms); tests replace it. */
  now: () => number = () => Date.now();
  private lastTime = 0;

  constructor(
    private readonly storage: StorageLike | null = null,
    private readonly key = 'minesurvive.memcloud',
  ) {
    try {
      const text = storage?.getItem(key);
      if (text) this.state = { ...this.state, ...(JSON.parse(text) as Partial<ServerState>) };
    } catch {
      // Start empty.
    }
  }

  /** Strictly increasing server time, like Firestore's request.time across sequential writes. */
  time(): number {
    this.lastTime = Math.max(this.now(), this.lastTime + 1);
    return this.lastTime;
  }

  commit(): void {
    try {
      this.storage?.setItem(this.key, JSON.stringify(this.state));
    } catch {
      // Demo persistence only.
    }
  }
}

export interface MemoryBackendOptions {
  server?: MemoryServer;
  /** Simulated round trip in ms (0 = resolve on the next microtask). */
  latencyMs?: number;
  /** Persist the fake server and session to localStorage (demo mode). */
  persist?: boolean;
  /** Account returned by the simulated Google popup. */
  googleAccount?: { email: string; displayName: string };
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function safeLocalStorage(): StorageLike | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  } catch {
    return null;
  }
}

export class MemoryBackend implements CloudBackend {
  readonly kind = 'memory' as const;
  readonly server: MemoryServer;
  /** Simulate a lost connection: every call rejects with CloudError('network'). */
  offline = false;
  /** Simulate a blocked Google popup on the next sign-in. */
  popupBlocked = false;
  latencyMs: number;
  googleAccount: { email: string; displayName: string };
  /** Emails a password reset was sent to (tests). */
  readonly resetsSent: string[] = [];
  /** Number of calls that reached the server (tests). */
  calls = 0;
  private user: AuthUser | null = null;
  private readonly listeners = new Set<(u: AuthUser | null) => void>();
  private readonly sessionStorage: StorageLike | null;

  constructor(opts: MemoryBackendOptions = {}) {
    const storage = opts.persist ? safeLocalStorage() : null;
    this.server = opts.server ?? new MemoryServer(storage);
    this.latencyMs = opts.latencyMs ?? 0;
    this.googleAccount = opts.googleAccount ?? {
      email: 'player@example.com',
      displayName: 'Demo Player',
    };
    this.sessionStorage = storage;
    try {
      const uid = storage?.getItem('minesurvive.memcloud.session');
      const rec = uid ? this.server.state.users[uid] : undefined;
      if (rec) this.user = this.toUser(rec);
    } catch {
      // No session.
    }
  }

  private async call<T>(fn: () => T): Promise<T> {
    if (this.latencyMs > 0) await new Promise((r) => setTimeout(r, this.latencyMs));
    else await Promise.resolve();
    if (this.offline) throw new CloudError('network');
    this.calls++;
    const out = fn();
    this.server.commit();
    return out;
  }

  private toUser(r: UserRecord): AuthUser {
    return { uid: r.uid, email: r.email, displayName: r.displayName, provider: r.provider };
  }

  private setUser(u: AuthUser | null): void {
    this.user = u;
    try {
      this.sessionStorage?.setItem('minesurvive.memcloud.session', u?.uid ?? '');
    } catch {
      // Demo only.
    }
    for (const cb of [...this.listeners]) cb(u);
  }

  private requireOwner(uid: string): void {
    if (!this.user) throw new CloudError('not-signed-in');
    if (this.user.uid !== uid) throw new CloudError('permission');
  }

  readonly auth: CloudAuth = {
    current: () => this.user,
    ready: () => Promise.resolve(),
    onChange: (cb) => {
      this.listeners.add(cb);
      return () => this.listeners.delete(cb);
    },
    signInGoogle: async () => {
      if (this.popupBlocked) {
        this.popupBlocked = false;
        throw new CloudError('popup-blocked');
      }
      const u = await this.call(() => {
        const { email, displayName } = this.googleAccount;
        const users = Object.values(this.server.state.users);
        const found = users.find((x) => x.email === email && x.provider === 'google');
        const rec = found ?? {
          uid: `g-${makeId()}`,
          email,
          password: null,
          displayName,
          provider: 'google' as const,
        };
        this.server.state.users[rec.uid] = rec;
        return this.toUser(rec);
      });
      this.setUser(u);
      return u;
    },
    signInEmail: async (email, password) => {
      const u = await this.call(() => {
        const rec = Object.values(this.server.state.users).find(
          (x) => x.provider !== 'google' && x.email === email.trim().toLowerCase(),
        );
        if (!rec || rec.password !== password) throw new CloudError('invalid-credentials');
        return this.toUser(rec);
      });
      this.setUser(u);
      return u;
    },
    signUpEmail: async (email, password, displayName) => {
      const u = await this.call(() => {
        const mail = email.trim().toLowerCase();
        if (!EMAIL_RE.test(mail)) throw new CloudError('invalid-email');
        if (password.length < 6) throw new CloudError('weak-password');
        if (Object.values(this.server.state.users).some((x) => x.email === mail))
          throw new CloudError('email-in-use');
        const rec: UserRecord = {
          uid: `u-${makeId()}`,
          email: mail,
          password,
          displayName,
          provider: 'password',
        };
        this.server.state.users[rec.uid] = rec;
        return this.toUser(rec);
      });
      this.setUser(u);
      return u;
    },
    signOut: async () => {
      await Promise.resolve();
      this.setUser(null);
    },
    sendReset: (email) =>
      this.call(() => {
        if (!EMAIL_RE.test(email.trim())) throw new CloudError('invalid-email');
        this.resetsSent.push(email.trim().toLowerCase());
      }),
  };

  getSave(uid: string): Promise<RemoteSave<unknown> | null> {
    return this.call(() => {
      this.requireOwner(uid);
      const s = this.server.state.saves[uid];
      return s ? clone(s) : null;
    });
  }

  putSave(uid: string, save: SaveData, baseRev: number): Promise<RemoteSave> {
    return this.call(() => {
      this.requireOwner(uid);
      const cur = this.server.state.saves[uid];
      if ((cur?.v ?? 0) !== baseRev) throw new CloudError('conflict');
      const doc: RemoteSave = { save: clone(save), updatedAt: this.server.time(), v: baseRev + 1 };
      this.server.state.saves[uid] = clone(doc);
      return doc;
    });
  }

  getProfile(uid: string): Promise<PublicProfile | null> {
    return this.call(() => {
      if (!this.user) throw new CloudError('not-signed-in');
      const p = this.server.state.profiles[uid];
      return p ? { nick: p.nick, avatar: p.avatar } : null;
    });
  }

  nicknameAvailable(nick: string): Promise<boolean> {
    return this.call(() => {
      if (nicknameError(nick)) return false;
      return !this.server.state.names[normalizeNick(nick)];
    });
  }

  claimNickname(uid: string, nick: string, avatar?: string): Promise<boolean> {
    return this.call(() => {
      this.requireOwner(uid);
      if (nicknameError(nick)) throw new CloudError('invalid-nickname');
      const lower = normalizeNick(nick);
      const { names, profiles } = this.server.state;
      const holder = names[lower];
      if (holder && holder !== uid) return false;
      const prev = profiles[uid];
      if (prev && prev.lower !== lower && names[prev.lower] === uid) delete names[prev.lower];
      names[lower] = uid;
      profiles[uid] = { nick: nick.trim(), lower, avatar: avatar ?? prev?.avatar ?? 'steve' };
      return true;
    });
  }

  setProfile(uid: string, profile: PublicProfile): Promise<void> {
    return this.call(() => {
      this.requireOwner(uid);
      const lower = normalizeNick(profile.nick);
      if (this.server.state.names[lower] !== uid) throw new CloudError('permission');
      this.server.state.profiles[uid] = { nick: profile.nick.trim(), lower, avatar: profile.avatar };
    });
  }

  markRunStart(uid: string): Promise<void> {
    return this.call(() => {
      this.requireOwner(uid);
      this.server.state.runs[uid] = this.server.time();
    });
  }

  readonly leaderboard: CloudLeaderboard = {
    submit: (board: string, entry: LeaderboardSubmission) =>
      this.call(() => {
        this.requireOwner(entry.uid);
        if (!validBoardId(board)) throw new CloudError('permission');
        const now = this.server.time();
        // Mirrors the rules: a time cannot exceed the real time since the run started (+ slack),
        // and the nickname must be the player's claimed one.
        const started = this.server.state.runs[entry.uid];
        if (started === undefined || entry.timeSec > (now - started) / 1000 + RUN_TIME_SLACK_SEC)
          throw new CloudError('permission');
        if (this.server.state.profiles[entry.uid]?.nick !== entry.nick)
          throw new CloudError('permission');
        const table = (this.server.state.lb[board] ??= {});
        const old = table[entry.uid];
        if (old && !isBetterEntry(entry, old)) return false;
        table[entry.uid] = { ...entry, at: now };
        return true;
      }),
    top: (board, n, hero) =>
      this.call(() => {
        if (!this.user) throw new CloudError('not-signed-in');
        return Object.values(this.server.state.lb[board] ?? {})
          .filter((e) => !hero || e.hero === hero)
          .sort(compareEntries)
          .slice(0, Math.max(0, n))
          .map((e) => ({ ...e }));
      }),
    rank: (board, uid) =>
      this.call(() => {
        if (!this.user) throw new CloudError('not-signed-in');
        const table = this.server.state.lb[board] ?? {};
        const mine = table[uid];
        if (!mine) return null;
        return 1 + Object.values(table).filter((e) => e.timeSec > mine.timeSec).length;
      }),
    get: (board, uid) =>
      this.call(() => {
        if (!this.user) throw new CloudError('not-signed-in');
        const e = this.server.state.lb[board]?.[uid];
        return e ? { ...e } : null;
      }),
  };
}
