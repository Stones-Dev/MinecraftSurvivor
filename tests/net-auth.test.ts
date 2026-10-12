import { describe, expect, it } from 'vitest';
import { AuthService } from '../src/net/auth';
import type { CloudBackend } from '../src/net/backend';
import { CloudSaveStore } from '../src/net/cloudSave';
import { AuthError } from '../src/net/errors';
import { MemoryBackend, MemoryServer } from '../src/net/memoryBackend';
import { bindSaveToAuth, leaderboardFor } from '../src/net/session';
import { memStorage } from './helpers/memStorage';

const codeOf = async (p: Promise<unknown> | (() => unknown)): Promise<string> => {
  try {
    await (typeof p === 'function' ? p() : p);
    return 'ok';
  } catch (e) {
    return e instanceof AuthError ? e.code : 'not-an-auth-error';
  }
};

function offlineAuth(storage = memStorage()) {
  return new AuthService({ storage, configured: false, loadBackend: () => Promise.resolve(null) });
}

function cloudAuth(backend: CloudBackend | null, storage = memStorage()) {
  let loads = 0;
  const auth = new AuthService({
    storage,
    configured: true,
    loadBackend: () => {
      loads++;
      return Promise.resolve(backend);
    },
  });
  return { auth, storage, loads: () => loads };
}

describe('AuthService without cloud configuration', () => {
  it('reports cloud unavailable and fails cloud methods with not-configured', async () => {
    const auth = offlineAuth();
    expect(auth.cloudAvailable).toBe(false);
    expect(auth.state).toBe('signed-out');
    expect(await codeOf(auth.signInGoogle())).toBe('not-configured');
    expect(await codeOf(auth.signInEmail('a@b.co', 'secret1'))).toBe('not-configured');
    expect(await codeOf(auth.signUpEmail('a@b.co', 'secret1', 'Alex'))).toBe('not-configured');
    expect(await codeOf(auth.resetPassword('a@b.co'))).toBe('not-configured');
  });

  it('creates a local profile that survives a reload', async () => {
    const storage = memStorage();
    const auth = offlineAuth(storage);
    const seen: string[] = [];
    auth.onChange((_u, s) => seen.push(s));
    const u = auth.createLocalProfile('  Ana  ', 'alex');
    expect(u).toMatchObject({ kind: 'local', name: 'Ana', avatar: 'alex', provider: 'local' });
    expect(auth.state).toBe('local');
    expect(seen).toEqual(['local']);
    const again = offlineAuth(storage);
    expect(await again.init()).toMatchObject({ kind: 'local', id: u.id, name: 'Ana' });
    // Renaming keeps the same profile id.
    expect(again.createLocalProfile('Bea').id).toBe(u.id);
    expect(await codeOf(() => again.createLocalProfile('   '))).toBe('invalid-name');
  });

  it('remembers guests, and signing out keeps the local profile for later', async () => {
    const storage = memStorage();
    const auth = offlineAuth(storage);
    auth.createLocalProfile('Ana');
    auth.continueAsGuest();
    expect(auth.user()).toMatchObject({ kind: 'guest', name: 'Guest' });
    expect((await offlineAuth(storage).init())?.kind).toBe('guest');
    await auth.signOut();
    expect(auth.state).toBe('signed-out');
    expect(auth.user()).toBeNull();
    expect(await offlineAuth(storage).init()).toBeNull();
    expect(auth.localProfile()?.name).toBe('Ana');
    expect(auth.resumeLocalProfile()?.name).toBe('Ana');
  });

  it('survives blocked storage', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const auth = new AuthService({
      storage: blocked,
      configured: false,
      loadBackend: () => Promise.resolve(null),
    });
    expect(auth.createLocalProfile('Ana').name).toBe('Ana');
    expect(auth.continueAsGuest().kind).toBe('guest');
  });
});

describe('AuthService with a cloud backend', () => {
  it('signs up with email and a unique nickname, and restores the session', async () => {
    const backend = new MemoryBackend();
    const { auth, storage } = cloudAuth(backend);
    expect(auth.cloudAvailable).toBe(true);
    const u = await auth.signUpEmail('ana@example.com', 'secret1', 'AnaCraft', 'alex');
    expect(u).toMatchObject({
      kind: 'cloud',
      name: 'AnaCraft',
      avatar: 'alex',
      email: 'ana@example.com',
      needsNickname: false,
      provider: 'password',
    });
    expect(await auth.nicknameAvailable('anacraft')).toBe(false);
    expect(await auth.nicknameAvailable('Other')).toBe(true);
    const restored = cloudAuth(backend, storage).auth;
    expect(await restored.init()).toMatchObject({ kind: 'cloud', id: u.id, name: 'AnaCraft' });
  });

  it('validates input locally before calling the backend', async () => {
    const backend = new MemoryBackend();
    const { auth } = cloudAuth(backend);
    expect(await codeOf(auth.signUpEmail('nope', 'secret1', 'Alex'))).toBe('invalid-email');
    expect(await codeOf(auth.signUpEmail('a@b.co', '123', 'Alex'))).toBe('weak-password');
    expect(await codeOf(auth.signUpEmail('a@b.co', 'secret1', 'x!'))).toBe('invalid-nickname');
    expect(await codeOf(auth.signInEmail('a@b.co', ''))).toBe('invalid-credentials');
    expect(await codeOf(auth.resetPassword('bad'))).toBe('invalid-email');
    expect(backend.calls).toBe(0);
  });

  it('maps backend failures to friendly codes', async () => {
    const backend = new MemoryBackend();
    const { auth } = cloudAuth(backend);
    await auth.signUpEmail('ana@example.com', 'secret1', 'AnaCraft');
    await auth.signOut();
    expect(auth.state).toBe('signed-out');
    expect(await codeOf(auth.signInEmail('ana@example.com', 'wrong12'))).toBe(
      'invalid-credentials',
    );
    expect(await codeOf(auth.signUpEmail('bob@example.com', 'secret1', 'anacraft'))).toBe(
      'nickname-taken',
    );
    expect(await codeOf(auth.signUpEmail('ana@example.com', 'secret1', 'Fresh'))).toBe(
      'email-in-use',
    );
    backend.popupBlocked = true;
    expect(await codeOf(auth.signInGoogle())).toBe('popup-blocked');
    backend.offline = true;
    expect(await codeOf(auth.signInEmail('ana@example.com', 'secret1'))).toBe('network');
    backend.offline = false;
    await auth.resetPassword('ana@example.com');
    expect(backend.resetsSent).toEqual(['ana@example.com']);
  });

  it('asks a new Google account for a nickname', async () => {
    const server = new MemoryServer();
    const taken = new MemoryBackend({
      server,
      googleAccount: { email: 't@x.io', displayName: 'T' },
    });
    const tu = await taken.auth.signInGoogle();
    await taken.claimNickname(tu.uid, 'Steve');
    const { auth } = cloudAuth(new MemoryBackend({ server }));
    const u = await auth.signInGoogle();
    expect(u.needsNickname).toBe(true);
    expect(u.name).toBe('DemoPlayer'); // suggestion from the Google display name
    expect(await codeOf(auth.setNickname('steve'))).toBe('nickname-taken');
    expect(await codeOf(auth.setNickname('no'))).toBe('invalid-nickname');
    const done = await auth.setNickname('Builder');
    expect(done).toMatchObject({ name: 'Builder', needsNickname: false });
    await auth.setAvatar('rana');
    expect(auth.user()?.avatar).toBe('rana');
  });

  it('drops a remembered cloud session whose account is gone', async () => {
    const backend = new MemoryBackend();
    const { auth, storage } = cloudAuth(backend);
    await auth.signUpEmail('ana@example.com', 'secret1', 'AnaCraft');
    await backend.auth.signOut(); // e.g. token revoked: listener clears the session
    expect(auth.state).toBe('signed-out');
    expect(await cloudAuth(backend, storage).auth.init()).toBeNull();
  });

  it('keeps an account playable offline when the SDK cannot load', async () => {
    const backend = new MemoryBackend();
    const { auth, storage } = cloudAuth(backend);
    const u = await auth.signUpEmail('ana@example.com', 'secret1', 'AnaCraft');
    const offline = cloudAuth(null, storage).auth;
    expect(await offline.init()).toMatchObject({ kind: 'cloud', id: u.id, name: 'AnaCraft' });
    expect(offline.cloudAvailable).toBe(false);
    expect(await codeOf(offline.signInGoogle())).toBe('network');
  });

  it('preload fetches the backend once', async () => {
    const backend = new MemoryBackend();
    const c = cloudAuth(backend);
    c.auth.preload();
    c.auth.preload();
    await c.auth.signInGoogle();
    expect(c.loads()).toBe(1);
  });
});

describe('bindSaveToAuth', () => {
  it('writes the local profile into the device save and switches copies for cloud accounts', async () => {
    const storage = memStorage();
    const backend = new MemoryBackend();
    const { auth } = cloudAuth(backend, storage);
    const store = new CloudSaveStore({ storage, win: null, doc: null });
    const unbind = bindSaveToAuth(auth, store);
    auth.createLocalProfile('Ana', 'alex');
    await Promise.resolve();
    await Promise.resolve();
    expect(store.load().profile).toMatchObject({ name: 'Ana', avatar: 'alex' });
    expect(store.key).toBe('minesurvive.save');
    expect(leaderboardFor(auth, store).online).toBe(false);

    const u = await auth.signUpEmail('ana@example.com', 'secret1', 'AnaCraft', 'rana');
    await store.flush();
    expect(store.key).toBe(`minesurvive.save.${u.id}`);
    expect(store.uid).toBe(u.id);
    expect(store.load().profile).toMatchObject({ name: 'AnaCraft', avatar: 'rana' });
    expect(leaderboardFor(auth, store).online).toBe(true);

    await auth.signOut();
    await store.flush();
    await new Promise((r) => setTimeout(r, 0));
    expect(store.key).toBe('minesurvive.save');
    expect(store.load().profile.name).toBe('Ana');
    unbind();
    store.dispose();
  });
});
