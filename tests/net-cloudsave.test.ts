import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSave, type SaveData } from '../src/core/save';
import { CloudSaveStore, type SyncConflict, type SyncStatus } from '../src/net/cloudSave';
import { MemoryBackend, MemoryServer } from '../src/net/memoryBackend';
import { memStorage } from './helpers/memStorage';

let clock = 1_000_000;
const now = (): number => clock;

function device(server: MemoryServer, storage = memStorage()) {
  const backend = new MemoryBackend({ server });
  const store = new CloudSaveStore({ storage, now, win: null, doc: null });
  return { backend, store, storage };
}

/** Put some progress in a save. */
function play(store: CloudSaveStore, runs = 1, emeralds = 100): SaveData {
  const d = store.load();
  d.records.runs += runs;
  d.stats.runs += runs;
  d.currencies.emeralds += emeralds;
  clock += 1000;
  store.save(d);
  return d;
}

async function remoteSave(b: MemoryBackend, uid: string) {
  const r = await b.getSave(uid);
  return r as { save: SaveData; v: number } | null;
}

beforeEach(() => {
  clock = 1_000_000;
});
afterEach(() => {
  vi.useRealTimers();
});

describe('CloudSaveStore offline / guest', () => {
  it('works as a plain local store without an account', () => {
    const storage = memStorage();
    const store = new CloudSaveStore({ storage, now, win: null, doc: null });
    expect(store.status).toBe('local');
    const first = store.load().lastModified;
    const d = play(store);
    expect(d.lastModified).toBeGreaterThan(first);
    expect(JSON.parse(storage.map.get('minesurvive.save') ?? '{}').stats.runs).toBe(1);
    // lastModified always moves forward, even within the same millisecond.
    const stamp = d.lastModified;
    store.save(d);
    expect(d.lastModified).toBe(stamp + 1);
  });

  it('reset keeps the profile and sync bookkeeping but backs up the old blob', () => {
    const storage = memStorage();
    const store = new CloudSaveStore({ storage, now, win: null, doc: null });
    const d = play(store);
    d.profile.name = 'Ana';
    store.save(d);
    const fresh = store.reset();
    expect(fresh.profile.name).toBe('Ana');
    expect(fresh.stats.runs).toBe(0);
    expect(storage.map.get('minesurvive.save.pre-reset.bak')).toContain('"Ana"');
  });
});

describe('CloudSaveStore pull', () => {
  it('pushes the local copy when the account has no cloud save', async () => {
    const server = new MemoryServer();
    const { backend, store, storage } = device(server);
    const u = await backend.auth.signInGoogle();
    const statuses: SyncStatus[] = [];
    store.onStatus((s) => statuses.push(s));
    expect(await store.attach(backend, u.uid)).toBe('pushed');
    expect(statuses).toEqual(['syncing', 'idle']);
    expect(store.key).toBe(`minesurvive.save.${u.uid}`);
    const r = await remoteSave(backend, u.uid);
    expect(r?.v).toBe(1);
    const local = store.load();
    expect(local.cloud).toEqual({ uid: u.uid, rev: 1, lastSyncedAt: local.lastModified });
    expect(store.dirty).toBe(false);
    expect(store.lastSyncedAt).toBe(clock);
    expect(storage.map.has(`minesurvive.save.${u.uid}`)).toBe(true);
  });

  it('adopts the cloud save on a new device', async () => {
    const server = new MemoryServer();
    const a = device(server);
    const u = await a.backend.auth.signInGoogle();
    await a.store.attach(a.backend, u.uid);
    play(a.store, 3, 700);
    await a.store.flush();

    const b = device(server);
    await b.backend.auth.signInGoogle();
    const replaced: SaveData[] = [];
    b.store.onDataReplaced((d) => replaced.push(d));
    expect(await b.store.attach(b.backend, u.uid)).toBe('adopted');
    expect(b.store.load().stats.runs).toBe(3);
    expect(b.store.load().currencies.emeralds).toBe(1200);
    expect(replaced.at(-1)).toBe(b.store.load());
    expect(b.store.dirty).toBe(false);
  });

  it('takes the newer cloud copy when this device has no unsynced changes', async () => {
    const server = new MemoryServer();
    const a = device(server);
    const b = device(server);
    const u = await a.backend.auth.signInGoogle();
    await b.backend.auth.signInGoogle();
    await a.store.attach(a.backend, u.uid);
    await b.store.attach(b.backend, u.uid); // in sync, rev 1
    play(a.store, 2);
    await a.store.flush(); // rev 2
    expect(await b.store.pull()).toBe('adopted');
    expect(b.store.load().stats.runs).toBe(2);
    expect(await b.store.pull()).toBe('in-sync');
  });

  it('never overwrites a newer cloud save with an older local one', async () => {
    const server = new MemoryServer();
    const a = device(server);
    const b = device(server);
    const u = await a.backend.auth.signInGoogle();
    await b.backend.auth.signInGoogle();
    await a.store.attach(a.backend, u.uid);
    await b.store.attach(b.backend, u.uid);
    play(a.store, 5, 500);
    await a.store.flush(); // cloud rev 2 with 5 runs
    const conflicts: SyncConflict[] = [];
    b.store.onConflict((c) => conflicts.push(c));
    play(b.store, 1, 10); // b still thinks rev 1
    expect(await b.store.flush()).toBe('conflict');
    const r = await remoteSave(b.backend, u.uid);
    expect(r?.v).toBe(2);
    expect(r?.save.stats.runs).toBe(5); // untouched
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.kind).toBe('conflict');
    expect(conflicts[0]?.local.runs).toBe(1);
    expect(conflicts[0]?.cloud?.runs).toBe(5);
    expect(b.store.status).toBe('conflict');
    // Saves keep working locally while the choice is pending, without pushing.
    play(b.store, 1);
    expect(b.store.load().stats.runs).toBe(2);
    expect((await remoteSave(b.backend, u.uid))?.v).toBe(2);
  });

  it('resolves a conflict with the cloud copy and backs up the local one', async () => {
    const server = new MemoryServer();
    const a = device(server);
    const b = device(server);
    const u = await a.backend.auth.signInGoogle();
    await b.backend.auth.signInGoogle();
    await a.store.attach(a.backend, u.uid);
    await b.store.attach(b.backend, u.uid);
    play(a.store, 5);
    await a.store.flush();
    play(b.store, 1, 42);
    expect(await b.store.pull()).toBe('conflict');
    expect(await b.store.resolve('cloud')).toBe('adopted');
    expect(b.store.load().stats.runs).toBe(5);
    expect(b.store.status).toBe('idle');
    const bak = JSON.parse(b.storage.map.get(`minesurvive.save.${u.uid}.pre-cloud.bak`) ?? '{}');
    expect(bak.currencies.emeralds).toBe(542);
  });

  it('resolves a conflict with the local copy and keeps the cloud one as a backup', async () => {
    const server = new MemoryServer();
    const a = device(server);
    const b = device(server);
    const u = await a.backend.auth.signInGoogle();
    await b.backend.auth.signInGoogle();
    await a.store.attach(a.backend, u.uid);
    await b.store.attach(b.backend, u.uid);
    play(a.store, 5);
    await a.store.flush();
    play(b.store, 1, 42);
    await b.store.pull();
    expect(b.store.pendingConflict?.kind).toBe('conflict');
    expect(await b.store.resolve('local')).toBe('pushed');
    const r = await remoteSave(b.backend, u.uid);
    expect(r?.v).toBe(3);
    expect(r?.save.currencies.emeralds).toBe(542);
    expect(
      JSON.parse(b.storage.map.get(`minesurvive.save.${u.uid}.cloud.bak`) ?? '{}').stats.runs,
    ).toBe(5);
    expect(b.store.pendingConflict).toBeNull();
    // a (now behind, no local changes) follows.
    expect(await a.store.pull()).toBe('adopted');
    expect(a.store.load().currencies.emeralds).toBe(542);
  });

  it('resolves trivially when one side is untouched or both are identical', async () => {
    const server = new MemoryServer();
    const a = device(server);
    const u = await a.backend.auth.signInGoogle();
    await a.store.attach(a.backend, u.uid);
    play(a.store, 2);
    await a.store.flush();
    // A device whose account copy exists but has no progress adopts without asking.
    const storage = memStorage();
    storage.setItem(`minesurvive.save.${u.uid}`, JSON.stringify(defaultSave(5)));
    const b = device(server, storage);
    await b.backend.auth.signInGoogle();
    expect(await b.store.attach(b.backend, u.uid)).toBe('adopted');
  });

  it('offers to bring guest progress into an account on first sign-in', async () => {
    const server = new MemoryServer();
    const { backend, store, storage } = device(server);
    play(store, 4, 250); // guest progress
    const guestBlob = storage.map.get('minesurvive.save');
    const u = await backend.auth.signInGoogle();
    const conflicts: SyncConflict[] = [];
    store.onConflict((c) => conflicts.push(c));
    expect(await store.attach(backend, u.uid)).toBe('conflict');
    expect(conflicts[0]).toMatchObject({ kind: 'adopt-guest', cloud: null });
    expect(conflicts[0]?.local.runs).toBe(4);
    expect(await store.resolve('local')).toBe('pushed');
    expect((await remoteSave(backend, u.uid))?.save.stats.runs).toBe(4);
    expect(storage.map.get('minesurvive.save.adoptedBy')).toBe(u.uid);
    expect(storage.map.get('minesurvive.save')).toBe(guestBlob); // guest copy untouched
    // Signing out returns to the guest copy.
    await store.detach();
    expect(store.status).toBe('local');
    expect(store.key).toBe('minesurvive.save');
    expect(store.load().stats.runs).toBe(4);
  });

  it('can decline bringing guest progress (fresh account, guest copy kept)', async () => {
    const server = new MemoryServer();
    const { backend, store, storage } = device(server);
    play(store, 4);
    const u = await backend.auth.signInGoogle();
    await store.attach(backend, u.uid);
    expect(await store.resolve('cloud')).toBe('pushed');
    expect(store.load().stats.runs).toBe(0);
    expect((await remoteSave(backend, u.uid))?.save.stats.runs).toBe(0);
    expect(JSON.parse(storage.map.get('minesurvive.save') ?? '{}').stats.runs).toBe(4);
  });

  it('asks before mixing guest progress with an existing cloud save', async () => {
    const server = new MemoryServer();
    const a = device(server);
    const u = await a.backend.auth.signInGoogle();
    await a.store.attach(a.backend, u.uid);
    play(a.store, 9);
    await a.store.flush();
    const b = device(server);
    play(b.store, 2); // guest progress on another device
    await b.backend.auth.signInGoogle();
    expect(await b.store.attach(b.backend, u.uid)).toBe('conflict');
    expect(b.store.pendingConflict).toMatchObject({ kind: 'adopt-guest' });
    expect(b.store.pendingConflict?.cloud?.runs).toBe(9);
  });

  it('refuses to touch a cloud save written by a newer build', async () => {
    const server = new MemoryServer();
    const { backend, store } = device(server);
    const u = await backend.auth.signInGoogle();
    server.state.saves[u.uid] = { save: { saveVersion: 99 }, updatedAt: 1, v: 7 };
    expect(await store.attach(backend, u.uid)).toBe('error');
    expect(store.lastError?.code).toBe('remote-newer');
    expect(server.state.saves[u.uid]?.v).toBe(7);
  });

  it('import keeps sync bookkeeping and pushes the imported save', async () => {
    const server = new MemoryServer();
    const { backend, store } = device(server);
    const u = await backend.auth.signInGoogle();
    await store.attach(backend, u.uid);
    const other = defaultSave(1);
    other.currencies.emeralds = 4242;
    other.cloud = { uid: 'someone', rev: 99, lastSyncedAt: 1 };
    store.import(JSON.stringify(other));
    expect(store.load().cloud.uid).toBe(u.uid);
    expect(await store.flush()).toBe('pushed');
    expect((await remoteSave(backend, u.uid))?.save.currencies.emeralds).toBe(4242);
  });
});

describe('CloudSaveStore push scheduling', () => {
  it('debounces saves into one push after 3 s', async () => {
    vi.useFakeTimers();
    const server = new MemoryServer();
    const { backend, store } = device(server);
    const u = await backend.auth.signInGoogle();
    await store.attach(backend, u.uid);
    const before = backend.calls;
    play(store);
    await vi.advanceTimersByTimeAsync(1000);
    play(store);
    await vi.advanceTimersByTimeAsync(2999);
    expect(backend.calls).toBe(before);
    expect(store.dirty).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(backend.calls).toBe(before + 1);
    expect((await remoteSave(backend, u.uid))?.save.stats.runs).toBe(2);
    expect(store.dirty).toBe(false);
  });

  it('flushes a pending push when the page is hidden', async () => {
    vi.useFakeTimers();
    const server = new MemoryServer();
    const backend = new MemoryBackend({ server });
    const win = new EventTarget();
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    const store = new CloudSaveStore({ storage: memStorage(), now, win, doc });
    const u = await backend.auth.signInGoogle();
    await store.attach(backend, u.uid);
    play(store);
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect((await remoteSave(backend, u.uid))?.save.stats.runs).toBe(1);
    play(store, 2);
    win.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(0);
    expect((await remoteSave(backend, u.uid))?.save.stats.runs).toBe(3);
    store.dispose();
  });

  it('goes offline, retries with backoff and recovers', async () => {
    vi.useFakeTimers();
    const server = new MemoryServer();
    const { backend, store } = device(server);
    const u = await backend.auth.signInGoogle();
    await store.attach(backend, u.uid);
    const statuses: SyncStatus[] = [];
    store.onStatus((s) => statuses.push(s));
    backend.offline = true;
    play(store);
    await vi.advanceTimersByTimeAsync(3000);
    expect(store.status).toBe('offline');
    expect(store.lastError?.code).toBe('network');
    await vi.advanceTimersByTimeAsync(2000); // first retry (2 s), still offline
    expect(store.status).toBe('offline');
    backend.offline = false;
    await vi.advanceTimersByTimeAsync(3999); // second retry is at +4 s
    expect(store.status).toBe('offline');
    await vi.advanceTimersByTimeAsync(1);
    expect(store.status).toBe('idle');
    expect((await remoteSave(backend, u.uid))?.save.stats.runs).toBe(1);
    expect(statuses).toEqual(['syncing', 'offline', 'syncing', 'offline', 'syncing', 'idle']);
  });

  it('retries immediately when the browser comes back online', async () => {
    vi.useFakeTimers();
    const server = new MemoryServer();
    const backend = new MemoryBackend({ server });
    const win = new EventTarget();
    const store = new CloudSaveStore({ storage: memStorage(), now, win, doc: null });
    const u = await backend.auth.signInGoogle();
    backend.offline = true;
    expect(await store.attach(backend, u.uid)).toBe('offline');
    backend.offline = false;
    win.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(store.status).toBe('idle');
    store.dispose();
  });

  it('pushes again when the save changes while a push is in flight', async () => {
    const server = new MemoryServer();
    const backend = new MemoryBackend({ server, latencyMs: 5 });
    const store = new CloudSaveStore({
      storage: memStorage(),
      now,
      win: null,
      doc: null,
      debounceMs: 0,
    });
    const u = await backend.auth.signInGoogle();
    await store.attach(backend, u.uid);
    play(store);
    const flushing = store.flush();
    await new Promise((r) => setTimeout(r, 1));
    play(store); // edit during the push
    await flushing;
    expect(store.dirty).toBe(true);
    await store.flush();
    expect(store.dirty).toBe(false);
    expect((await remoteSave(backend, u.uid))?.save.stats.runs).toBe(2);
  });

  it('can play an account offline and sync once the backend arrives', async () => {
    const server = new MemoryServer();
    const { backend, store } = device(server);
    const u = await backend.auth.signInGoogle();
    store.attachOffline(u.uid);
    expect(store.status).toBe('offline');
    play(store, 3);
    expect(await store.attach(backend, u.uid)).toBe('pushed');
    expect((await remoteSave(backend, u.uid))?.save.stats.runs).toBe(3);
  });
});
