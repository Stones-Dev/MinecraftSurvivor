import type { AuthService, SessionUser } from './auth';
import type { CloudSaveStore } from './cloudSave';
import { CloudLeaderboardService, LocalLeaderboard, type LeaderboardView } from './leaderboard';

/**
 * Glue between the account service and the save store, so app wiring is one call:
 *   cloud user  -> the store switches to the account copy and syncs (attach)
 *   local user  -> device copy, profile name/avatar written into the save
 *   guest/none  -> device copy
 * The save's `profile` mirrors the session (nickname or local name, avatar). Returns an unsubscribe.
 */
export function bindSaveToAuth(auth: AuthService, store: CloudSaveStore): () => void {
  let lastKey = '';
  const applyProfile = (u: SessionUser): void => {
    const data = store.load();
    const name = u.kind === 'cloud' && u.needsNickname ? data.profile.name : u.name;
    const id = u.kind === 'local' ? u.id : data.profile.id;
    if (data.profile.name === name && data.profile.avatar === u.avatar && data.profile.id === id)
      return;
    data.profile = { id, name, avatar: u.avatar };
    store.save(data);
  };
  const onChange = (u: SessionUser | null): void => {
    const backend = auth.backend;
    const key = u ? `${u.kind}:${u.id}:${u.kind === 'cloud' && backend ? 'on' : 'off'}` : 'none';
    if (key === lastKey) {
      if (u && u.kind !== 'guest') applyProfile(u); // nickname/avatar change
      return;
    }
    lastKey = key;
    if (u?.kind === 'cloud') {
      if (backend) {
        void store.attach(backend, u.id).then(() => {
          const cur = auth.user();
          if (cur?.kind === 'cloud' && cur.id === u.id) applyProfile(cur);
        });
      } else {
        store.attachOffline(u.id);
        applyProfile(u);
      }
      return;
    }
    void store.detach().then(() => {
      const cur = auth.user();
      if (cur?.kind === 'local') applyProfile(cur);
    });
  };
  const unsubAuth = auth.onChange((u) => onChange(u));
  // Push pending progress while the account is still signed in.
  // (Bounded: a slow network must not hold the sign-out; unsent changes stay in the account's
  // device copy and sync on the next sign-in.)
  const unsubHook = auth.addSignOutHook(() =>
    Promise.race([store.flush(), new Promise((r) => setTimeout(r, 4000))]),
  );
  const unsubData = store.onDataReplaced(() => {
    const cur = auth.user();
    if (cur && cur.kind !== 'guest' && store.status !== 'conflict') applyProfile(cur);
  });
  onChange(auth.user());
  return () => {
    unsubAuth();
    unsubData();
    unsubHook();
  };
}

/**
 * The leaderboard to show/submit to for the current session: the cloud one for a signed-in player
 * with a nickname, otherwise the local one built from the save.
 */
export function leaderboardFor(
  auth: AuthService,
  store: CloudSaveStore,
): LeaderboardView & {
  submitRun?: CloudLeaderboardService['submitRun'];
  runStarted?: () => Promise<void>;
} {
  const u = auth.user();
  const backend = auth.backend;
  if (u?.kind === 'cloud' && backend && !u.needsNickname) {
    return new CloudLeaderboardService(backend, () => {
      const cur = auth.user();
      return cur?.kind === 'cloud' && !cur.needsNickname
        ? { uid: cur.id, nick: cur.name, avatar: cur.avatar }
        : null;
    });
  }
  return new LocalLeaderboard(() => store.load());
}
