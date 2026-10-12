/**
 * Account overlay: a real DOM dialog over the canvas (not canvas UI) so paste, password managers,
 * IME input and screen readers work. Dependency-free; styles are injected once in a <style>
 * element and every node is removed on close.
 *
 *   const user = await openAuthOverlay(auth, { heroes });   // SessionUser, or null if dismissed
 *   const choice = await openConflictDialog(conflict);      // 'local' | 'cloud'
 */
import type { AuthService, SessionUser } from '../net/auth';
import type { SyncConflict } from '../net/cloudSave';
import { CloudError, friendlyMessage, type CloudErrorCode } from '../net/errors';
import { emailError, localNameError, nicknameError, passwordError } from '../net/validate';
import type { SaveSummary } from '../core/save';

export type AuthTab = 'signin' | 'create' | 'guest';

export interface AuthOverlayOptions {
  /** Hero ids/names offered as avatars; `icon` is an optional image URL (data: URLs work). */
  heroes: { id: string; name: string; icon?: string }[];
  initialTab?: AuthTab;
  /** Allow closing without choosing (Escape, backdrop click, close button). Default true. */
  dismissible?: boolean;
  /** Settings > accessibility text scale. */
  textScale?: 1 | 2;
}

// ---------- pure helpers (unit-tested) ----------

export const NOT_CONFIGURED_TEXT = 'Cloud accounts are not configured on this deployment';

/** Message for an error thrown by AuthService (or anything else). */
export function errorText(e: unknown): string {
  if (e instanceof CloudError) return e.message || friendlyMessage(e.code);
  return friendlyMessage('unknown');
}

export interface SignUpFields {
  email: string;
  password: string;
  nick: string;
}

/** Field -> message for the cloud sign-up form (empty object when valid). */
export function validateSignUp(f: SignUpFields): Partial<Record<keyof SignUpFields, string>> {
  const out: Partial<Record<keyof SignUpFields, string>> = {};
  const put = (k: keyof SignUpFields, code: CloudErrorCode | null): void => {
    if (code) out[k] = friendlyMessage(code);
  };
  put('nick', nicknameError(f.nick));
  put('email', emailError(f.email));
  put('password', passwordError(f.password));
  return out;
}

/** Field -> message for the sign-in form. */
export function validateSignIn(
  email: string,
  password: string,
): Partial<Record<'email' | 'password', string>> {
  const out: Partial<Record<'email' | 'password', string>> = {};
  const e = emailError(email);
  if (e) out.email = friendlyMessage(e);
  if (!password) out.password = 'Enter your password.';
  return out;
}

export function validateLocalName(name: string): string | null {
  const e = localNameError(name);
  return e ? friendlyMessage(e) : null;
}

/** "3 min ago", "2 days ago", "never". */
export function formatAgo(ms: number, now = Date.now()): string {
  if (!ms) return 'never';
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

/** One-line description of a save for the conflict dialog. */
export function describeSummary(s: SaveSummary, now = Date.now()): string {
  return `${s.runs} runs, ${s.emeralds} emeralds, ${s.owned} companions, last played ${formatAgo(s.lastPlayed, now)}`;
}

// ---------- DOM ----------

const STYLE_ID = 'ms-auth-style';
const CSS = `
.msa-backdrop{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;
  background:rgba(8,6,4,.72);padding:16px;box-sizing:border-box;font:15px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;color:#eee6d8}
.msa-dialog{position:relative;width:100%;max-width:440px;max-height:calc(100vh - 32px);overflow:auto;box-sizing:border-box;
  background:#2b2622;border:4px solid #0f0d0b;box-shadow:inset 0 0 0 3px #5b5048,0 8px 0 rgba(0,0,0,.4);padding:18px 18px 16px;image-rendering:pixelated}
.msa-dialog *{box-sizing:border-box}
.msa-title{margin:0 32px 12px 0;font:700 1.25em/1.2 "Tiny5","Pixelify Sans",monospace;letter-spacing:.5px;color:#f8e9b0;text-shadow:2px 2px 0 #000}
.msa-close{position:absolute;top:10px;right:10px;width:32px;height:32px;border:2px solid #0f0d0b;background:#4a413a;color:#eee;font-size:18px;cursor:pointer}
.msa-tabs{display:flex;gap:4px;margin-bottom:12px}
.msa-tab{flex:1;padding:8px 4px;border:2px solid #0f0d0b;background:#3a332d;color:#cbbfae;cursor:pointer;font:inherit;font-size:.9em}
.msa-tab[aria-selected=true]{background:#6b8f3a;color:#fff;box-shadow:inset 0 -3px 0 #3f5a1f}
.msa-panel[hidden]{display:none}
.msa-note{margin:0 0 10px;font-size:.9em;color:#cbbfae}
.msa-warn{margin:0 0 10px;padding:8px 10px;border:2px solid #0f0d0b;background:#4a3a22;color:#f3d79a;font-size:.9em}
.msa-field{display:block;margin:0 0 10px}
.msa-field>span{display:block;margin-bottom:3px;font-size:.85em;color:#d9cdbb}
.msa-input{width:100%;padding:9px 10px;border:2px solid #0f0d0b;background:#171411;color:#fff;font:inherit;border-radius:0}
.msa-input:focus{outline:3px solid #9bd14f;outline-offset:0}
.msa-input[aria-invalid=true]{border-color:#d0463c}
.msa-hint{display:block;min-height:1.2em;margin-top:2px;font-size:.8em;color:#cbbfae}
.msa-hint.bad{color:#ff8a7a}.msa-hint.good{color:#9bd14f}
.msa-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin:6px 0;padding:10px 12px;border:2px solid #0f0d0b;
  background:#6b8f3a;color:#fff;font:inherit;font-weight:600;cursor:pointer;box-shadow:inset 0 -4px 0 #3f5a1f,inset 0 2px 0 #8fb85a}
.msa-btn:hover:not(:disabled){filter:brightness(1.1)}
.msa-btn:focus-visible,.msa-tab:focus-visible,.msa-close:focus-visible,.msa-link:focus-visible,.msa-avatar:focus-visible{outline:3px solid #f8e9b0;outline-offset:1px}
.msa-btn.alt{background:#5b5048;box-shadow:inset 0 -4px 0 #3a332d,inset 0 2px 0 #7a6d62}
.msa-btn.google{background:#f2f2f2;color:#222;box-shadow:inset 0 -4px 0 #bdbdbd}
.msa-btn:disabled{opacity:.55;cursor:not-allowed}
.msa-link{background:none;border:0;padding:2px 0;color:#9bd14f;text-decoration:underline;cursor:pointer;font:inherit;font-size:.85em}
.msa-or{display:flex;align-items:center;gap:8px;margin:8px 0;color:#9a8f80;font-size:.8em}
.msa-or:before,.msa-or:after{content:"";flex:1;border-top:2px solid #4a413a}
.msa-section{margin-top:14px;padding-top:10px;border-top:2px dashed #4a413a}
.msa-h{margin:0 0 6px;font-size:1em;color:#f8e9b0}
.msa-avatars{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px}
.msa-avatar{display:flex;flex-direction:column;align-items:center;gap:2px;min-width:64px;padding:6px;border:2px solid #0f0d0b;background:#3a332d;color:#eee;cursor:pointer;font:inherit;font-size:.75em}
.msa-avatar[aria-checked=true]{background:#6b8f3a;box-shadow:inset 0 0 0 2px #f8e9b0}
.msa-avatar img{width:32px;height:32px;image-rendering:pixelated}
.msa-avatar .msa-letter{display:flex;width:32px;height:32px;align-items:center;justify-content:center;background:#171411;font-weight:700}
.msa-error{min-height:1.3em;margin:4px 0;color:#ff8a7a;font-size:.88em}
.msa-ok{color:#9bd14f}
.msa-spin{width:14px;height:14px;border:3px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:msa-rot .8s linear infinite}
.msa-btn.google .msa-spin{border-color:rgba(0,0,0,.2);border-top-color:#222}
@keyframes msa-rot{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.msa-spin{animation-duration:2.5s}}
.msa-choice{margin:8px 0;padding:8px 10px;border:2px solid #0f0d0b;background:#3a332d;font-size:.9em}
`;

function injectStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  document.head.appendChild(s);
}

type Attrs = Record<string, string | boolean | undefined>;
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null)[]
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') n.className = String(v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) if (c !== null) n.append(c);
  return n;
}

let uid = 0;
const nextId = (p: string): string => `msa-${p}-${++uid}`;

interface Field {
  wrap: HTMLLabelElement;
  input: HTMLInputElement;
  hint: HTMLSpanElement;
}
function field(label: string, attrs: Attrs): Field {
  const id = nextId('f');
  const hintId = `${id}-hint`;
  const input = el('input', { class: 'msa-input', id, 'aria-describedby': hintId, ...attrs });
  const hint = el('span', { class: 'msa-hint', id: hintId, 'aria-live': 'polite' });
  const wrap = el('label', { class: 'msa-field', for: id }, el('span', {}, label), input, hint);
  return { wrap, input, hint };
}
function setHint(f: Field, text: string, kind: 'bad' | 'good' | '' = ''): void {
  f.hint.textContent = text;
  f.hint.className = `msa-hint ${kind}`;
  f.input.setAttribute('aria-invalid', kind === 'bad' ? 'true' : 'false');
}

const FOCUSABLE =
  'button:not([disabled]),input:not([disabled]),[href],select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Shared modal shell: backdrop, focus trap, Escape, key isolation from the game, cleanup. */
function modal(
  title: string,
  dismissible: boolean,
  textScale: number,
  onDismiss: () => void,
): { dialog: HTMLDivElement; close: () => void } {
  injectStyle();
  const titleId = nextId('title');
  const dialog = el('div', {
    class: 'msa-dialog',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': titleId,
  });
  dialog.append(el('h2', { class: 'msa-title', id: titleId }, title));
  const backdrop = el('div', { class: 'msa-backdrop' }, dialog);
  if (textScale > 1) backdrop.style.fontSize = '20px';
  const prevFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    backdrop.remove();
    prevFocus?.focus?.();
  };
  if (dismissible) {
    const x = el('button', { class: 'msa-close', type: 'button', 'aria-label': 'Close' }, '×');
    x.addEventListener('click', onDismiss);
    dialog.prepend(x);
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) onDismiss();
    });
  }
  const isolate = (e: Event): void => e.stopPropagation(); // keep the game's key handlers out
  backdrop.addEventListener('keyup', isolate);
  backdrop.addEventListener('keypress', isolate);
  backdrop.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape' && dismissible) {
      e.preventDefault();
      onDismiss();
    } else if (e.key === 'Tab') {
      const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (n) => n.offsetParent !== null || n === document.activeElement,
      );
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
  document.body.appendChild(backdrop);
  return { dialog, close };
}

/** Run an async action with the dialog marked busy and a spinner on `btn`. */
async function busy<T>(
  dialog: HTMLElement,
  btn: HTMLButtonElement,
  fn: () => Promise<T>,
): Promise<T> {
  const controls = [
    ...dialog.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button,input'),
  ];
  const was = controls.map((c) => c.disabled);
  controls.forEach((c) => (c.disabled = true));
  dialog.setAttribute('aria-busy', 'true');
  const spin = el('span', { class: 'msa-spin', 'aria-hidden': 'true' });
  btn.prepend(spin);
  try {
    return await fn();
  } finally {
    spin.remove();
    dialog.removeAttribute('aria-busy');
    controls.forEach((c, i) => (c.disabled = was[i] ?? false));
  }
}

/**
 * Sign in / create account / play as guest. Resolves with the session user, or null when the
 * player closes the dialog. A cloud account without a nickname is asked for one before resolving.
 */
export function openAuthOverlay(
  auth: AuthService,
  opts: AuthOverlayOptions,
): Promise<SessionUser | null> {
  auth.preload();
  return new Promise((resolve) => {
    const dismissible = opts.dismissible ?? true;
    let done = false;
    const finish = (u: SessionUser | null): void => {
      if (done) return;
      done = true;
      shell.close();
      resolve(u);
    };
    const shell = modal('MineSurvive account', dismissible, opts.textScale ?? 1, () =>
      finish(null),
    );
    const { dialog } = shell;
    const cloud = auth.cloudAvailable;
    const local = auth.localProfile();

    const afterCloud = (u: SessionUser): void => {
      if (u.needsNickname) showNicknameStep(u);
      else finish(u);
    };

    // Tabs
    const tabs: Record<AuthTab, { tab: HTMLButtonElement; panel: HTMLDivElement }> = {
      signin: makeTab('Sign in'),
      create: makeTab('Create account'),
      guest: makeTab('Play as guest'),
    };
    function makeTab(label: string): { tab: HTMLButtonElement; panel: HTMLDivElement } {
      const tid = nextId('tab');
      const pid = nextId('panel');
      const tab = el(
        'button',
        {
          class: 'msa-tab',
          type: 'button',
          role: 'tab',
          id: tid,
          'aria-controls': pid,
          'aria-selected': 'false',
          tabindex: '-1',
        },
        label,
      );
      const panel = el('div', {
        class: 'msa-panel',
        role: 'tabpanel',
        id: pid,
        'aria-labelledby': tid,
        hidden: true,
      });
      return { tab, panel };
    }
    const order: AuthTab[] = ['signin', 'create', 'guest'];
    const select = (t: AuthTab, focus = false): void => {
      for (const k of order) {
        const on = k === t;
        tabs[k].tab.setAttribute('aria-selected', String(on));
        tabs[k].tab.tabIndex = on ? 0 : -1;
        tabs[k].panel.hidden = !on;
      }
      if (focus) tabs[t].tab.focus();
      const first = tabs[t].panel.querySelector<HTMLElement>(
        'input:not([disabled]),button:not([disabled])',
      );
      if (!focus) first?.focus();
    };
    const tablist = el('div', {
      class: 'msa-tabs',
      role: 'tablist',
      'aria-label': 'Account options',
    });
    for (const k of order) {
      tablist.append(tabs[k].tab);
      tabs[k].tab.addEventListener('click', () => select(k));
      tabs[k].tab.addEventListener('keydown', (e) => {
        const i = order.indexOf(k);
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          const n = order[(i + (e.key === 'ArrowRight' ? 1 : order.length - 1)) % order.length];
          if (n) select(n, true);
        }
      });
    }
    dialog.append(tablist, tabs.signin.panel, tabs.create.panel, tabs.guest.panel);

    // ----- Sign in -----
    {
      const p = tabs.signin.panel;
      const err = el('p', { class: 'msa-error', role: 'alert' });
      const google = el(
        'button',
        { class: 'msa-btn google', type: 'button' },
        'Sign in with Google',
      );
      if (!cloud) {
        google.disabled = true;
        google.title = NOT_CONFIGURED_TEXT;
        p.append(
          el(
            'p',
            { class: 'msa-warn' },
            `${NOT_CONFIGURED_TEXT}. You can create a local profile on this device instead.`,
          ),
        );
      }
      google.addEventListener('click', () => {
        err.textContent = '';
        void busy(dialog, google, () => auth.signInGoogle())
          .then(afterCloud)
          .catch((e: unknown) => (err.textContent = errorText(e)));
      });
      const email = field('Email', {
        type: 'email',
        autocomplete: 'email',
        inputmode: 'email',
        disabled: !cloud,
      });
      const pass = field('Password', {
        type: 'password',
        autocomplete: 'current-password',
        disabled: !cloud,
      });
      const submit = el(
        'button',
        { class: 'msa-btn', type: 'submit', disabled: !cloud },
        'Sign in',
      );
      const forgot = el(
        'button',
        { class: 'msa-link', type: 'button', disabled: !cloud },
        'Forgot password?',
      );
      const form = el('form', { novalidate: true }, email.wrap, pass.wrap, submit, forgot);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        err.textContent = '';
        const bad = validateSignIn(email.input.value, pass.input.value);
        setHint(email, bad.email ?? '', bad.email ? 'bad' : '');
        setHint(pass, bad.password ?? '', bad.password ? 'bad' : '');
        if (bad.email || bad.password) return;
        void busy(dialog, submit, () => auth.signInEmail(email.input.value, pass.input.value))
          .then(afterCloud)
          .catch((e: unknown) => (err.textContent = errorText(e)));
      });
      forgot.addEventListener('click', () => {
        err.textContent = '';
        const bad = emailError(email.input.value);
        if (bad) {
          setHint(email, 'Enter your email above to reset the password.', 'bad');
          email.input.focus();
          return;
        }
        void busy(dialog, forgot, () => auth.resetPassword(email.input.value))
          .then(() => setHint(email, 'Password reset email sent. Check your inbox.', 'good'))
          .catch((e: unknown) => (err.textContent = errorText(e)));
      });
      p.append(google, el('div', { class: 'msa-or' }, 'or'), form, err);
      if (!cloud) {
        const toLocal = el(
          'button',
          { class: 'msa-btn alt', type: 'button' },
          'Create a local profile',
        );
        toLocal.addEventListener('click', () => select('create'));
        p.append(toLocal);
      }
    }

    // ----- Create account -----
    {
      const p = tabs.create.panel;
      if (cloud) {
        const err = el('p', { class: 'msa-error', role: 'alert' });
        const nick = field('Nickname (public, unique)', {
          type: 'text',
          autocomplete: 'username',
          maxlength: '16',
          spellcheck: 'false',
          autocapitalize: 'off',
        });
        const email = field('Email', { type: 'email', autocomplete: 'email', inputmode: 'email' });
        const pass = field('Password (6+ characters)', {
          type: 'password',
          autocomplete: 'new-password',
        });
        const submit = el('button', { class: 'msa-btn', type: 'submit' }, 'Create cloud account');
        const form = el(
          'form',
          { novalidate: true },
          nick.wrap,
          email.wrap,
          pass.wrap,
          submit,
          err,
        );
        watchNickname(auth, nick);
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          err.textContent = '';
          const f = {
            email: email.input.value,
            password: pass.input.value,
            nick: nick.input.value,
          };
          const bad = validateSignUp(f);
          setHint(nick, bad.nick ?? nick.hint.textContent ?? '', bad.nick ? 'bad' : '');
          setHint(email, bad.email ?? '', bad.email ? 'bad' : '');
          setHint(pass, bad.password ?? '', bad.password ? 'bad' : '');
          if (Object.keys(bad).length) return;
          void busy(dialog, submit, () => auth.signUpEmail(f.email, f.password, f.nick))
            .then(afterCloud)
            .catch((e: unknown) => {
              err.textContent = errorText(e);
              if (e instanceof CloudError && e.code === 'nickname-taken')
                setHint(nick, errorText(e), 'bad');
            });
        });
        p.append(
          el('h3', { class: 'msa-h' }, 'Cloud account'),
          el(
            'p',
            { class: 'msa-note' },
            'Play on any device. You can also sign in with Google from the Sign in tab.',
          ),
          form,
        );
      } else {
        p.append(el('p', { class: 'msa-warn' }, `${NOT_CONFIGURED_TEXT}.`));
      }
      // Local profile
      const sec = el('div', { class: cloud ? 'msa-section' : '' });
      const name = field('Name', {
        type: 'text',
        maxlength: '16',
        autocomplete: 'nickname',
        value: local?.name ?? '',
      });
      let avatar = local?.avatar ?? opts.heroes[0]?.id ?? 'steve';
      const group = el('div', { class: 'msa-avatars', role: 'radiogroup', 'aria-label': 'Avatar' });
      const radios: HTMLButtonElement[] = [];
      const pick = (id: string, focus = false): void => {
        avatar = id;
        radios.forEach((r) => {
          const on = r.dataset.id === id;
          r.setAttribute('aria-checked', String(on));
          r.tabIndex = on ? 0 : -1;
          if (on && focus) r.focus();
        });
      };
      opts.heroes.forEach((h, i) => {
        const icon = h.icon
          ? el('img', { src: h.icon, alt: '' })
          : el('span', { class: 'msa-letter', 'aria-hidden': 'true' }, h.name.slice(0, 1));
        const r = el(
          'button',
          {
            class: 'msa-avatar',
            type: 'button',
            role: 'radio',
            'aria-checked': 'false',
            'aria-label': h.name,
          },
          icon,
          h.name,
        );
        r.dataset.id = h.id;
        r.addEventListener('click', () => pick(h.id));
        r.addEventListener('keydown', (e) => {
          const d =
            e.key === 'ArrowRight' || e.key === 'ArrowDown'
              ? 1
              : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
                ? -1
                : 0;
          if (!d) return;
          e.preventDefault();
          const n = opts.heroes[(i + d + opts.heroes.length) % opts.heroes.length];
          if (n) pick(n.id, true);
        });
        radios.push(r);
        group.append(r);
      });
      pick(avatar);
      const err = el('p', { class: 'msa-error', role: 'alert' });
      const create = el(
        'button',
        { class: cloud ? 'msa-btn alt' : 'msa-btn', type: 'submit' },
        local ? 'Save local profile' : 'Create local profile',
      );
      const form = el(
        'form',
        { novalidate: true },
        name.wrap,
        el('span', { class: 'msa-hint' }, 'Avatar'),
        group,
        create,
        err,
      );
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const bad = validateLocalName(name.input.value);
        setHint(name, bad ?? '', bad ? 'bad' : '');
        if (bad) return;
        try {
          finish(auth.createLocalProfile(name.input.value, avatar));
        } catch (ex) {
          err.textContent = errorText(ex);
        }
      });
      sec.append(
        el('h3', { class: 'msa-h' }, 'Local profile'),
        el('p', { class: 'msa-note' }, 'Saved on this device only, no password. Works offline.'),
        form,
      );
      p.append(sec);
    }

    // ----- Guest -----
    {
      const p = tabs.guest.panel;
      p.append(
        el(
          'p',
          { class: 'msa-note' },
          'Play without an account. Progress stays in this browser only and is lost if its data is cleared. You can create an account later and bring this progress with you.',
        ),
      );
      if (local) {
        const cont = el(
          'button',
          { class: 'msa-btn', type: 'button' },
          `Continue as ${local.name}`,
        );
        cont.addEventListener('click', () => finish(auth.resumeLocalProfile()));
        p.append(cont);
      }
      const guest = el(
        'button',
        { class: local ? 'msa-btn alt' : 'msa-btn', type: 'button' },
        'Play as guest',
      );
      guest.addEventListener('click', () => finish(auth.continueAsGuest()));
      p.append(guest);
    }

    // ----- Nickname step (cloud accounts without one) -----
    function showNicknameStep(u: SessionUser): void {
      tablist.remove();
      for (const k of order) tabs[k].panel.remove();
      const err = el('p', { class: 'msa-error', role: 'alert' });
      const nick = field('Nickname (public, unique)', {
        type: 'text',
        maxlength: '16',
        value: u.name,
        spellcheck: 'false',
        autocapitalize: 'off',
      });
      watchNickname(auth, nick);
      const save = el('button', { class: 'msa-btn', type: 'submit' }, 'Save nickname');
      const later = el(
        'button',
        { class: 'msa-link', type: 'button' },
        'Later (no leaderboards until then)',
      );
      const form = el('form', { novalidate: true }, nick.wrap, save, later, err);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const bad = nicknameError(nick.input.value);
        if (bad) return setHint(nick, friendlyMessage(bad), 'bad');
        void busy(dialog, save, () => auth.setNickname(nick.input.value))
          .then(finish)
          .catch((ex: unknown) => (err.textContent = errorText(ex)));
      });
      later.addEventListener('click', () => finish(auth.user()));
      dialog.append(
        el(
          'p',
          { class: 'msa-note' },
          `Signed in${u.email ? ` as ${u.email}` : ''}. Choose the nickname other players will see.`,
        ),
        form,
      );
      nick.input.focus();
      nick.input.select();
    }

    select(opts.initialTab ?? (cloud ? 'signin' : local ? 'guest' : 'create'));
  });
}

/** Live "available / taken" hint for a nickname field (debounced). */
function watchNickname(auth: AuthService, f: Field): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let seq = 0;
  f.input.addEventListener('input', () => {
    if (timer) clearTimeout(timer);
    const v = f.input.value;
    const bad = nicknameError(v);
    if (bad) return setHint(f, v ? friendlyMessage(bad) : '', v ? 'bad' : '');
    setHint(f, 'Checking...');
    const mine = ++seq;
    timer = setTimeout(() => {
      auth
        .nicknameAvailable(v)
        .then((ok) => {
          if (mine === seq)
            setHint(f, ok ? 'Available' : friendlyMessage('nickname-taken'), ok ? 'good' : 'bad');
        })
        .catch(() => {
          if (mine === seq) setHint(f, '');
        });
    }, 400);
  });
}

/**
 * Ask which copy to keep when the device and cloud saves both changed (or, on the first sign-in,
 * whether to bring guest progress into the account). Not dismissible: a choice is required.
 */
export function openConflictDialog(c: SyncConflict, now = Date.now()): Promise<'local' | 'cloud'> {
  return new Promise((resolve) => {
    const title = c.kind === 'adopt-guest' ? 'Bring your progress?' : 'Choose a save';
    const shell = modal(title, false, 1, () => undefined);
    const pickBtn = (label: string, choice: 'local' | 'cloud', alt: boolean): HTMLButtonElement => {
      const b = el('button', { class: alt ? 'msa-btn alt' : 'msa-btn', type: 'button' }, label);
      b.addEventListener('click', () => {
        shell.close();
        resolve(choice);
      });
      return b;
    };
    const d = shell.dialog;
    if (c.kind === 'adopt-guest') {
      d.append(
        el('p', { class: 'msa-note' }, 'This device has progress from playing without an account.'),
        el('div', { class: 'msa-choice' }, `This device: ${describeSummary(c.local, now)}`),
      );
      if (c.cloud)
        d.append(
          el('div', { class: 'msa-choice' }, `Your account: ${describeSummary(c.cloud, now)}`),
        );
      d.append(
        pickBtn('Use this device’s progress', 'local', false),
        pickBtn(c.cloud ? 'Keep my account’s save' : 'Start fresh on this account', 'cloud', true),
        el('p', { class: 'msa-note' }, 'The other copy is kept as a backup on this device.'),
      );
    } else {
      d.append(
        el(
          'p',
          { class: 'msa-note' },
          'Your save changed on this device and on another one. Which one do you want to keep?',
        ),
        el('div', { class: 'msa-choice' }, `This device: ${describeSummary(c.local, now)}`),
        el(
          'div',
          { class: 'msa-choice' },
          `Cloud: ${c.cloud ? describeSummary(c.cloud, now) : 'empty'}`,
        ),
        pickBtn('Keep this device', 'local', false),
        pickBtn('Use the cloud save', 'cloud', true),
        el(
          'p',
          { class: 'msa-note' },
          'The copy you do not choose is kept as a backup on this device.',
        ),
      );
    }
    d.querySelector<HTMLButtonElement>('button')?.focus();
  });
}
