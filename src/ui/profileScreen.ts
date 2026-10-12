/**
 * Profile: avatar, name, account state, sync status, lifetime stats, best run per hero, and the
 * account actions (sign in / create account / sign out / change avatar / change nickname).
 * Works with no cloud configured: it says so and still offers a local profile and guest play.
 */
import type { App } from '../app';
import type { View } from '../core/canvas';
import type { SaveData } from '../core/save';
import { HEROES, heroById } from '../data/companions';
import {
  accountBadge,
  compactNumber,
  formatClock,
  formatPlayTime,
  lifetimeStats,
  syncLine,
} from './accountInfo';
import { drawAvatar } from './avatar';
import { drawPanel, drawText, drawTextScaled, fitText, textWidth } from './panel';
import type { Screen } from './router';
import { keyToNav, type NavEvent } from './hubModel';
import { Buttons, PadNav, drawTitle } from './widgets';

type Mode = 'main' | 'avatar';

/** Heroes that can be the avatar: the ones the player owns, plus the current avatar and Steve. */
export function avatarChoices(data: SaveData, current: string): string[] {
  return HEROES.filter((h) => h.id === 'steve' || h.id === current || data.owned[h.id]).map(
    (h) => h.id,
  );
}

export function profileScreen(app: App, back: () => void): Screen {
  const buttons = new Buttons();
  const pad = new PadNav();
  let time = 0;
  let mode: Mode = 'main';
  let note = '';
  let noteColor = '#7dff9a';
  /** Hero shown in the avatar picker. */
  let pending = app.auth.user()?.avatar ?? app.data().profile.avatar;

  const say = (text: string, ok = true): void => {
    note = text;
    noteColor = ok ? '#7dff9a' : '#ff8a8a';
  };
  const textScale = (): 1 | 2 => app.data().settings.accessibility.textScale;

  const setAvatar = (id: string): void => {
    const user = app.auth.user();
    if (user && user.kind !== 'guest') {
      void app.auth.setAvatar(id).catch(() => say('Could not save the avatar', false));
    } else {
      const data = app.data();
      data.profile.avatar = id;
      app.store.save(data);
    }
    mode = 'main';
    say('Avatar changed');
  };
  const openPicker = (): void => {
    pending = app.auth.user()?.avatar ?? app.data().profile.avatar;
    mode = 'avatar';
  };
  const stepAvatar = (d: number): void => {
    const current = app.auth.user()?.avatar ?? app.data().profile.avatar;
    const ids = avatarChoices(app.data(), current);
    const at = Math.max(0, ids.indexOf(pending));
    pending = ids[(at + d + ids.length) % ids.length] ?? current;
  };
  /** One navigation event from the keyboard or a pad. */
  const navigate = (ev: NavEvent): void => {
    if (ev === 'back') {
      if (mode === 'avatar') mode = 'main';
      else back();
      return;
    }
    if (mode === 'avatar') {
      // The avatar stepper owns left / right (and the bumpers); up / down and OK use the focus ring.
      if (ev === 'left' || ev === 'prev') return stepAvatar(-1);
      if (ev === 'right' || ev === 'next') return stepAvatar(1);
      if (ev === 'ok' && !buttons.keyboardActive) return setAvatar(pending);
    }
    if (buttons.handleNav(ev) && ev === 'ok') app.audio.play('click');
  };
  const rename = async (): Promise<void> => {
    const m = await import('./authOverlay');
    const u = await m.openNameEditor(app.auth, { textScale: textScale() });
    if (u) say(u.kind === 'cloud' ? 'Nickname saved' : 'Name saved');
  };
  const signOut = async (): Promise<void> => {
    try {
      await app.auth.signOut();
      say('Signed out');
    } catch {
      say('Could not sign out', false);
    }
  };

  return {
    update(dt) {
      time += dt;
      for (const ev of pad.poll(dt)) navigate(ev);
    },
    render(view: View) {
      const { ctx, width, height } = view;
      const data = app.data();
      const auth = app.auth;
      const user = auth.user();
      const compact = height < 200;
      const pad = 8;
      const x0 = pad;
      const w = width - pad * 2;
      buttons.begin();
      drawTitle(view, 'PROFILE');

      // ---- Header card ----
      const y0 = 22;
      const headH = compact ? 38 : 48;
      drawPanel(ctx, { x: x0, y: y0, w, h: headH });
      const box = headH - 8;
      const heroId = user?.avatar ?? data.profile.avatar;
      drawAvatar(ctx, app.atlas, heroId, { x: x0 + 4, y: y0 + 4, w: box, h: box }, time);
      const tx = x0 + 4 + box + 6;
      const textW = x0 + w - 6 - tx;
      const name =
        user?.kind === 'guest' || !user ? 'Adventurer' : user.name || data.profile.name || 'Player';
      const badge = accountBadge(user, auth.state, auth.backend !== null);
      const signedInCloud = user?.kind === 'cloud';
      const sync = syncLine(
        app.cloud.status,
        auth.cloudAvailable,
        signedInCloud,
        app.cloud.lastSyncedAt,
      );
      if (compact) {
        drawText(ctx, fitText(name, textW), tx, y0 + 12, '#fff');
      } else {
        drawTextScaled(
          ctx,
          fitText(name, textW, (s) => textWidth(s, 2)),
          tx,
          y0 + 18,
          '#fff',
          'left',
          2,
        );
      }
      const pillY = y0 + (compact ? 16 : 24);
      const pillW = textWidth(badge.label) + 8;
      ctx.fillStyle = badge.color;
      ctx.fillRect(tx, pillY, pillW, 10);
      ctx.fillStyle = '#16161e';
      ctx.fillRect(tx + 1, pillY + 1, pillW - 2, 8);
      drawText(ctx, badge.label, tx + 4, pillY + 8, badge.color);
      if (user?.kind === 'cloud' && user.email) {
        drawText(ctx, fitText(user.email, textW - pillW - 8), tx + pillW + 6, pillY + 8, '#9a9aa8');
      }
      drawText(ctx, fitText(sync.text, textW), tx, y0 + headH - 5, sync.color);

      // Bottom rows: actions, then Back (both fixed to the bottom edge).
      const backY = height - 20;
      const actY = backY - 18;

      if (mode === 'avatar') {
        // ---- Avatar picker: step through the heroes you own; Use applies the one shown ----
        const top = y0 + headH + 4;
        const area = actY - 4 - top;
        drawPanel(ctx, { x: x0, y: top, w, h: area });
        drawText(ctx, 'Choose your avatar', width / 2, top + 11, '#ffd84a', 'center');
        const ids = avatarChoices(data, heroId);
        const at = Math.max(0, ids.indexOf(pending));
        const step = stepAvatar;
        const cw = 56;
        const ch = Math.max(40, Math.min(area - 34, 78));
        const bx = Math.floor((width - cw) / 2);
        const by = top + 16;
        drawAvatar(ctx, app.atlas, pending, { x: bx, y: by, w: cw, h: ch }, time, '#ffd84a');
        const label = `${heroById(pending).name}${pending === heroId ? ' (current)' : ''}`;
        drawText(ctx, label, width / 2, by + ch + 10, '#fff', 'center');
        const ay = by + Math.floor((ch - 16) / 2);
        buttons.add({ x: bx - 28, y: ay, w: 18, h: 16 }, '<', () => step(-1), ids.length < 2);
        buttons.add({ x: bx + cw + 10, y: ay, w: 18, h: 16 }, '>', () => step(1), ids.length < 2);
        drawText(ctx, `${at + 1}/${ids.length}`, x0 + w - 6, top + 11, '#9a9aa8', 'right');
        const aw = Math.floor((w - 4) / 2);
        buttons.add({ x: x0, y: actY, w: aw, h: 14 }, 'Cancel', () => (mode = 'main'));
        buttons.add({ x: x0 + aw + 4, y: actY, w: aw, h: 14 }, 'Use this avatar', () =>
          setAvatar(pending),
        );
        buttons.draw(view);
        return;
      }

      // ---- Lifetime stats ----
      const st = lifetimeStats(data);
      const rowH = compact ? 10 : height >= 230 ? 14 : 13;
      const statsTop = y0 + headH + 4;
      const statsH = rowH * 4 + 6;
      drawPanel(ctx, { x: x0, y: statsTop, w, h: statsH });
      const cells: [string, string, string?][] = [
        ['Runs', String(st.runs)],
        ['Play time', formatPlayTime(st.playSeconds)],
        ['Wins', String(st.wins), st.wins > 0 ? '#7dff9a' : undefined],
        ['Best time', formatClock(st.bestTimeSec), '#ffd84a'],
        ['Kills', compactNumber(st.kills)],
        ['Best kills', compactNumber(st.bestKills)],
        ['Bosses', String(st.bosses)],
        ['Emeralds', compactNumber(data.currencies.emeralds), '#7dff9a'],
      ];
      const colW = Math.floor((w - 12) / 2);
      cells.forEach(([label, value, color], i) => {
        const cx = x0 + 6 + (i % 2) * (colW + 0);
        const cy = statsTop + 4 + Math.floor(i / 2) * rowH + 7;
        drawText(ctx, label, cx, cy, '#9a9aa8');
        drawText(ctx, value, cx + colW - 8, cy, color ?? '#fff', 'right');
      });

      // ---- Best run per hero (the three best) ----
      const heroTop = statsTop + statsH + 4;
      const cardH = Math.min(compact ? 22 : 34, actY - 4 - heroTop);
      const gap = 4;
      const tops = HEROES.filter((h) => (data.stats.perHero[h.id]?.runs ?? 0) > 0)
        .sort(
          (p, q) =>
            (data.stats.perHero[q.id]?.bestTimeSec ?? 0) -
            (data.stats.perHero[p.id]?.bestTimeSec ?? 0),
        )
        .slice(0, 3);
      if (tops.length === 0) {
        drawPanel(ctx, { x: x0, y: heroTop, w, h: cardH });
        drawText(
          ctx,
          'Your best run per hero shows up here.',
          width / 2,
          heroTop + Math.floor(cardH / 2) + 3,
          '#9a9aa8',
          'center',
        );
      }
      const cardW = Math.floor((w - gap * (tops.length - 1)) / Math.max(1, tops.length));
      const av = cardH - 4;
      tops.forEach((h, i) => {
        const r = { x: x0 + i * (cardW + gap), y: heroTop, w: cardW, h: cardH };
        drawPanel(ctx, r, false, null);
        drawAvatar(ctx, app.atlas, h.id, { x: r.x + 2, y: r.y + 2, w: av, h: av }, time);
        const ph = data.stats.perHero[h.id];
        const tx2 = r.x + av + 6;
        const room = r.x + r.w - 3 - tx2;
        drawText(ctx, fitText(h.name, room), tx2, r.y + Math.floor(cardH / 2) - 1, '#fff');
        const line = `${formatClock(ph?.bestTimeSec ?? 0)}  ${compactNumber(ph?.bestKills ?? 0)} kills`;
        drawText(ctx, fitText(line, room), tx2, r.y + cardH - 5, '#ffd84a');
      });

      // ---- Actions ----
      const acts: { label: string; fn: () => void }[] = [];
      const cloudOn = auth.cloudAvailable;
      if (!user || user.kind === 'guest') {
        acts.push(
          cloudOn
            ? { label: 'Sign in', fn: () => void app.openAccount('signin') }
            : { label: 'Local profile', fn: () => void app.openAccount('create') },
        );
        if (cloudOn)
          acts.push({ label: 'Create account', fn: () => void app.openAccount('create') });
        acts.push({ label: 'Change avatar', fn: openPicker });
      } else if (user.kind === 'local') {
        acts.push(
          cloudOn
            ? { label: 'Sign in', fn: () => void app.openAccount('signin') }
            : { label: 'New profile', fn: () => void app.openAccount('create') },
          { label: 'Change name', fn: () => void rename() },
          { label: 'Change avatar', fn: openPicker },
          { label: 'Sign out', fn: () => void signOut() },
        );
      } else {
        acts.push(
          { label: 'Change nickname', fn: () => void rename() },
          { label: 'Change avatar', fn: openPicker },
          { label: 'Sign out', fn: () => void signOut() },
        );
      }
      const aw = Math.floor((w - gap * (acts.length - 1)) / acts.length);
      acts.forEach((a, i) => {
        buttons.add(
          { x: x0 + i * (aw + gap), y: actY, w: aw, h: 14 },
          fitText(a.label, aw - 6),
          a.fn,
        );
      });
      if (note) {
        drawText(ctx, note, width - pad, backY + 11, noteColor, 'right');
      }
      buttons.add({ x: pad, y: backY, w: 56, h: 16 }, 'Back', back);
      buttons.draw(view);
    },
    onMove(x, y) {
      buttons.move(x, y);
    },
    onClick(x, y) {
      note = '';
      if (buttons.click(x, y)) app.audio.play('click');
    },
    onKey(code) {
      const ev = keyToNav(code);
      if (ev) navigate(ev);
    },
  };
}
