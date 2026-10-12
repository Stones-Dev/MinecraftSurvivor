/**
 * Settings (BRIEF section 5): Audio / Graphics / Controls / Access / Account / Data sub-tabs.
 * Every change saves and calls applySettings(), so it takes effect immediately.
 */
import type { App } from '../app';
import type { View } from '../core/canvas';
import { ACTIONS, DEFAULT_BINDINGS, type Action } from '../core/input';
import type { ColorblindMode, SaveData, TouchControlsMode } from '../core/save';
import { accountBadge, syncLine } from './accountInfo';
import { drawButton, drawPanel, drawText, fitText, inRect, type Rect } from './panel';
import { profileScreen } from './profileScreen';
import type { Screen } from './router';
import { keyToNav, type NavEvent } from './hubModel';
import { Buttons, PadNav, drawTitle } from './widgets';

type Tab = 'audio' | 'graphics' | 'controls' | 'access' | 'account' | 'data';
type Quality = SaveData['settings']['quality'];

const TABS: { id: Tab; label: string }[] = [
  { id: 'audio', label: 'Audio' },
  { id: 'graphics', label: 'Graphics' },
  { id: 'controls', label: 'Controls' },
  { id: 'access', label: 'Access' },
  { id: 'account', label: 'Account' },
  { id: 'data', label: 'Data' },
];
const COLORBLIND: { id: ColorblindMode; label: string }[] = [
  { id: 'off', label: 'Off' },
  { id: 'protanopia', label: 'Protanopia' },
  { id: 'deuteranopia', label: 'Deuteranopia' },
  { id: 'tritanopia', label: 'Tritanopia' },
];
const TOUCH: { id: TouchControlsMode; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'on', label: 'On' },
  { id: 'off', label: 'Off' },
];
/** Next entry after `current` in a cyclic list. */
function cycle<T extends { id: unknown }>(list: T[], current: unknown): T {
  const i = list.findIndex((e) => e.id === current);
  return list[(i + 1) % list.length] as T;
}
const ACTION_LABEL: Record<Action, string> = {
  up: 'Move up',
  down: 'Move down',
  left: 'Move left',
  right: 'Move right',
  pause: 'Pause',
  item: 'Use item',
  ability: 'Hero ability',
};
const QUALITY: Quality[] = ['auto', 'high', 'medium', 'low'];
/** Seconds the "Really reset?" confirmation stays armed. */
const RESET_ARM = 3;
/** Seconds a chosen import file stays armed for the confirming click. */
const IMPORT_ARM = 10;

const keyName = (code: string): string => code.replace(/^(Key|Digit)/, '');

export function settingsScreen(app: App, onBack: () => void): Screen {
  const buttons = new Buttons();
  const pad = new PadNav();
  let tab: Tab = 'audio';
  let capture: Action | null = null;
  let clock = 0;
  let resetUntil = 0;
  /** A chosen save file waiting for the second click (importing replaces the current save). */
  let pendingImport: { text: string; until: number } | null = null;
  let message = '';
  let messageOk = true;
  /** Clickable volume bars of the current frame. */
  let bars: { hit: Rect; set: (frac: number) => void }[] = [];

  const commit = (): void => {
    app.store.save(app.data());
    app.applySettings();
  };
  const say = (text: string, ok = true): void => {
    message = text;
    messageOk = ok;
  };
  const setTab = (t: Tab): void => {
    tab = t;
    capture = null;
    message = '';
  };
  /** One navigation event from the keyboard or a pad: arrows move the focus ring, Q / E switch the tab. */
  const navigate = (ev: NavEvent): void => {
    if (capture) {
      // Waiting for a key: only Back (Esc / B) cancels; the next key press is handled in onKey.
      if (ev === 'back') capture = null;
      return;
    }
    if (ev === 'back') return onBack();
    if (ev === 'prev' || ev === 'next') {
      const at = TABS.findIndex((t) => t.id === tab);
      const next = TABS[(at + (ev === 'prev' ? -1 : 1) + TABS.length) % TABS.length];
      if (!next) return;
      setTab(next.id);
      app.audio.play('click');
      if (buttons.keyboardActive) buttons.focusOn(`tab:${next.id}`);
      return;
    }
    if (!buttons.keyboardActive) {
      // The first press only shows the ring, on the current tab.
      buttons.focusOn(`tab:${tab}`);
      return;
    }
    if (buttons.handleNav(ev) && ev === 'ok') app.audio.play('click');
  };
  const setVolume = (key: 'musicVolume' | 'sfxVolume', v: number): void => {
    app.data().settings[key] = Math.round(Math.max(0, Math.min(1, v)) * 10) / 10;
    commit();
  };

  const exportSave = (): void => {
    const url = URL.createObjectURL(new Blob([app.store.export()], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'minesurvive-save.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    say('Exported');
  };
  const importSave = (): void => {
    if (pendingImport && clock < pendingImport.until) {
      const { text } = pendingImport;
      pendingImport = null;
      try {
        app.store.import(text);
        app.applySettings();
        say('Imported (backup kept)');
      } catch {
        say('Invalid file', false);
      }
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      file.text().then(
        (text) => {
          pendingImport = { text, until: clock + IMPORT_ARM };
          say('Click "Replace save?" to overwrite your progress', false);
        },
        () => say('Invalid file', false),
      );
    };
    input.click();
  };
  const resetSave = (): void => {
    if (clock >= resetUntil) {
      resetUntil = clock + RESET_ARM;
      return;
    }
    resetUntil = 0;
    app.store.reset();
    app.applySettings();
    say('Save reset');
  };
  const toggleFullscreen = (): void => {
    try {
      const p = document.fullscreenElement
        ? document.exitFullscreen()
        : document.documentElement.requestFullscreen();
      p.catch(() => undefined);
    } catch {
      // Fullscreen blocked or unsupported: nothing to do.
    }
  };

  return {
    update(dt) {
      clock += dt;
      for (const ev of pad.poll(dt)) navigate(ev);
    },
    render(view: View) {
      const { ctx, width, height } = view;
      const data = app.data();
      const s = data.settings;
      drawTitle(view, 'SETTINGS');
      buttons.begin();
      bars = [];

      // Sub-tabs.
      const rowW = Math.min(width - 12, 330);
      const x0 = Math.floor((width - rowW) / 2);
      const tgap = 2;
      const tw = Math.floor((rowW - tgap * (TABS.length - 1)) / TABS.length);
      TABS.forEach((t, i) => {
        const r = { x: x0 + i * (tw + tgap), y: 28, w: tw, h: 14 };
        buttons.add(r, t.label, () => setTab(t.id), false, {
          key: `tab:${t.id}`,
          custom: (c, rr, st) => {
            const on = t.id === tab;
            drawButton(c, rr, t.label, on || st.hover);
            if (on) {
              c.fillStyle = '#ffd84a';
              c.fillRect(rr.x, rr.y + rr.h, rr.w, 2);
            }
          },
        });
      });

      // Row helpers: a panel per row, label on the left, controls on the right. The pitch shrinks so
      // six rows still fit above the Back button on the smallest (320x180) canvas.
      const top = 48;
      const pitch = Math.max(16, Math.min(20, Math.floor((height - 26 - top) / 6)));
      const rowH = pitch - 2;
      const ctlH = Math.min(14, rowH - 3);
      const rowY = (i: number): number => top + i * pitch;
      const base = (i: number): number => rowY(i) + Math.floor(rowH / 2) + 3;
      const row = (i: number, label: string, note?: string): void => {
        drawPanel(ctx, { x: x0, y: rowY(i), w: rowW, h: rowH });
        drawText(ctx, label, x0 + 5, base(i));
        if (note) drawText(ctx, note, x0 + 92, base(i), '#9a9aa8');
      };
      const ctl = (i: number, w: number, fromRight = 0): Rect => ({
        x: x0 + rowW - w - 2 - fromRight,
        y: rowY(i) + Math.floor((rowH - ctlH) / 2),
        w,
        h: ctlH,
      });
      const toggle = (i: number, label: string, on: boolean, flip: () => void): void => {
        row(i, label);
        buttons.add(ctl(i, 60), on ? 'On' : 'Off', () => {
          flip();
          commit();
        });
      };
      const volume = (i: number, label: string, key: 'musicVolume' | 'sfxVolume'): void => {
        row(i, label);
        const v = s[key];
        const plus = ctl(i, 14);
        const bar = { x: plus.x - 4 - 90, y: rowY(i) + Math.floor((rowH - 8) / 2), w: 90, h: 8 };
        const minus = { x: bar.x - 4 - 14, y: plus.y, w: 14, h: ctlH };
        buttons.add(minus, '-', () => setVolume(key, v - 0.1), v <= 0);
        buttons.add(plus, '+', () => setVolume(key, v + 0.1), v >= 1);
        ctx.fillStyle = '#101014';
        ctx.fillRect(bar.x, bar.y, bar.w, bar.h);
        ctx.fillStyle = '#3b3b46';
        ctx.fillRect(bar.x + 1, bar.y + 1, bar.w - 2, bar.h - 2);
        ctx.fillStyle = '#7dff9a';
        ctx.fillRect(bar.x + 1, bar.y + 1, Math.round((bar.w - 2) * v), bar.h - 2);
        drawText(ctx, `${Math.round(v * 100)}%`, minus.x - 4, base(i), '#cfcfd8', 'right');
        bars.push({
          hit: { x: bar.x - 2, y: plus.y, w: bar.w + 4, h: ctlH },
          set: (frac) => {
            setVolume(key, frac);
            app.audio.play('click');
          },
        });
      };

      if (tab === 'audio') {
        volume(0, 'Music volume', 'musicVolume');
        volume(1, 'SFX volume', 'sfxVolume');
        toggle(2, 'Mute all', s.muted, () => (s.muted = !s.muted));
      } else if (tab === 'graphics') {
        row(0, 'Quality', 'Auto picks by frame rate');
        const q = s.quality;
        buttons.add(ctl(0, 60), q.charAt(0).toUpperCase() + q.slice(1), () => {
          s.quality = QUALITY[(QUALITY.indexOf(q) + 1) % QUALITY.length] ?? 'auto';
          commit();
        });
        toggle(1, 'Damage numbers', s.damageNumbers, () => (s.damageNumbers = !s.damageNumbers));
        toggle(2, 'Screen shake', s.screenShake, () => (s.screenShake = !s.screenShake));
        toggle(3, 'Camera lookahead', s.cameraLead, () => (s.cameraLead = !s.cameraLead));
        toggle(4, 'FPS counter', s.showFps, () => (s.showFps = !s.showFps));
        row(5, 'Fullscreen');
        buttons.add(ctl(5, 60), document.fullscreenElement ? 'Exit' : 'Enter', toggleFullscreen);
      } else if (tab === 'controls') {
        const gap = 6;
        const colW = Math.floor((rowW - gap) / 2);
        ACTIONS.forEach((a, i) => {
          const r = {
            x: x0 + (i % 2) * (colW + gap),
            y: top + Math.floor(i / 2) * 18,
            w: colW,
            h: 16,
          };
          const keys = (s.controls[a]?.length ? s.controls[a] : DEFAULT_BINDINGS[a]) ?? [];
          const text =
            capture === a
              ? `${ACTION_LABEL[a]}  press a key...`
              : `${ACTION_LABEL[a]}  ${keys.map(keyName).join(' / ')}`;
          buttons.add(r, fitText(text, colW - 6), () => {
            capture = a;
          });
        });
        buttons.add(
          { x: Math.floor((width - 110) / 2), y: top + 76, w: 110, h: 16 },
          'Reset controls',
          () => {
            s.controls = {};
            capture = null;
            commit();
          },
        );
        drawText(
          ctx,
          capture
            ? `Press a key for "${ACTION_LABEL[capture]}"  (Esc cancels)`
            : 'Click an action, then press its new key.',
          width / 2,
          top + 100,
          capture ? '#ffd84a' : '#9a9aa8',
          'center',
        );
      } else if (tab === 'access') {
        const a = s.accessibility;
        row(0, 'Colour-blind mode');
        const cbCur =
          COLORBLIND.find((c) => c.id === a.colorblind) ??
          (COLORBLIND[0] as (typeof COLORBLIND)[number]);
        buttons.add(ctl(0, 84), cbCur.label, () => {
          a.colorblind = cycle(COLORBLIND, a.colorblind).id;
          commit();
        });
        row(1, 'Text size');
        buttons.add(ctl(1, 60), a.textScale === 2 ? 'Large' : 'Normal', () => {
          a.textScale = a.textScale === 2 ? 1 : 2;
          commit();
        });
        toggle(2, 'Reduce flashing', a.reduceFlash, () => (a.reduceFlash = !a.reduceFlash));
        row(3, 'Touch controls');
        const tCur =
          TOUCH.find((c) => c.id === a.touchControls) ?? (TOUCH[0] as (typeof TOUCH)[number]);
        buttons.add(ctl(3, 60), tCur.label, () => {
          a.touchControls = cycle(TOUCH, a.touchControls).id;
          commit();
        });
        const hint =
          a.colorblind !== 'off'
            ? 'Danger and rarity colours are adjusted.'
            : 'Large text applies to the in-run HUD and account dialogs.';
        drawText(ctx, fitText(hint, rowW), x0 + 2, rowY(4) + 10, '#9a9aa8');
      } else if (tab === 'account') {
        const user = app.auth.user();
        const badge = accountBadge(user, app.auth.state, app.auth.backend !== null);
        row(0, 'Player');
        const shown = user && user.kind !== 'guest' ? user.name : 'Adventurer';
        drawText(ctx, fitText(shown, rowW - 100), x0 + 52, base(0), '#fff');
        drawText(ctx, badge.label, x0 + rowW - 5, base(0), badge.color, 'right');
        const sync = syncLine(
          app.cloud.status,
          app.auth.cloudAvailable,
          user?.kind === 'cloud',
          app.cloud.lastSyncedAt,
        );
        row(1, 'Save');
        drawText(ctx, fitText(sync.text, rowW - 46), x0 + 38, base(1), sync.color);
        row(2, 'Account');
        buttons.add(ctl(2, 54), 'Profile', () =>
          app.router.push(profileScreen(app, () => app.router.pop())),
        );
        if (user?.kind === 'cloud') {
          buttons.add(ctl(2, 54, 58), 'Sign out', () => {
            void app.auth.signOut();
          });
        } else {
          const cloudOn = app.auth.cloudAvailable;
          buttons.add(ctl(2, cloudOn ? 54 : 78, 58), cloudOn ? 'Sign in' : 'Local profile', () => {
            void app.openAccount(cloudOn ? 'signin' : 'create');
          });
        }
      } else {
        row(0, 'Export save', 'minesurvive-save.json');
        buttons.add(ctl(0, 80), 'Export', exportSave);
        row(1, 'Import save', 'Load a save file');
        buttons.add(
          ctl(1, 80),
          pendingImport && clock < pendingImport.until ? 'Replace save?' : 'Import',
          importSave,
        );
        row(2, 'Reset save', 'Erase all progress');
        buttons.add(ctl(2, 80), clock < resetUntil ? 'Really reset?' : 'Reset', resetSave);
        if (message) {
          drawText(
            ctx,
            message,
            width / 2,
            rowY(3) + 10,
            messageOk ? '#7dff9a' : '#ff8a8a',
            'center',
          );
        }
      }

      buttons.add(
        { x: Math.floor((width - 80) / 2), y: height - 22, w: 80, h: 16 },
        'Back',
        onBack,
      );
      buttons.draw(view);
    },
    onMove(x, y) {
      buttons.move(x, y);
    },
    onClick(x, y) {
      capture = null;
      const bar = bars.find((b) => inRect(b.hit, x, y));
      if (bar) {
        bar.set((x - (bar.hit.x + 2)) / (bar.hit.w - 4));
        return;
      }
      if (buttons.click(x, y)) app.audio.play('click');
    },
    onKey(code) {
      if (capture) {
        if (code !== 'Escape') {
          const controls = app.data().settings.controls;
          // A key can only do one thing: take it away from every other action first.
          for (const a of ACTIONS) {
            if (a === capture) continue;
            const keys = (controls[a] ?? DEFAULT_BINDINGS[a]).filter((k) => k !== code);
            controls[a] =
              keys.length > 0 ? keys : [...DEFAULT_BINDINGS[a]].filter((k) => k !== code);
          }
          controls[capture] = [code];
          commit();
        }
        capture = null;
      } else {
        const ev = keyToNav(code);
        if (ev) navigate(ev);
      }
    },
  };
}
