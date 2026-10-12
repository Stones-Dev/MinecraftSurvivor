import {
  defaultSave,
  isNewerSave,
  LocalSaveStore,
  summarizeSave,
  tryMigrate,
  type SaveData,
  type SaveStore,
  type SaveSummary,
} from '../core/save';
import type { CloudBackend, RemoteSave } from './backend';
import { CloudError, isTransient, toCloudError } from './errors';

/**
 * SaveStore that keeps the device copy (LocalSaveStore) as the source of truth and mirrors it to
 * the cloud for the signed-in account. load/save/export/import/reset stay synchronous; syncing is
 * asynchronous and never blocks the game.
 *
 * Keys: guests and local profiles use `minesurvive.save`; a cloud account uses
 * `minesurvive.save.<uid>`, so two accounts on one device never mix. The first time an account
 * signs in on a device that has guest progress, the player is offered to bring it into the account
 * (conflict kind 'adopt-guest'); the guest copy itself is never modified.
 *
 * Sync rules (see `pull`): the save records which account/revision it last synced with
 * (`cloud.uid`, `cloud.rev`) and the `lastModified` value the cloud holds (`cloud.lastSyncedAt`).
 * - only local changed  -> push (with the known revision; a newer remote rejects the write)
 * - only remote changed -> adopt the remote copy (local blob backed up to `<key>.pre-cloud.bak`)
 * - both changed        -> CONFLICT event; nothing is written until `resolve('local'|'cloud')`
 *                          (trivial cases resolve themselves: an untouched side always loses)
 * Pushes are debounced (3 s), flushed when the page is hidden, and retried with backoff offline.
 */
export type SyncStatus = 'local' | 'idle' | 'syncing' | 'offline' | 'error' | 'conflict';
export type PullOutcome =
  'local' | 'pushed' | 'adopted' | 'in-sync' | 'conflict' | 'offline' | 'error';

export interface SyncConflict {
  /** 'conflict': both copies changed. 'adopt-guest': first sign-in with guest progress on this device. */
  kind: 'conflict' | 'adopt-guest';
  local: SaveSummary;
  /** Null when the account has no cloud save yet (adopt-guest only). */
  cloud: SaveSummary | null;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'> & Partial<Pick<Storage, 'removeItem'>>;
interface Listenable {
  addEventListener(type: string, cb: () => void): void;
  removeEventListener(type: string, cb: () => void): void;
}

export interface CloudSaveOptions {
  storage: StorageLike | null;
  baseKey?: string;
  debounceMs?: number;
  now?: () => number;
  /** Window/document to listen to for pagehide/visibilitychange/online (defaults to the globals). */
  win?: Listenable | null;
  doc?: (Listenable & { visibilityState?: string }) | null;
}

const RETRY_MIN_MS = 2000;
const RETRY_MAX_MS = 5 * 60 * 1000;

export class CloudSaveStore implements SaveStore {
  readonly baseKey: string;
  private readonly storage: StorageLike | null;
  private readonly debounceMs: number;
  private readonly now: () => number;
  private readonly guest: LocalSaveStore;
  private local: LocalSaveStore;
  private backend: CloudBackend | null = null;
  private uidValue: string | null = null;
  /** True once this session agreed with the cloud (pushes may run). */
  private established = false;
  /** The per-account copy was seeded from guest progress on this sign-in. */
  private seededFromGuest = false;
  private statusValue: SyncStatus = 'local';
  private lastSyncedAtValue = 0;
  private conflictState: (SyncConflict & { remote: RemoteSave<unknown> | null }) | null = null;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = RETRY_MIN_MS;
  /** Serializes pulls and pushes. */
  private queue: Promise<unknown> = Promise.resolve();
  /** Bumped on attach/detach so late results from a previous account are ignored. */
  private epoch = 0;
  lastError: CloudError | null = null;
  private readonly statusCbs = new Set<(s: SyncStatus) => void>();
  private readonly conflictCbs = new Set<(c: SyncConflict) => void>();
  private readonly replacedCbs = new Set<(d: SaveData) => void>();
  private readonly detachLifecycle: () => void;

  constructor(opts: CloudSaveOptions) {
    this.storage = opts.storage;
    this.baseKey = opts.baseKey ?? 'minesurvive.save';
    this.debounceMs = opts.debounceMs ?? 3000;
    this.now = opts.now ?? (() => Date.now());
    this.guest = new LocalSaveStore(this.storage, this.baseKey);
    this.local = this.guest;
    this.detachLifecycle = this.listenLifecycle(opts);
  }

  // ---------- SaveStore (synchronous) ----------

  load(): SaveData {
    return this.local.load();
  }

  save(data: SaveData): void {
    this.stamp(data);
    this.local.save(data);
    this.schedulePush();
  }

  export(): string {
    return this.local.export();
  }

  import(json: string): SaveData {
    const keep = this.local.load().cloud;
    const data = this.local.import(json);
    data.cloud = { ...keep }; // the imported file's own sync bookkeeping is meaningless here
    this.save(data);
    return data;
  }

  reset(): SaveData {
    const cur = this.local.load();
    const text = this.local.rawText();
    if (text) this.write(`${this.local.key}.pre-reset.bak`, text);
    const data = defaultSave(this.now());
    data.profile = { ...cur.profile };
    data.cloud = { ...cur.cloud };
    data.lastModified = Math.max(data.lastModified, cur.lastModified);
    this.local.replace(data);
    this.save(data);
    return data;
  }

  /** True when the last local write failed (storage full or blocked). */
  get saveFailed(): boolean {
    return this.local.saveFailed;
  }

  // ---------- sync state ----------

  get status(): SyncStatus {
    return this.statusValue;
  }
  /** Wall-clock ms of the last successful sync this session (0 = never). */
  get lastSyncedAt(): number {
    return this.lastSyncedAtValue;
  }
  get uid(): string | null {
    return this.uidValue;
  }
  /** The localStorage key of the active copy. */
  get key(): string {
    return this.local.key;
  }
  get pendingConflict(): SyncConflict | null {
    const c = this.conflictState;
    return c ? { kind: c.kind, local: c.local, cloud: c.cloud } : null;
  }
  /** True when local changes have not reached the cloud yet. */
  get dirty(): boolean {
    const d = this.local.load();
    return d.cloud.uid !== this.uidValue || d.lastModified > d.cloud.lastSyncedAt;
  }

  onStatus(cb: (s: SyncStatus) => void): () => void {
    this.statusCbs.add(cb);
    return () => this.statusCbs.delete(cb);
  }
  /** Called when a conflict needs the player's choice; answer with `resolve`. */
  onConflict(cb: (c: SyncConflict) => void): () => void {
    this.conflictCbs.add(cb);
    const c = this.pendingConflict;
    if (c) cb(c);
    return () => this.conflictCbs.delete(cb);
  }
  /** Called when the active save object is replaced (account switch, cloud copy adopted). */
  onDataReplaced(cb: (d: SaveData) => void): () => void {
    this.replacedCbs.add(cb);
    return () => this.replacedCbs.delete(cb);
  }

  // ---------- accounts ----------

  /**
   * Switch to the account's device copy and sync it with the cloud. On the first sign-in on this
   * device, guest progress (if any) seeds the account copy and an 'adopt-guest' choice is raised.
   */
  attach(backend: CloudBackend, uid: string): Promise<PullOutcome> {
    if (this.backend === backend && this.uidValue === uid) return this.pull();
    this.resetTimers();
    this.epoch++;
    const sameAccount = this.uidValue === uid; // was attached offline: keep the live copy
    this.backend = backend;
    this.uidValue = uid;
    this.established = false;
    this.conflictState = null;
    this.lastError = null;
    if (sameAccount) return this.pull();
    this.local = new LocalSaveStore(this.storage, `${this.baseKey}.${uid}`);
    this.seededFromGuest = false;
    if (!this.local.hasStored()) {
      const g = this.guest.load();
      if (summarizeSave(g).progress > 0 && this.read(`${this.baseKey}.adoptedBy`) !== uid) {
        const seed = clone(g);
        seed.cloud = { uid: null, rev: 0, lastSyncedAt: 0 };
        this.local.replace(seed);
        this.seededFromGuest = true;
      }
    }
    this.emitReplaced();
    return this.pull();
  }

  /**
   * Use the account's device copy without a backend (the cloud SDK could not load, e.g. offline
   * first load). Status is 'offline'; call `attach` once the backend is available.
   */
  attachOffline(uid: string): void {
    if (this.uidValue === uid) return;
    this.resetTimers();
    this.epoch++;
    this.backend = null;
    this.uidValue = uid;
    this.established = false;
    this.conflictState = null;
    this.seededFromGuest = false;
    this.local = new LocalSaveStore(this.storage, `${this.baseKey}.${uid}`);
    this.setStatus('offline');
    this.emitReplaced();
  }

  /** Back to the device (guest/local profile) copy. Pending changes are flushed first (best effort). */
  async detach(): Promise<void> {
    if (!this.uidValue) return;
    await this.flush().catch(() => undefined);
    this.resetTimers();
    this.epoch++;
    this.backend = null;
    this.uidValue = null;
    this.established = false;
    this.conflictState = null;
    this.local = this.guest;
    this.setStatus('local');
    this.emitReplaced();
  }

  /** Fetch the cloud copy and reconcile (see the class comment). Never rejects. */
  pull(): Promise<PullOutcome> {
    return this.enqueue(() => this.doPull());
  }

  /** Push pending changes now (debounce skipped). Never rejects. */
  flush(): Promise<PullOutcome> {
    this.clearPushTimer();
    if (!this.backend || !this.uidValue) return Promise.resolve('local');
    if (!this.established) return this.pull();
    return this.enqueue(() => (this.dirty ? this.doPush() : Promise.resolve('in-sync' as const)));
  }

  /** Answer a pending conflict: keep this device's copy or take the cloud's. */
  resolve(choice: 'local' | 'cloud'): Promise<PullOutcome> {
    return this.enqueue(async () => {
      const c = this.conflictState;
      if (!c || !this.uidValue) return this.backend ? 'in-sync' : 'local';
      this.conflictState = null;
      if (choice === 'cloud') {
        if (c.remote) return this.adopt(c.remote);
        // Declined to bring guest progress: the account starts fresh (guest copy stays on device).
        const fresh = defaultSave(this.now());
        fresh.profile = { ...this.local.load().profile };
        this.backupLocal();
        this.local.replace(fresh);
        this.emitReplaced();
        return this.doPush(0);
      }
      if (c.kind === 'adopt-guest') this.write(`${this.baseKey}.adoptedBy`, this.uidValue);
      if (c.remote) this.write(`${this.local.key}.cloud.bak`, JSON.stringify(c.remote.save));
      return this.doPush(c.remote?.v ?? 0);
    });
  }

  /** Stop timers and lifecycle listeners (tests, hot reload). */
  dispose(): void {
    this.resetTimers();
    this.detachLifecycle();
  }

  // ---------- internals ----------

  private stamp(data: SaveData): void {
    data.lastModified = Math.max(this.now(), (data.lastModified || 0) + 1);
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async doPull(): Promise<PullOutcome> {
    const backend = this.backend;
    const uid = this.uidValue;
    if (!backend || !uid) return 'local';
    if (this.conflictState) return 'conflict';
    if (this.local.isLocked)
      return this.fail(new CloudError('remote-newer', 'Local save is newer'));
    const epoch = this.epoch;
    this.setStatus('syncing');
    let remote: RemoteSave<unknown> | null;
    try {
      remote = await backend.getSave(uid);
    } catch (e) {
      return epoch === this.epoch ? this.fail(toCloudError(e)) : 'local';
    }
    if (epoch !== this.epoch) return 'local';
    const local = this.local.load();
    const localSum = summarizeSave(local);
    if (!remote) {
      if (this.seededFromGuest && localSum.progress > 0) return this.ask('adopt-guest', null);
      return this.doPush(0);
    }
    if (isNewerSave(remote.save)) return this.fail(new CloudError('remote-newer'));
    const remoteData = tryMigrate(remote.save);
    if (!remoteData) {
      // Unreadable cloud copy: keep it aside and replace it with the device copy.
      this.write(`${this.local.key}.cloud.bak`, JSON.stringify(remote.save));
      return this.doPush(remote.v);
    }
    const syncedHere = local.cloud.uid === uid;
    const dirty = !syncedHere || local.lastModified > local.cloud.lastSyncedAt;
    const remoteChanged = !syncedHere || remote.v !== local.cloud.rev;
    if (!remoteChanged) {
      if (dirty) return this.doPush(remote.v);
      this.markSynced();
      return 'in-sync';
    }
    if (this.seededFromGuest && localSum.progress > 0) return this.ask('adopt-guest', remote);
    if (!dirty || localSum.progress === 0) return this.adopt(remote);
    if (sameContent(local, remoteData)) {
      local.cloud = { uid, rev: remote.v, lastSyncedAt: local.lastModified };
      this.local.save(local);
      this.markSynced();
      return 'in-sync';
    }
    if (summarizeSave(remoteData).progress === 0) return this.doPush(remote.v);
    return this.ask('conflict', remote);
  }

  private ask(kind: SyncConflict['kind'], remote: RemoteSave<unknown> | null): PullOutcome {
    const remoteData = remote ? tryMigrate(remote.save) : null;
    this.conflictState = {
      kind,
      local: summarizeSave(this.local.load()),
      cloud: remoteData ? summarizeSave(remoteData) : null,
      remote,
    };
    this.established = false;
    this.setStatus('conflict');
    const info = this.pendingConflict;
    if (info) for (const cb of [...this.conflictCbs]) cb(info);
    return 'conflict';
  }

  private adopt(remote: RemoteSave<unknown>): PullOutcome {
    const data = tryMigrate(remote.save);
    if (!data || !this.uidValue) return this.fail(new CloudError('remote-newer'));
    this.backupLocal();
    data.cloud = { uid: this.uidValue, rev: remote.v, lastSyncedAt: data.lastModified };
    this.local.replace(data);
    this.seededFromGuest = false;
    this.markSynced();
    this.emitReplaced();
    return 'adopted';
  }

  private backupLocal(): void {
    const text = this.local.rawText();
    if (text) this.write(`${this.local.key}.pre-cloud.bak`, text);
  }

  private async doPush(baseRev = this.local.load().cloud.rev): Promise<PullOutcome> {
    const backend = this.backend;
    const uid = this.uidValue;
    if (!backend || !uid) return 'local';
    if (this.local.isLocked)
      return this.fail(new CloudError('remote-newer', 'Local save is newer'));
    const epoch = this.epoch;
    const snapshot = clone(this.local.load());
    snapshot.cloud = { uid, rev: baseRev + 1, lastSyncedAt: snapshot.lastModified };
    this.setStatus('syncing');
    let res: RemoteSave;
    try {
      res = await backend.putSave(uid, snapshot, baseRev);
    } catch (e) {
      if (epoch !== this.epoch) return 'local';
      const err = toCloudError(e);
      // Someone else (another device) wrote first: reconcile instead of overwriting.
      if (err.code === 'conflict') return this.doPull();
      return this.fail(err);
    }
    if (epoch !== this.epoch) return 'local';
    const cur = this.local.load();
    cur.cloud = { uid, rev: res.v, lastSyncedAt: snapshot.lastModified };
    this.local.save(cur);
    if (this.seededFromGuest) this.write(`${this.baseKey}.adoptedBy`, uid);
    this.seededFromGuest = false;
    this.markSynced();
    if (cur.lastModified > snapshot.lastModified) this.schedulePush(); // edited while pushing
    return 'pushed';
  }

  private markSynced(): void {
    this.established = true;
    this.lastError = null;
    this.lastSyncedAtValue = this.now();
    this.retryDelay = RETRY_MIN_MS;
    this.setStatus('idle');
  }

  private fail(err: CloudError): PullOutcome {
    this.lastError = err;
    if (isTransient(err)) {
      this.setStatus('offline');
      this.scheduleRetry();
      return 'offline';
    }
    console.warn('[cloud] sync error', err.code, err.message);
    this.setStatus('error');
    return 'error';
  }

  private schedulePush(): void {
    if (!this.backend || !this.established || this.conflictState) return;
    this.clearPushTimer();
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      void this.flush();
    }, this.debounceMs);
  }

  private scheduleRetry(): void {
    if (this.retryTimer) return;
    const delay = this.retryDelay;
    this.retryDelay = Math.min(RETRY_MAX_MS, this.retryDelay * 2);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.flush();
    }, delay);
  }

  /** Retry right away (e.g. the browser reports it is back online). */
  retryNow(): Promise<PullOutcome> {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    return this.flush();
  }

  private clearPushTimer(): void {
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = null;
  }

  private resetTimers(): void {
    this.clearPushTimer();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.retryDelay = RETRY_MIN_MS;
  }

  private setStatus(s: SyncStatus): void {
    if (s === this.statusValue) return;
    this.statusValue = s;
    for (const cb of [...this.statusCbs]) cb(s);
  }

  private emitReplaced(): void {
    const d = this.local.load();
    for (const cb of [...this.replacedCbs]) cb(d);
  }

  private read(key: string): string | null {
    try {
      return this.storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  private write(key: string, value: string): void {
    try {
      this.storage?.setItem(key, value);
    } catch {
      // Backups are best effort.
    }
  }

  private listenLifecycle(opts: CloudSaveOptions): () => void {
    const g = globalThis as {
      window?: Listenable;
      document?: Listenable & { visibilityState?: string };
    };
    const win = opts.win === undefined ? (g.window ?? null) : opts.win;
    const doc = opts.doc === undefined ? (g.document ?? null) : opts.doc;
    const onHide = (): void => {
      if (this.pushTimer) void this.flush();
    };
    const onVisibility = (): void => {
      if (doc?.visibilityState === 'hidden') onHide();
    };
    const onOnline = (): void => {
      if (this.statusValue === 'offline') void this.retryNow();
    };
    win?.addEventListener('pagehide', onHide);
    win?.addEventListener('online', onOnline);
    doc?.addEventListener('visibilitychange', onVisibility);
    return () => {
      win?.removeEventListener('pagehide', onHide);
      win?.removeEventListener('online', onOnline);
      doc?.removeEventListener('visibilitychange', onVisibility);
    };
  }
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Same game content, ignoring sync bookkeeping and timestamps. */
function sameContent(a: SaveData, b: SaveData): boolean {
  const strip = (s: SaveData): string => JSON.stringify({ ...s, lastModified: 0, cloud: null });
  return strip(a) === strip(b);
}
