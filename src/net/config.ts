/**
 * Firebase web config from Vite env vars (VITE_FIREBASE_*, see .env.example and
 * docs/FIREBASE_SETUP.md). These are public identifiers, not secrets. When any required value is
 * missing the game runs in local/guest mode only.
 */
export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  messagingSenderId?: string;
}

type Env = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Build the config from an env object; null unless apiKey, authDomain, projectId and appId are set. */
export function parseFirebaseConfig(env: Env): FirebaseWebConfig | null {
  const apiKey = str(env.VITE_FIREBASE_API_KEY);
  const authDomain = str(env.VITE_FIREBASE_AUTH_DOMAIN);
  const projectId = str(env.VITE_FIREBASE_PROJECT_ID);
  const appId = str(env.VITE_FIREBASE_APP_ID);
  const messagingSenderId = str(env.VITE_FIREBASE_MESSAGING_SENDER_ID);
  if (!apiKey || !authDomain || !projectId || !appId) return null;
  // Guard against half-edited templates ("your-api-key", "<...>") reaching the SDK.
  if ([apiKey, authDomain, projectId, appId].some((v) => /[<>\s]|^your[-_]/i.test(v))) return null;
  return messagingSenderId
    ? { apiKey, authDomain, projectId, appId, messagingSenderId }
    : { apiKey, authDomain, projectId, appId };
}

export const firebaseConfig: FirebaseWebConfig | null = parseFirebaseConfig(
  import.meta.env as unknown as Env,
);

/** True when this build has a Firebase project behind it (cloud accounts possible). */
export const cloudConfigured: boolean = firebaseConfig !== null;
