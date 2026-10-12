import { DEFAULT_AVATAR, makeId } from '../core/save';
import type { AuthProvider, AuthUser, CloudBackend } from './backend';
import { AuthError, CloudError, toCloudError } from './errors';
import {
  emailError,
  localNameError,
  nicknameError,
  passwordError,
  suggestNickname,
} from './validate';

/**
 * The account service the UI talks to. Four states:
 *   signed-out  nothing chosen yet (show the auth overlay)
 *   guest       anonymous; progress stays in the device save only
 *   local       a local profile (name + avatar in localStorage, no password, works offline)
 *   cloud       a Firebase account (Google or email/password) with a unique nickname
 * The chosen session is remembered across reloads. Every method that can fail throws `AuthError`
 * with a `code` the overlay turns into a message; cloud methods throw 'not-configured' when this
 * build has no Firebase project (`cloudAvailable` is then false).
 */
export type AuthState = 'signed-out' | 'guest' | 'local' | 'cloud';

export interface SessionUser {
  kind: 'guest' | 'local' | 'cloud';
  /** Firebase uid (cloud), local profile id (local) or 'guest'. */
  id: string;
  /** Nickname (cloud), profile name (local) or 'Guest'. */
  name: string;
  /** Hero id. */
  avatar: string;
  email: string | null;
  provider: AuthProvider | 'local' | 'guest';
  /** Cloud account that has no claimed nickname yet: ask for one and call `setNickname`. */
  needsNickname: boolean;
}

export interface LocalProfile {
  id: string;
  name: string;
  avatar: string;
}

type StoredSession =
  | { kind: 'guest' }
  | { kind: 'local' }
  | {
      kind: 'cloud';
      uid: string;
      nick: string;
      avatar: string;
      email: string | null;
      provider: AuthProvider;
    };

type StorageLike = Pick<Storage, 'getItem' | 'setItem'> & Partial<Pick<Storage, 'removeItem'>>;

export interface AuthServiceOptions {
  storage: StorageLike | null;
  /** Whether this build has cloud accounts (`cloudConfigured` from ./config). */
  configured: boolean;
  /** Lazily loads the backend (`loadBackend` from ./backend). */
  loadBackend: () => Promise<CloudBackend | null>;
  keyPrefix?: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export class AuthService {
  private stateValue: AuthState = 'signed-out';
  private current: SessionUser | null = null;
  private backendValue: CloudBackend | null = null;
  private backendLoad: Promise<CloudBackend | null> | null = null;
  private loadFailed = false;
  private unsubBackend: (() => void) | null = null;
  private readonly cbs = new Set<(u: SessionUser | null, s: AuthState) => void>();
  private readonly storage: StorageLike | null;
  private readonly configured: boolean;
  private readonly loader: () => Promise<CloudBackend | null>;
  private readonly sessionKey: string;
  private readonly profileKey: string;
  private readonly redirectKey: string;

  constructor(opts: AuthServiceOptions) {
    this.storage = opts.storage;
    this.configured = opts.configured;
    this.loader = opts.loadBackend;
    const p = opts.keyPrefix ?? 'minesurvive';
    this.sessionKey = `${p}.session`;
    this.profileKey = `${p}.localProfile`;
    this.redirectKey = `${p}.session.redirect`;
  }

  // ---------- state ----------

  get state(): AuthState {
    return this.stateValue;
  }

  user(): SessionUser | null {
    return this.current;
  }

  /** Cloud accounts can be used on this deployment (configured and the SDK loaded or loadable). */
  get cloudAvailable(): boolean {
    return this.configured && !this.loadFailed;
  }

  /** The loaded backend (cloud sessions), for wiring the save store and leaderboards. */
  get backend(): CloudBackend | null {
    return this.backendValue;
  }

  onChange(cb: (u: SessionUser | null, s: AuthState) => void): () => void {
    this.cbs.add(cb);
    return () => this.cbs.delete(cb);
  }

  /** The local profile stored on this device (even when signed out), for "Continue as ...". */
  localProfile(): LocalProfile | null {
    const raw = this.readJson(this.profileKey);
    if (!isRecord(raw)) return null;
    const { id, name, avatar } = raw;
    if (typeof id !== 'string' || typeof name !== 'string' || localNameError(name)) return null;
    return { id, name: name.trim(), avatar: typeof avatar === 'string' ? avatar : DEFAULT_AVATAR };
  }

  // ---------- session ----------

  /** Restore the remembered session. Never rejects; resolves with the restored user (or null). */
  async init(): Promise<SessionUser | null> {
    const s = this.readSession();
    const redirecting = this.read(this.redirectKey) === '1';
    if (s?.kind === 'guest') this.setGuest();
    else if (s?.kind === 'local') {
      const p = this.localProfile();
      if (p) this.setLocal(p);
    }
    if (this.configured && (s?.kind === 'cloud' || redirecting)) {
      this.remove(this.redirectKey);
      const backend = await this.ensureBackend().catch(() => null);
      if (!backend) {
        // SDK unavailable (offline first load): keep playing on the account's device copy.
        if (s?.kind === 'cloud') this.setCloudOffline(s);
        return this.current;
      }
      try {
        await backend.auth.ready();
      } catch {
        // Treat as signed out below.
      }
      const u = backend.auth.current();
      if (u && (redirecting || (s?.kind === 'cloud' && u.uid === s.uid))) {
        await this.finishCloud(u).catch(() => undefined);
      } else if (s?.kind === 'cloud') {
        this.clearSession();
      }
    }
    return this.current;
  }

  /** Start fetching the cloud SDK early (call when the auth overlay opens) so popups stay fast. */
  preload(): void {
    if (this.configured) void this.ensureBackend().catch(() => undefined);
  }

  async signInGoogle(): Promise<SessionUser> {
    const backend = await this.requireBackend();
    let u: AuthUser;
    try {
      u = await backend.auth.signInGoogle();
    } catch (e) {
      const err = toAuthError(e);
      if (err.code === 'redirecting') this.write(this.redirectKey, '1');
      throw err;
    }
    return this.finishCloud(u);
  }

  async signInEmail(email: string, password: string): Promise<SessionUser> {
    const bad = emailError(email);
    if (bad) throw new AuthError(bad);
    if (!password) throw new AuthError('invalid-credentials');
    const backend = await this.requireBackend();
    const u = await wrap(() => backend.auth.signInEmail(email.trim(), password));
    return this.finishCloud(u);
  }

  /**
   * Create an email/password account with a unique nickname. If the nickname is grabbed between the
   * availability check and the claim, the account is still created and `needsNickname` is set.
   */
  async signUpEmail(
    email: string,
    password: string,
    nick: string,
    avatar = DEFAULT_AVATAR,
  ): Promise<SessionUser> {
    const bad = emailError(email) ?? passwordError(password) ?? nicknameError(nick);
    if (bad) throw new AuthError(bad);
    const backend = await this.requireBackend();
    if (!(await wrap(() => backend.nicknameAvailable(nick)))) throw new AuthError('nickname-taken');
    const u = await wrap(() => backend.auth.signUpEmail(email.trim(), password, nick.trim()));
    try {
      await backend.claimNickname(u.uid, nick.trim(), avatar);
    } catch {
      // Finished below: the profile read shows whether the claim landed.
    }
    return this.finishCloud(u);
  }

  /** Is this nickname free? Resolves false for invalid nicknames; throws when offline/not configured. */
  async nicknameAvailable(nick: string): Promise<boolean> {
    if (nicknameError(nick)) return false;
    const backend = await this.requireBackend();
    return wrap(() => backend.nicknameAvailable(nick.trim()));
  }

  /** Claim a nickname for the signed-in cloud account (first time or rename). */
  async setNickname(nick: string): Promise<SessionUser> {
    const bad = nicknameError(nick);
    if (bad) throw new AuthError(bad);
    const cur = this.current;
    const backend = this.backendValue;
    if (!cur || cur.kind !== 'cloud' || !backend) throw new AuthError('not-signed-in');
    const ok = await wrap(() => backend.claimNickname(cur.id, nick.trim(), cur.avatar));
    if (!ok) throw new AuthError('nickname-taken');
    this.setCloud({ ...cur, name: nick.trim(), needsNickname: false });
    return this.current as SessionUser;
  }

  /** Change the avatar (hero id) of the current local or cloud profile. */
  async setAvatar(avatar: string): Promise<void> {
    const cur = this.current;
    if (!cur) return;
    if (cur.kind === 'local') {
      const p = { id: cur.id, name: cur.name, avatar };
      this.writeJson(this.profileKey, p);
      this.setLocal(p);
    } else if (cur.kind === 'cloud') {
      this.setCloud({ ...cur, avatar });
      const backend = this.backendValue;
      if (backend && !cur.needsNickname) {
        await wrap(() => backend.setProfile(cur.id, { nick: cur.name, avatar }));
      }
    }
  }

  async resetPassword(email: string): Promise<void> {
    const bad = emailError(email);
    if (bad) throw new AuthError(bad);
    const backend = await this.requireBackend();
    await wrap(() => backend.auth.sendReset(email.trim()));
  }

  /** Create (or replace) the device's local profile and use it. Always works offline. */
  createLocalProfile(name: string, avatar = DEFAULT_AVATAR): SessionUser {
    const bad = localNameError(name);
    if (bad) throw new AuthError(bad);
    const prev = this.localProfile();
    const p: LocalProfile = { id: prev?.id ?? makeId(), name: name.trim(), avatar };
    if (!this.writeJson(this.profileKey, p)) {
      // Storage blocked: the profile lasts for this session only.
    }
    this.setLocal(p);
    this.writeJson(this.sessionKey, { kind: 'local' });
    return this.current as SessionUser;
  }

  /** Use the stored local profile again (after signing out). */
  resumeLocalProfile(): SessionUser | null {
    const p = this.localProfile();
    if (!p) return null;
    this.setLocal(p);
    this.writeJson(this.sessionKey, { kind: 'local' });
    return this.current;
  }

  continueAsGuest(): SessionUser {
    this.setGuest();
    this.writeJson(this.sessionKey, { kind: 'guest' });
    return this.current as SessionUser;
  }

  /** Leave the current session (the local profile stays stored for "Continue as"). */
  async signOut(): Promise<void> {
    const wasCloud = this.stateValue === 'cloud';
    this.clearSession();
    if (wasCloud && this.backendValue) {
      try {
        await this.backendValue.auth.signOut();
      } catch {
        // Already signed out locally.
      }
    }
  }

  // ---------- internals ----------

  private async ensureBackend(): Promise<CloudBackend | null> {
    if (this.backendValue) return this.backendValue;
    if (!this.configured) return null;
    this.backendLoad ??= this.loader();
    const b = await this.backendLoad;
    if (!b) {
      this.backendLoad = null; // allow a retry later
      this.loadFailed = true;
      this.emit();
      return null;
    }
    this.loadFailed = false;
    this.backendValue = b;
    this.unsubBackend?.();
    this.unsubBackend = b.auth.onChange((u) => {
      // Signed out elsewhere or token revoked.
      if (!u && this.stateValue === 'cloud') this.clearSession();
    });
    return b;
  }

  private async requireBackend(): Promise<CloudBackend> {
    if (!this.configured) throw new AuthError('not-configured');
    const b = await this.ensureBackend();
    if (!b) throw new AuthError('network');
    return b;
  }

  private async finishCloud(u: AuthUser): Promise<SessionUser> {
    const backend = this.backendValue;
    const cached = this.readSession();
    let nick: string | null = null;
    let avatar = DEFAULT_AVATAR;
    try {
      const p = backend ? await backend.getProfile(u.uid) : null;
      nick = p?.nick ?? null;
      avatar = p?.avatar ?? avatar;
    } catch (e) {
      // Offline: fall back to what this device remembers.
      if (cached?.kind === 'cloud' && cached.uid === u.uid && cached.nick) {
        nick = cached.nick;
        avatar = cached.avatar;
      } else if (!(e instanceof CloudError) || e.code !== 'network') {
        throw toAuthError(e);
      }
    }
    this.setCloud({
      kind: 'cloud',
      id: u.uid,
      name: nick ?? suggestNickname(u.displayName ?? u.email),
      avatar,
      email: u.email,
      provider: u.provider,
      needsNickname: !nick,
    });
    return this.current as SessionUser;
  }

  private setCloud(u: SessionUser): void {
    this.current = u;
    this.stateValue = 'cloud';
    this.writeJson(this.sessionKey, {
      kind: 'cloud',
      uid: u.id,
      nick: u.needsNickname ? '' : u.name,
      avatar: u.avatar,
      email: u.email,
      provider: u.provider,
    });
    this.emit();
  }

  private setCloudOffline(s: Extract<StoredSession, { kind: 'cloud' }>): void {
    this.current = {
      kind: 'cloud',
      id: s.uid,
      name: s.nick || suggestNickname(s.email),
      avatar: s.avatar,
      email: s.email,
      provider: s.provider,
      needsNickname: !s.nick,
    };
    this.stateValue = 'cloud';
    this.emit();
  }

  private setLocal(p: LocalProfile): void {
    this.current = {
      kind: 'local',
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      email: null,
      provider: 'local',
      needsNickname: false,
    };
    this.stateValue = 'local';
    this.emit();
  }

  private setGuest(): void {
    this.current = {
      kind: 'guest',
      id: 'guest',
      name: 'Guest',
      avatar: DEFAULT_AVATAR,
      email: null,
      provider: 'guest',
      needsNickname: false,
    };
    this.stateValue = 'guest';
    this.emit();
  }

  private clearSession(): void {
    this.remove(this.sessionKey);
    this.current = null;
    this.stateValue = 'signed-out';
    this.emit();
  }

  private emit(): void {
    for (const cb of [...this.cbs]) cb(this.current, this.stateValue);
  }

  private readSession(): StoredSession | null {
    const raw = this.readJson(this.sessionKey);
    if (!isRecord(raw)) return null;
    if (raw.kind === 'guest' || raw.kind === 'local') return { kind: raw.kind };
    if (raw.kind === 'cloud' && typeof raw.uid === 'string' && raw.uid) {
      return {
        kind: 'cloud',
        uid: raw.uid,
        nick: typeof raw.nick === 'string' ? raw.nick : '',
        avatar: typeof raw.avatar === 'string' ? raw.avatar : DEFAULT_AVATAR,
        email: typeof raw.email === 'string' ? raw.email : null,
        provider:
          raw.provider === 'password' || raw.provider === 'memory' ? raw.provider : 'google',
      };
    }
    return null;
  }

  private read(key: string): string | null {
    try {
      return this.storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  private readJson(key: string): unknown {
    try {
      const t = this.read(key);
      return t ? (JSON.parse(t) as unknown) : null;
    } catch {
      return null;
    }
  }

  private write(key: string, value: string): boolean {
    try {
      this.storage?.setItem(key, value);
      return !!this.storage;
    } catch {
      return false;
    }
  }

  private writeJson(key: string, value: unknown): boolean {
    return this.write(key, JSON.stringify(value));
  }

  private remove(key: string): void {
    try {
      if (this.storage?.removeItem) this.storage.removeItem(key);
      else this.storage?.setItem(key, '');
    } catch {
      // Ignore.
    }
  }
}

function toAuthError(e: unknown): AuthError {
  if (e instanceof AuthError) return e;
  const c = toCloudError(e);
  return new AuthError(c.code, c.message);
}

async function wrap<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw toAuthError(e);
  }
}
