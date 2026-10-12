/**
 * Pure input validators shared by AuthService, the backends and the auth overlay. Each returns
 * null when the value is fine, or the error code to show.
 */
import type { CloudErrorCode } from './errors';

export const NICK_RE = /^[A-Za-z0-9_]{3,16}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const MIN_PASSWORD = 6;

/** Lowercase key of a nickname (`names/{lower}` document id). */
export const normalizeNick = (nick: string): string => nick.trim().toLowerCase();

export function nicknameError(nick: string): CloudErrorCode | null {
  return NICK_RE.test(nick.trim()) ? null : 'invalid-nickname';
}

export function emailError(email: string): CloudErrorCode | null {
  return EMAIL_RE.test(email.trim()) ? null : 'invalid-email';
}

export function passwordError(password: string): CloudErrorCode | null {
  return password.length >= MIN_PASSWORD ? null : 'weak-password';
}

/** Local profile names are freer than nicknames (not unique): 1-16 printable characters. */
export function localNameError(name: string): CloudErrorCode | null {
  const t = name.trim();
  // eslint-disable-next-line no-control-regex
  if (!t || [...t].length > 16 || /[\u0000-\u001f\u007f-\u009f<>]/.test(t)) return 'invalid-name';
  return null;
}

/** Suggest a valid nickname from a display name or email ("Ana María" -> "AnaMara"). */
export function suggestNickname(source: string | null | undefined): string {
  const base = (source ?? '').split('@')[0] ?? '';
  const clean = base.replace(/[^A-Za-z0-9_]/g, '').slice(0, 16);
  return clean.length >= 3 ? clean : (clean + 'player').slice(0, 16);
}
