/**
 * Error vocabulary shared by every cloud backend and the auth/sync services. Backends map their
 * native errors (Firebase `auth/...` and Firestore codes) to these so the UI can show a friendly
 * message without knowing which backend is in use. Pure module: no SDK imports.
 */
export type CloudErrorCode =
  | 'not-configured'
  | 'network'
  | 'popup-blocked'
  | 'popup-closed'
  | 'redirecting'
  | 'invalid-credentials'
  | 'invalid-email'
  | 'email-in-use'
  | 'weak-password'
  | 'too-many-requests'
  | 'unauthorized-domain'
  | 'provider-disabled'
  | 'nickname-taken'
  | 'invalid-nickname'
  | 'invalid-name'
  | 'needs-nickname'
  | 'not-signed-in'
  | 'permission'
  | 'conflict'
  | 'remote-newer'
  | 'unknown';

export class CloudError extends Error {
  constructor(
    readonly code: CloudErrorCode,
    message?: string,
  ) {
    super(message ?? friendlyMessage(code));
    this.name = 'CloudError';
  }
}

/** Thrown by `AuthService`; `code` drives the message the overlay shows. */
export class AuthError extends CloudError {
  constructor(code: CloudErrorCode, message?: string) {
    super(code, message);
    this.name = 'AuthError';
  }
}

const FIREBASE_CODES: Record<string, CloudErrorCode> = {
  'auth/popup-blocked': 'popup-blocked',
  'auth/popup-closed-by-user': 'popup-closed',
  'auth/cancelled-popup-request': 'popup-closed',
  'auth/user-cancelled': 'popup-closed',
  'auth/wrong-password': 'invalid-credentials',
  'auth/user-not-found': 'invalid-credentials',
  'auth/invalid-credential': 'invalid-credentials',
  'auth/invalid-login-credentials': 'invalid-credentials',
  'auth/user-disabled': 'invalid-credentials',
  'auth/invalid-email': 'invalid-email',
  'auth/missing-email': 'invalid-email',
  'auth/email-already-in-use': 'email-in-use',
  'auth/credential-already-in-use': 'email-in-use',
  'auth/account-exists-with-different-credential': 'email-in-use',
  'auth/weak-password': 'weak-password',
  'auth/missing-password': 'weak-password',
  'auth/network-request-failed': 'network',
  'auth/timeout': 'network',
  'auth/too-many-requests': 'too-many-requests',
  'auth/unauthorized-domain': 'unauthorized-domain',
  'auth/operation-not-allowed': 'provider-disabled',
  'auth/invalid-api-key': 'not-configured',
  'auth/api-key-not-valid': 'not-configured',
  'auth/configuration-not-found': 'provider-disabled',
  // Firestore (codes come without a prefix).
  unavailable: 'network',
  'deadline-exceeded': 'network',
  aborted: 'network',
  cancelled: 'network',
  'resource-exhausted': 'too-many-requests',
  'permission-denied': 'permission',
  unauthenticated: 'not-signed-in',
  'failed-precondition': 'conflict',
};

/** Map any thrown value (Firebase error, CloudError, string) to a CloudError. */
export function toCloudError(e: unknown): CloudError {
  if (e instanceof CloudError) return e;
  const code =
    typeof e === 'object' && e !== null && 'code' in e && typeof e.code === 'string' ? e.code : '';
  const mapped = FIREBASE_CODES[code.replace(/^firestore\//, '')];
  if (mapped) return new CloudError(mapped);
  // Offline browsers often surface fetch failures as TypeErrors.
  if (e instanceof TypeError && /fetch|network/i.test(e.message)) return new CloudError('network');
  return new CloudError('unknown', e instanceof Error && e.message ? e.message : undefined);
}

/** True for errors worth retrying later (offline, transient). */
export const isTransient = (e: CloudError): boolean => e.code === 'network';

const MESSAGES: Record<CloudErrorCode, string> = {
  'not-configured': 'Cloud accounts are not configured on this deployment.',
  network: 'No connection to the server. Check your internet and try again.',
  'popup-blocked': 'The sign-in window was blocked. Allow pop-ups for this site and try again.',
  'popup-closed': 'Sign-in was cancelled.',
  redirecting: 'Redirecting to Google...',
  'invalid-credentials': 'Wrong email or password.',
  'invalid-email': 'Enter a valid email address.',
  'email-in-use': 'An account already exists with this email. Sign in instead.',
  'weak-password': 'Use a password with at least 6 characters.',
  'too-many-requests': 'Too many attempts. Wait a moment and try again.',
  'unauthorized-domain':
    'This site is not authorized for sign-in yet (Firebase authorized domains).',
  'provider-disabled': 'This sign-in method is not enabled for this game yet.',
  'nickname-taken': 'That nickname is taken. Try another one.',
  'invalid-nickname': 'Nicknames use 3-16 letters, digits or _.',
  'invalid-name': 'Enter a name (1-16 characters).',
  'needs-nickname': 'Choose a nickname to finish creating your account.',
  'not-signed-in': 'You need to sign in first.',
  permission: 'The server refused this change.',
  conflict: 'Your save changed on another device.',
  'remote-newer': 'Your cloud save comes from a newer version of the game. Reload to update.',
  unknown: 'Something went wrong. Please try again.',
};

export function friendlyMessage(code: CloudErrorCode): string {
  return MESSAGES[code];
}
