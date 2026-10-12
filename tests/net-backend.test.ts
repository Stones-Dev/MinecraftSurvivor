import { describe, expect, it } from 'vitest';
import { defaultSave } from '../src/core/save';
import { parseFirebaseConfig } from '../src/net/config';
import { CloudError, friendlyMessage, toCloudError } from '../src/net/errors';
import { MemoryBackend, MemoryServer } from '../src/net/memoryBackend';
import {
  emailError,
  localNameError,
  nicknameError,
  normalizeNick,
  passwordError,
  suggestNickname,
} from '../src/net/validate';
import {
  describeSummary,
  errorText,
  formatAgo,
  NOT_CONFIGURED_TEXT,
  validateLocalName,
  validateSignIn,
  validateSignUp,
} from '../src/ui/authOverlay';
import { summarizeSave } from '../src/core/save';

const codeOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return e instanceof CloudError ? e.code : 'not-a-cloud-error';
  }
};

describe('config', () => {
  const full = {
    VITE_FIREBASE_API_KEY: ' AIzaKey ',
    VITE_FIREBASE_AUTH_DOMAIN: 'demo.firebaseapp.com',
    VITE_FIREBASE_PROJECT_ID: 'demo',
    VITE_FIREBASE_APP_ID: '1:2:web:3',
  };

  it('builds a config only when the required values are present', () => {
    expect(parseFirebaseConfig(full)).toEqual({
      apiKey: 'AIzaKey',
      authDomain: 'demo.firebaseapp.com',
      projectId: 'demo',
      appId: '1:2:web:3',
    });
    expect(
      parseFirebaseConfig({ ...full, VITE_FIREBASE_MESSAGING_SENDER_ID: '123' })?.messagingSenderId,
    ).toBe('123');
    expect(parseFirebaseConfig({})).toBeNull();
    expect(parseFirebaseConfig({ ...full, VITE_FIREBASE_APP_ID: '' })).toBeNull();
    expect(parseFirebaseConfig({ ...full, VITE_FIREBASE_PROJECT_ID: 42 })).toBeNull();
  });

  it('rejects template placeholders', () => {
    expect(parseFirebaseConfig({ ...full, VITE_FIREBASE_API_KEY: 'your-api-key' })).toBeNull();
    expect(parseFirebaseConfig({ ...full, VITE_FIREBASE_PROJECT_ID: '<project>' })).toBeNull();
  });
});

describe('errors and validators', () => {
  it('maps Firebase codes to friendly codes', () => {
    expect(toCloudError({ code: 'auth/popup-blocked' }).code).toBe('popup-blocked');
    expect(toCloudError({ code: 'auth/invalid-credential' }).code).toBe('invalid-credentials');
    expect(toCloudError({ code: 'auth/email-already-in-use' }).code).toBe('email-in-use');
    expect(toCloudError({ code: 'auth/weak-password' }).code).toBe('weak-password');
    expect(toCloudError({ code: 'auth/network-request-failed' }).code).toBe('network');
    expect(toCloudError({ code: 'unavailable' }).code).toBe('network');
    expect(toCloudError({ code: 'permission-denied' }).code).toBe('permission');
    expect(toCloudError(new TypeError('Failed to fetch')).code).toBe('network');
    expect(toCloudError('weird').code).toBe('unknown');
    const own = new CloudError('conflict');
    expect(toCloudError(own)).toBe(own);
    expect(own.message).toBe(friendlyMessage('conflict'));
  });

  it('validates nicknames, emails, passwords and local names', () => {
    expect(nicknameError('Steve_42')).toBeNull();
    expect(nicknameError('ab')).toBe('invalid-nickname');
    expect(nicknameError('a'.repeat(17))).toBe('invalid-nickname');
    expect(nicknameError('no spaces')).toBe('invalid-nickname');
    expect(nicknameError('ñandú')).toBe('invalid-nickname');
    expect(normalizeNick(' Steve_42 ')).toBe('steve_42');
    expect(emailError('a@b.co')).toBeNull();
    expect(emailError('a@b')).toBe('invalid-email');
    expect(passwordError('12345')).toBe('weak-password');
    expect(passwordError('123456')).toBeNull();
    expect(localNameError('Ana María')).toBeNull();
    expect(localNameError('   ')).toBe('invalid-name');
    expect(localNameError('<script>')).toBe('invalid-name');
    expect(localNameError('x'.repeat(17))).toBe('invalid-name');
    expect(suggestNickname('Ana María')).toBe('AnaMara');
    expect(suggestNickname('jo@example.com')).toBe('joplayer');
    expect(nicknameError(suggestNickname(null))).toBeNull();
  });

  it('overlay helpers give field messages', () => {
    expect(validateSignUp({ email: 'a@b.co', password: 'secret', nick: 'Alex' })).toEqual({});
    const bad = validateSignUp({ email: 'x', password: '1', nick: '!' });
    expect(Object.keys(bad).sort()).toEqual(['email', 'nick', 'password']);
    expect(validateSignIn('a@b.co', '')).toEqual({ password: 'Enter your password.' });
    expect(validateLocalName('')).toBe(friendlyMessage('invalid-name'));
    expect(validateLocalName('Bob')).toBeNull();
    expect(errorText(new CloudError('nickname-taken'))).toBe(friendlyMessage('nickname-taken'));
    expect(errorText(new Error('boom'))).toBe(friendlyMessage('unknown'));
    expect(friendlyMessage('not-configured')).toContain(NOT_CONFIGURED_TEXT);
    expect(formatAgo(0)).toBe('never');
    expect(formatAgo(1000, 31_000)).toBe('just now');
    expect(formatAgo(0 + 1, 1 + 5 * 60_000)).toBe('5 min ago');
    expect(formatAgo(1, 1 + 3 * 86_400_000)).toBe('3 days ago');
    const s = summarizeSave(defaultSave(1000));
    expect(describeSummary(s, 1000)).toBe(
      '0 runs, 500 emeralds, 1 companions, last played just now',
    );
  });
});

describe('MemoryBackend', () => {
  it('signs up, signs in and rejects bad credentials', async () => {
    const b = new MemoryBackend();
    const u = await b.auth.signUpEmail('Ana@Example.com', 'secret1', 'Ana');
    expect(u.email).toBe('ana@example.com');
    expect(b.auth.current()?.uid).toBe(u.uid);
    expect(await codeOf(b.auth.signUpEmail('ana@example.com', 'secret1', 'X'))).toBe(
      'email-in-use',
    );
    expect(await codeOf(b.auth.signUpEmail('new@example.com', '123', 'X'))).toBe('weak-password');
    await b.auth.signOut();
    expect(b.auth.current()).toBeNull();
    expect(await codeOf(b.auth.signInEmail('ana@example.com', 'wrong!'))).toBe(
      'invalid-credentials',
    );
    expect((await b.auth.signInEmail('ana@example.com', 'secret1')).uid).toBe(u.uid);
    await b.auth.sendReset('ana@example.com');
    expect(b.resetsSent).toEqual(['ana@example.com']);
  });

  it('notifies auth listeners and keeps the same uid for the same Google account', async () => {
    const server = new MemoryServer();
    const a = new MemoryBackend({ server });
    const b = new MemoryBackend({ server });
    const seen: (string | null)[] = [];
    const off = a.auth.onChange((u) => seen.push(u?.uid ?? null));
    const ua = await a.auth.signInGoogle();
    const ub = await b.auth.signInGoogle();
    expect(ua.uid).toBe(ub.uid);
    expect(ua.provider).toBe('google');
    await a.auth.signOut();
    off();
    await a.auth.signInGoogle();
    expect(seen).toEqual([ua.uid, null]);
    b.popupBlocked = true;
    expect(await codeOf(b.auth.signInGoogle())).toBe('popup-blocked');
  });

  it('stores saves per owner with revision checks', async () => {
    const b = new MemoryBackend();
    const u = await b.auth.signInGoogle();
    expect(await b.getSave(u.uid)).toBeNull();
    const s = defaultSave(1);
    const r1 = await b.putSave(u.uid, s, 0);
    expect(r1.v).toBe(1);
    expect(await codeOf(b.putSave(u.uid, s, 0))).toBe('conflict'); // stale base
    const r2 = await b.putSave(u.uid, s, 1);
    expect(r2.v).toBe(2);
    expect(r2.updatedAt).toBeGreaterThan(r1.updatedAt);
    expect((await b.getSave(u.uid))?.v).toBe(2);
    expect(await codeOf(b.getSave('someone-else'))).toBe('permission');
    expect(await codeOf(b.putSave('someone-else', s, 0))).toBe('permission');
    // Stored copies are isolated from later mutation.
    s.currencies.emeralds = 1;
    expect(((await b.getSave(u.uid))?.save as typeof s).currencies.emeralds).toBe(500);
  });

  it('claims unique case-insensitive nicknames and releases the old one on rename', async () => {
    const server = new MemoryServer();
    const a = new MemoryBackend({ server });
    const b = new MemoryBackend({ server, googleAccount: { email: 'b@x.io', displayName: 'B' } });
    const ua = await a.auth.signInGoogle();
    const ub = await b.auth.signInGoogle();
    expect(await a.nicknameAvailable('Creeper')).toBe(true);
    expect(await a.claimNickname(ua.uid, 'Creeper', 'alex')).toBe(true);
    expect(await b.nicknameAvailable('cREEPER')).toBe(false);
    expect(await b.claimNickname(ub.uid, 'creeper')).toBe(false);
    expect(await a.claimNickname(ua.uid, 'Creeper')).toBe(true); // idempotent
    expect(await a.getProfile(ua.uid)).toEqual({ nick: 'Creeper', avatar: 'alex' });
    expect(await a.claimNickname(ua.uid, 'Zombie')).toBe(true);
    expect(await b.claimNickname(ub.uid, 'creeper')).toBe(true); // released
    expect(await codeOf(a.claimNickname(ua.uid, 'x'))).toBe('invalid-nickname');
    expect(await codeOf(a.setProfile(ua.uid, { nick: 'creeper', avatar: 'steve' }))).toBe(
      'permission',
    );
    await a.setProfile(ua.uid, { nick: 'Zombie', avatar: 'rana' });
    expect(await b.getProfile(ua.uid)).toEqual({ nick: 'Zombie', avatar: 'rana' });
  });

  it('fails every call with network while offline, and supports latency', async () => {
    const b = new MemoryBackend({ latencyMs: 5 });
    const u = await b.auth.signInGoogle();
    b.offline = true;
    expect(await codeOf(b.getSave(u.uid))).toBe('network');
    b.offline = false;
    expect(await b.getSave(u.uid)).toBeNull();
  });
});
