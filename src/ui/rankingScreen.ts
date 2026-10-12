/**
 * Ranking: the leaderboard of the current session (global when signed in with a nickname, otherwise
 * the player's own bests on this device). Period tabs (Today / Week / All time, online only) and a
 * hero filter; the own row is highlighted; the list scrolls with the wheel, keys or the arrows.
 */
import type { App } from '../app';
import type { View } from '../core/canvas';
import { HEROES, heroById } from '../data/companions';
import type { LeaderboardEntry } from '../net/backend';
import { friendlyMessage, toCloudError } from '../net/errors';
import type { Period } from '../net/leaderboard';
import { compactNumber, formatClock } from './accountInfo';
import { drawAvatar } from './avatar';
import { drawButton, drawPanel, drawText, fitText, inRect, type Rect } from './panel';
import type { Screen } from './router';
import { Buttons, drawTitle } from './widgets';

/** Rows requested per board (the list scrolls through them). */
const FETCH_ROWS = 50;
const ROW_H = 11;
const TIMEOUT_MS = 8000;

const PERIOD_TABS: { id: Period; label: string }[] = [
  { id: 'day', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'all', label: 'All time' },
];

/** Clamp a scroll offset so the window of `fit` rows stays inside `count` rows. */
export function clampScroll(scroll: number, count: number, fit: number): number {
  return Math.max(0, Math.min(scroll, Math.max(0, count - fit)));
}

/** Rows [from, to) that are visible for a scroll offset. */
export function visibleRange(scroll: number, count: number, fit: number): [number, number] {
  const from = clampScroll(scroll, count, fit);
  return [from, Math.min(count, from + Math.max(0, fit))];
}

type Load =
  | { status: 'loading' }
  | { status: 'ok'; rows: LeaderboardEntry[]; rank: number | null }
  | { status: 'error'; message: string };

const withTimeout = <T>(p: Promise<T>): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });

function errorMessage(e: unknown): string {
  if (e instanceof Error && e.message === 'timeout') return 'The server took too long to answer.';
  return friendlyMessage(toCloudError(e).code);
}

export function rankingScreen(app: App, back: () => void): Screen {
  const buttons = new Buttons();
  let time = 0;
  let period: Period = 'all';
  let hero = ''; // '' = every hero
  let scroll = 0;
  let fit = 6;
  const cache = new Map<string, Load>();
  let sessionKey = '';
  /** Clickable tabs of the current frame, and the pointer for their hover state. */
  let tabHits: { r: Rect; fn: () => void }[] = [];
  let mx = -1;
  let my = -1;

  const sessionId = (): string => {
    const u = app.auth.user();
    const v = app.leaderboard();
    return `${u?.kind ?? 'none'}:${u?.id ?? ''}:${u?.kind === 'cloud' ? u.needsNickname : ''}:${v.online}`;
  };
  const myUid = (): string => {
    const u = app.auth.user();
    return u?.kind === 'cloud' ? u.id : app.data().profile.id;
  };
  const keyOf = (): string => `${period}:${hero}`;

  const load = (force = false): void => {
    const key = keyOf();
    if (!force && cache.has(key)) return;
    const view = app.leaderboard();
    const p = view.online ? period : 'all';
    cache.set(key, { status: 'loading' });
    const heroArg = hero || undefined;
    void withTimeout(
      Promise.all([
        view.top(p, FETCH_ROWS, heroArg),
        view.online ? view.rank(p).catch(() => null) : Promise.resolve(null),
      ]),
    ).then(
      ([rows, rank]) => {
        if (cache.has(key)) cache.set(key, { status: 'ok', rows, rank });
      },
      (e: unknown) => {
        if (cache.has(key)) cache.set(key, { status: 'error', message: errorMessage(e) });
      },
    );
  };
  const select = (nextPeriod: Period, nextHero: string): void => {
    period = nextPeriod;
    hero = nextHero;
    scroll = 0;
    load();
  };
  const move = (dy: number): void => {
    const cur = cache.get(keyOf());
    const n = cur?.status === 'ok' ? cur.rows.length : 0;
    scroll = clampScroll(scroll + dy, n, fit);
  };

  return {
    enter() {
      sessionKey = sessionId();
      load(true);
    },
    update(dt) {
      time += dt;
      const k = sessionId();
      if (k !== sessionKey) {
        // Signed in or out while on this screen: the board is a different one now.
        sessionKey = k;
        cache.clear();
        scroll = 0;
        load(true);
      }
    },
    render(view: View) {
      const { ctx, width, height } = view;
      const pad = 8;
      const x0 = pad;
      const w = width - pad * 2;
      const lb = app.leaderboard();
      const online = lb.online;
      const user = app.auth.user();
      const cloudOn = app.auth.cloudAvailable;
      buttons.begin();
      tabHits = [];
      drawTitle(view, 'RANKING');

      // ---- Tabs ----
      let y = 22;
      const tabRow = (
        items: { label: string; active: boolean; fn: () => void }[],
        ty: number,
      ): void => {
        const gap = 3;
        const tw = Math.floor((w - gap * (items.length - 1)) / items.length);
        items.forEach((it, i) => {
          const r = { x: x0 + i * (tw + gap), y: ty, w: tw, h: 13 };
          drawButton(ctx, r, fitText(it.label, tw - 4), it.active || inRect(r, mx, my));
          if (it.active) {
            ctx.fillStyle = '#ffd84a';
            ctx.fillRect(r.x, r.y + r.h, r.w, 2);
          }
          tabHits.push({ r, fn: it.fn });
        });
      };
      if (online) {
        tabRow(
          PERIOD_TABS.map((t) => ({
            label: t.label,
            active: t.id === period,
            fn: () => select(t.id, hero),
          })),
          y,
        );
        y += 17;
      }
      tabRow(
        [{ id: '', name: 'All heroes' }, ...HEROES].map((h) => ({
          label: h.name,
          active: h.id === hero,
          fn: () => select(period, h.id),
        })),
        y,
      );
      y += 17;

      // ---- Footer geometry ----
      const backY = height - 20;
      const infoY = backY - 5; // baseline of the line above the buttons
      const headY = y + 8; // baseline of the column titles
      const listTop = headY + 4;
      const listBottom = infoY - 9;
      fit = Math.max(1, Math.floor((listBottom - listTop) / ROW_H));

      // ---- List ----
      const state = cache.get(keyOf()) ?? { status: 'loading' as const };
      const wide = w >= 360;
      const colKills = x0 + w - 6;
      const colTime = colKills - (wide ? 44 : 38);
      const colHero = colTime - 56;
      drawText(ctx, '#', x0 + 4, headY, '#9a9aa8');
      drawText(ctx, 'Player', x0 + 36, headY, '#9a9aa8');
      if (wide) drawText(ctx, 'Hero', colHero, headY, '#9a9aa8');
      drawText(ctx, 'Time', colTime, headY, '#9a9aa8', 'right');
      drawText(ctx, 'Kills', colKills, headY, '#9a9aa8', 'right');
      drawPanel(ctx, { x: x0, y: listTop - 1, w, h: fit * ROW_H + 3 });
      const mid = listTop + Math.floor((fit * ROW_H) / 2);

      if (state.status === 'loading') {
        const dots = '.'.repeat(1 + (Math.floor(time * 3) % 3));
        drawText(ctx, `Loading${dots}`, width / 2, mid + 3, '#c8c8d0', 'center');
      } else if (state.status === 'error') {
        drawText(ctx, 'Could not load the ranking', width / 2, mid - 5, '#ff8a8a', 'center');
        drawText(ctx, fitText(state.message, w - 12), width / 2, mid + 5, '#9a9aa8', 'center');
        buttons.add({ x: Math.floor((width - 56) / 2), y: mid + 10, w: 56, h: 13 }, 'Retry', () =>
          load(true),
        );
      } else if (state.rows.length === 0) {
        drawText(ctx, 'No runs on this board yet.', width / 2, mid - 2, '#c8c8d0', 'center');
        drawText(
          ctx,
          online ? 'Finish a run to take the first place!' : 'Finish a run to get on the list.',
          width / 2,
          mid + 8,
          '#9a9aa8',
          'center',
        );
      } else {
        scroll = clampScroll(scroll, state.rows.length, fit);
        const [from, to] = visibleRange(scroll, state.rows.length, fit);
        const me = myUid();
        for (let i = from; i < to; i++) {
          const e = state.rows[i];
          if (!e) continue;
          const ry = listTop + (i - from) * ROW_H;
          const mine = e.uid === me;
          if (mine) {
            ctx.fillStyle = '#4a4220';
            ctx.fillRect(x0 + 2, ry, w - 4 - (state.rows.length > fit ? 5 : 0), ROW_H);
            ctx.fillStyle = '#ffd84a';
            ctx.fillRect(x0 + 2, ry, 1, ROW_H);
          }
          const col = mine ? '#ffd84a' : '#fff';
          const place = i + 1;
          const medal =
            place === 1 ? '#ffd84a' : place === 2 ? '#d8d8e0' : place === 3 ? '#e0905a' : col;
          drawText(ctx, String(place), x0 + 16, ry + 8, medal, 'right');
          drawAvatar(
            ctx,
            app.atlas,
            e.avatar || e.hero,
            { x: x0 + 20, y: ry + 0, w: ROW_H, h: ROW_H },
            0,
          );
          const nameRight = (wide ? colHero : colTime - 32) - 6;
          drawText(ctx, fitText(e.nick, nameRight - (x0 + 36)), x0 + 36, ry + 8, col);
          if (wide) drawText(ctx, heroById(e.hero).name, colHero, ry + 8, mine ? col : '#c8c8d0');
          drawText(ctx, formatClock(e.timeSec), colTime, ry + 8, col, 'right');
          drawText(ctx, compactNumber(e.kills), colKills, ry + 8, col, 'right');
        }
        if (state.rows.length > fit) {
          // Scrollbar and arrows.
          const tx = x0 + w - 5;
          const th = fit * ROW_H;
          ctx.fillStyle = '#101014';
          ctx.fillRect(tx, listTop, 3, th);
          const knob = Math.max(6, Math.round((th * fit) / state.rows.length));
          const span = state.rows.length - fit;
          const ky = listTop + Math.round(((th - knob) * scroll) / span);
          ctx.fillStyle = '#9a9aa8';
          ctx.fillRect(tx, ky, 3, knob);
          buttons.add(
            { x: width - pad - 12, y: backY, w: 12, h: 16 },
            '^',
            () => move(-1),
            scroll <= 0,
          );
          buttons.add(
            { x: width - pad - 26, y: backY, w: 12, h: 16 },
            'v',
            () => move(1),
            scroll >= span,
          );
        }
      }

      // ---- Info line ----
      let info = '';
      let infoColor = '#9a9aa8';
      if (!online) {
        infoColor = '#ff9a3a';
        if (user?.kind === 'cloud' && user.needsNickname)
          info = 'Choose a nickname to join the rankings.';
        else if (user?.kind === 'cloud') info = 'Offline: showing your bests on this device.';
        else if (cloudOn) info = 'Sign in to compete: showing your bests on this device.';
        else info = 'Cloud disabled; showing your bests on this device.';
      } else if (state.status === 'ok' && state.rank !== null) {
        info = `Your rank: #${state.rank}`;
        infoColor = '#ffd84a';
      }
      if (info) drawText(ctx, fitText(info, w), x0 + 2, infoY, infoColor);

      // ---- Buttons ----
      buttons.add({ x: pad, y: backY, w: 56, h: 16 }, 'Back', back);
      if (!online && cloudOn && user?.kind !== 'cloud') {
        buttons.add(
          { x: pad + 62, y: backY, w: 56, h: 16 },
          'Sign in',
          () => void app.openAccount('signin'),
        );
      } else if (!online && user?.kind === 'cloud' && user.needsNickname) {
        buttons.add(
          { x: pad + 62, y: backY, w: 72, h: 16 },
          'Set nickname',
          () => void app.openAccount('signin'),
        );
      }
      buttons.draw(view);
    },
    onMove(x, y) {
      mx = x;
      my = y;
      buttons.move(x, y);
    },
    onClick(x, y) {
      mx = x;
      my = y;
      if (buttons.click(x, y)) {
        app.audio.play('click');
        return;
      }
      const tab = tabHits.find((t) => inRect(t.r, x, y));
      if (tab) {
        app.audio.play('click');
        tab.fn();
      }
    },
    onWheel(dy) {
      move(dy > 0 ? 2 : -2);
    },
    onKey(code) {
      if (code === 'Escape') return back();
      if (code === 'ArrowUp' || code === 'KeyW') move(-1);
      else if (code === 'ArrowDown' || code === 'KeyS') move(1);
      else if (code === 'PageUp') move(-fit);
      else if (code === 'PageDown') move(fit);
      else if (code === 'Home') scroll = 0;
      else if (code === 'End') move(1e9);
      else if (code === 'ArrowLeft' || code === 'ArrowRight') {
        const d = code === 'ArrowLeft' ? -1 : 1;
        const online = app.leaderboard().online;
        if (online) {
          const i = PERIOD_TABS.findIndex((t) => t.id === period);
          const n = PERIOD_TABS[(i + d + PERIOD_TABS.length) % PERIOD_TABS.length];
          if (n) select(n.id, hero);
        } else {
          const ids = ['', ...HEROES.map((h) => h.id)];
          const i = ids.indexOf(hero);
          select(period, ids[(i + d + ids.length) % ids.length] ?? '');
        }
      }
    },
  };
}
