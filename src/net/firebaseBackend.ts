/**
 * Firebase implementation of CloudBackend (modular SDK). Only ever loaded through the dynamic
 * import in `loadBackend`, so the SDK is code-split into its own chunk and the main bundle stays
 * free of it. Document layout and security rules: firestore.rules, docs/FIREBASE_SETUP.md.
 */
import { getApps, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  type Firestore,
  type QueryConstraint,
} from 'firebase/firestore';
import type { SaveData } from '../core/save';
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
import type { FirebaseWebConfig } from './config';
import { CloudError, toCloudError } from './errors';
import { compareEntries, isBetterEntry } from './leaderboard';
import { normalizeNick } from './validate';

const millis = (v: unknown): number =>
  v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0;

function toUser(u: User): AuthUser {
  const google = u.providerData.some((p) => p.providerId === 'google.com');
  return {
    uid: u.uid,
    email: u.email,
    displayName: u.displayName,
    provider: google ? 'google' : 'password',
  };
}

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw toCloudError(e);
  }
}

function toEntry(id: string, d: Record<string, unknown>): LeaderboardEntry {
  return {
    uid: typeof d.uid === 'string' ? d.uid : id,
    nick: typeof d.nick === 'string' ? d.nick : '?',
    avatar: typeof d.avatar === 'string' ? d.avatar : 'steve',
    hero: typeof d.hero === 'string' ? d.hero : 'steve',
    timeSec: typeof d.timeSec === 'number' ? d.timeSec : 0,
    kills: typeof d.kills === 'number' ? d.kills : 0,
    at: millis(d.at),
  };
}

class FirebaseBackend implements CloudBackend {
  readonly kind = 'firebase' as const;
  private readonly fbAuth: Auth;
  private readonly db: Firestore;
  private readonly redirectDone: Promise<unknown>;

  constructor(config: FirebaseWebConfig) {
    const app = getApps()[0] ?? initializeApp(config);
    this.fbAuth = getAuth(app); // persistence: IndexedDB, falling back to localStorage
    this.db = getFirestore(app);
    // Finish a Google sign-in that fell back to a redirect (popup blocked).
    this.redirectDone = getRedirectResult(this.fbAuth).catch((e: unknown) => {
      console.warn('[cloud] redirect sign-in failed', toCloudError(e).code);
    });
  }

  readonly auth: CloudAuth = {
    current: () => (this.fbAuth.currentUser ? toUser(this.fbAuth.currentUser) : null),
    ready: async () => {
      await this.redirectDone;
      await this.fbAuth.authStateReady();
    },
    onChange: (cb) => onAuthStateChanged(this.fbAuth, (u) => cb(u ? toUser(u) : null)),
    signInGoogle: async () => {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      try {
        return toUser((await signInWithPopup(this.fbAuth, provider)).user);
      } catch (e) {
        const err = toCloudError(e);
        if (err.code !== 'popup-blocked') throw err;
        // The page navigates away; AuthService.init() completes the sign-in on return.
        await guard(() => signInWithRedirect(this.fbAuth, provider));
        throw new CloudError('redirecting');
      }
    },
    signInEmail: (email, password) =>
      guard(async () =>
        toUser((await signInWithEmailAndPassword(this.fbAuth, email, password)).user),
      ),
    signUpEmail: (email, password, displayName) =>
      guard(async () => {
        const cred = await createUserWithEmailAndPassword(this.fbAuth, email, password);
        await updateProfile(cred.user, { displayName }).catch(() => undefined);
        return toUser(cred.user);
      }),
    signOut: () => guard(() => signOut(this.fbAuth)),
    sendReset: (email) => guard(() => sendPasswordResetEmail(this.fbAuth, email)),
  };

  getSave(uid: string): Promise<RemoteSave<unknown> | null> {
    return guard(async () => {
      const snap = await getDoc(doc(this.db, 'saves', uid));
      if (!snap.exists()) return null;
      const d = snap.data({ serverTimestamps: 'estimate' });
      return { save: d.save, updatedAt: millis(d.updatedAt), v: typeof d.v === 'number' ? d.v : 0 };
    });
  }

  putSave(uid: string, save: SaveData, baseRev: number): Promise<RemoteSave> {
    return guard(async () => {
      const ref = doc(this.db, 'saves', uid);
      const v = await runTransaction(this.db, async (tx) => {
        const snap = await tx.get(ref);
        const cur = snap.exists() ? Number(snap.data().v) || 0 : 0;
        if (cur !== baseRev) throw new CloudError('conflict');
        // JSON round trip drops undefined values, which Firestore rejects.
        const plain = JSON.parse(JSON.stringify(save)) as SaveData;
        tx.set(ref, { save: plain, updatedAt: serverTimestamp(), v: baseRev + 1 });
        return baseRev + 1;
      });
      return { save, updatedAt: Date.now(), v };
    });
  }

  getProfile(uid: string): Promise<PublicProfile | null> {
    return guard(async () => {
      const snap = await getDoc(doc(this.db, 'profiles', uid));
      if (!snap.exists()) return null;
      const d = snap.data();
      return typeof d.nick === 'string'
        ? { nick: d.nick, avatar: typeof d.avatar === 'string' ? d.avatar : 'steve' }
        : null;
    });
  }

  nicknameAvailable(nick: string): Promise<boolean> {
    return guard(async () => !(await getDoc(doc(this.db, 'names', normalizeNick(nick)))).exists());
  }

  claimNickname(uid: string, nick: string, avatar?: string): Promise<boolean> {
    return guard(() =>
      runTransaction(this.db, async (tx) => {
        const lower = normalizeNick(nick);
        const nameRef = doc(this.db, 'names', lower);
        const profRef = doc(this.db, 'profiles', uid);
        const [name, prof] = await Promise.all([tx.get(nameRef), tx.get(profRef)]);
        const holder = name.exists() ? name.data().uid : null;
        if (holder && holder !== uid) return false;
        const prev = prof.exists() ? prof.data() : null;
        const prevLower = typeof prev?.lower === 'string' ? prev.lower : null;
        if (prevLower && prevLower !== lower) {
          const prevRef = doc(this.db, 'names', prevLower);
          const old = await tx.get(prevRef);
          if (old.exists() && old.data().uid === uid) tx.delete(prevRef);
        }
        if (!holder) tx.set(nameRef, { uid });
        tx.set(profRef, {
          nick: nick.trim(),
          lower,
          avatar: avatar ?? (typeof prev?.avatar === 'string' ? prev.avatar : 'steve'),
          at: serverTimestamp(),
        });
        return true;
      }),
    );
  }

  setProfile(uid: string, profile: PublicProfile): Promise<void> {
    return guard(() =>
      setDoc(doc(this.db, 'profiles', uid), {
        nick: profile.nick.trim(),
        lower: normalizeNick(profile.nick),
        avatar: profile.avatar,
        at: serverTimestamp(),
      }),
    );
  }

  markRunStart(uid: string): Promise<void> {
    return guard(() => setDoc(doc(this.db, 'runs', uid), { startedAt: serverTimestamp() }));
  }

  private entries(board: string) {
    return collection(this.db, 'lb', board, 'e');
  }

  readonly leaderboard: CloudLeaderboard = {
    submit: (board: string, entry: LeaderboardSubmission) =>
      guard(() =>
        runTransaction(this.db, async (tx) => {
          const ref = doc(this.entries(board), entry.uid);
          const snap = await tx.get(ref);
          if (snap.exists() && !isBetterEntry(entry, toEntry(snap.id, snap.data()))) return false;
          tx.set(ref, { ...entry, at: serverTimestamp() });
          return true;
        }),
      ),
    top: (board, n, hero) =>
      guard(async () => {
        const cons: QueryConstraint[] = hero ? [where('hero', '==', hero)] : [];
        cons.push(orderBy('timeSec', 'desc'), limit(Math.max(1, Math.min(100, n))));
        const snap = await getDocs(query(this.entries(board), ...cons));
        return snap.docs.map((d) => toEntry(d.id, d.data())).sort(compareEntries);
      }),
    rank: (board, uid) =>
      guard(async () => {
        const mine = await getDoc(doc(this.entries(board), uid));
        if (!mine.exists()) return null;
        const t = toEntry(mine.id, mine.data()).timeSec;
        const above = await getCountFromServer(
          query(this.entries(board), where('timeSec', '>', t)),
        );
        return above.data().count + 1;
      }),
    get: (board, uid) =>
      guard(async () => {
        const snap = await getDoc(doc(this.entries(board), uid));
        return snap.exists() ? toEntry(snap.id, snap.data()) : null;
      }),
  };
}

export function createFirebaseBackend(config: FirebaseWebConfig): CloudBackend {
  return new FirebaseBackend(config);
}
