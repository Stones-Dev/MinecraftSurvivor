/** Settings (BRIEF section 5): Audio / Graphics / Controls / Data sub-tabs. Every change saves and calls applySettings(). */
import type { App } from '../app';
import type { View } from '../core/canvas';
import { ACTIONS, DEFAULT_BINDINGS, type Action } from '../core/input';
import type { SaveData } from '../core/save';
import { UI_FONT, drawButton, drawPanel, drawText, inRect, type Rect } from './panel';
import type { Screen } from './router';
import { Buttons, drawTitle } from './widgets';

type Tab = 'audio' | 'graphics' | 'controls' | 'data';
type Quality = SaveData['settings']['quality'];

const TABS: { id: Tab; label: string }[] = [
  { id: 'audio', label: 'Audio' },
  { id: 'graphics', label: 'Graphics' },
  { id: 'controls', label: 'Controls' },
  { id: 'data', label: 'Data' },
];
const ACTION_LABEL: Record<Action, string> = {
  up: 'Move up',
  down: 'Move down',
  left: 'Move left',
  right: 'Move right',
  pause: 'Pause',
  item: 'Use item',
};
const QUALITY: Quality[] = ['auto', 'high', 'medium', 'low'];
/** Seconds the "Really reset?" confirmation stays armed. */
const RESET_ARM = 3;

const keyName = (code: string): string => code.replace(/^(Key|Digit)/, '');

/** Shorten `s` with an ellipsis so it fits in `maxW` art pixels. */
function fit(ctx: CanvasRenderingContext2D, s: string, maxW: number): string {
  ctx.font = UI_FONT;
  if (ctx.measureText(s).width <= maxW) return s;
  let t = s;
  while (t.length > 1 && ctx.measureText(`${t}..`).width > maxW) t = t.slice(0, -1);
  return `${t}..`;
}

export function settingsScreen(app: App, onBack: () => void): Screen {
  const buttons = new Buttons();
  let tab: Tab = 'audio';
  let capture: Action | null = null;
  let clock = 0;
  let resetUntil = 0;
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
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      file.text().then(
        (text) => {
          try {
            app.store.import(text);
            app.applySettings();
            say('Imported');
          } catch {
            say('Invalid file', false);
          }
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
    },
    render(view: View) {
      const { ctx, width, height } = view;
      const data = app.data();
      const s = data.settings;
      drawTitle(view, 'SETTINGS');
      buttons.begin();
      bars = [];

      // Sub-tabs.
      const rowW = Math.min(width - 12, 300);
      const x0 = Math.floor((width - rowW) / 2);
      const tw = Math.floor((rowW - 12) / 4);
      const tabRects = TABS.map((t, i) => {
        const r = { x: x0 + i * (tw + 4), y: 28, w: tw, h: 14 };
        buttons.add(r, t.label, () => setTab(t.id));
        return r;
      });

      // Row helpers: a panel per row, label on the left, controls on the right.
      const top = 50;
      const rowY = (i: number): number => top + i * 20;
      const row = (i: number, label: string, note?: string): void => {
        drawPanel(ctx, { x: x0, y: rowY(i), w: rowW, h: 18 });
        drawText(ctx, label, x0 + 5, rowY(i) + 12);
        if (note) drawText(ctx, note, x0 + 82, rowY(i) + 12, '#9a9aa8');
      };
      const ctl = (i: number, w: number): Rect => ({
        x: x0 + rowW - w - 2,
        y: rowY(i) + 2,
        w,
        h: 14,
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
        const bar = { x: plus.x - 4 - 90, y: rowY(i) + 5, w: 90, h: 8 };
        const minus = { x: bar.x - 4 - 14, y: plus.y, w: 14, h: 14 };
        buttons.add(minus, '-', () => setVolume(key, v - 0.1), v <= 0);
        buttons.add(plus, '+', () => setVolume(key, v + 0.1), v >= 1);
        ctx.fillStyle = '#101014';
        ctx.fillRect(bar.x, bar.y, bar.w, bar.h);
        ctx.fillStyle = '#3b3b46';
        ctx.fillRect(bar.x + 1, bar.y + 1, bar.w - 2, bar.h - 2);
        ctx.fillStyle = '#7dff9a';
        ctx.fillRect(bar.x + 1, bar.y + 1, Math.round((bar.w - 2) * v), bar.h - 2);
        drawText(ctx, `${Math.round(v * 100)}%`, minus.x - 4, rowY(i) + 12, '#cfcfd8', 'right');
        bars.push({
          hit: { x: bar.x - 2, y: plus.y, w: bar.w + 4, h: 14 },
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
        toggle(3, 'FPS counter', s.showFps, () => (s.showFps = !s.showFps));
        row(4, 'Fullscreen');
        buttons.add(ctl(4, 60), document.fullscreenElement ? 'Exit' : 'Enter', toggleFullscreen);
      } else if (tab === 'controls') {
        const gap = 6;
        const colW = Math.floor((rowW - gap) / 2);
        ACTIONS.forEach((a, i) => {
          const r = {
            x: x0 + (i % 2) * (colW + gap),
            y: top + Math.floor(i / 2) * 20,
            w: colW,
            h: 16,
          };
          const keys = (s.controls[a]?.length ? s.controls[a] : DEFAULT_BINDINGS[a]) ?? [];
          const text =
            capture === a
              ? `${ACTION_LABEL[a]}  press a key...`
              : `${ACTION_LABEL[a]}  ${keys.map(keyName).join(' / ')}`;
          buttons.add(r, fit(ctx, text, colW - 6), () => {
            capture = a;
          });
        });
        buttons.add(
          { x: Math.floor((width - 110) / 2), y: top + 66, w: 110, h: 16 },
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
          top + 98,
          capture ? '#ffd84a' : '#9a9aa8',
          'center',
        );
      } else {
        row(0, 'Export save', 'minesurvive-save.json');
        buttons.add(ctl(0, 80), 'Export', exportSave);
        row(1, 'Import save', 'Load a save file');
        buttons.add(ctl(1, 80), 'Import', importSave);
        row(2, 'Reset save', 'Erase all progress');
        buttons.add(ctl(2, 80), clock < resetUntil ? 'Really reset?' : 'Reset', resetSave);
        if (message) {
          drawText(
            ctx,
            message,
            width / 2,
            rowY(3) + 12,
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
      // Highlight the active tab on top of the plain buttons.
      const active = TABS.findIndex((t) => t.id === tab);
      const ar = tabRects[active];
      const label = TABS[active]?.label ?? '';
      if (ar) {
        drawButton(ctx, ar, label, true);
        ctx.fillStyle = '#ffd84a';
        ctx.fillRect(ar.x, ar.y + ar.h, ar.w, 2);
      }
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
          app.data().settings.controls[capture] = [code];
          commit();
        }
        capture = null;
      } else if (code === 'Escape') {
        onBack();
      }
    },
  };
}
