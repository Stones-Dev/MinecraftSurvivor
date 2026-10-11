import { Animator } from '../core/animator';
import type { Atlas } from '../core/atlas';
import type { View } from '../core/canvas';
import { t } from '../core/i18n';
import type { Router, Screen } from './router';

const FONT = '8px "Pixelify Sans", monospace';

function text(view: View, s: string, x: number, y: number, color = '#fff'): void {
  const { ctx } = view;
  ctx.font = FONT;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#000';
  ctx.fillText(s, x + 1, y + 1);
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

export const SCREEN_NAMES = [
  'run-setup',
  'run',
  'pause',
  'levelup',
  'results',
  'collection',
  'gacha',
  'upgrades',
  'settings',
  'about',
] as const;

/** Placeholder for screens that arrive in later phases. */
export function emptyScreen(name: string, router: Router, hub: () => Screen): Screen {
  return {
    update() {},
    render(view) {
      view.ctx.fillStyle = '#1b1b24';
      view.ctx.fillRect(0, 0, view.width, view.height);
      text(view, `${name} — ${t('screen.empty')}`, view.width / 2, view.height / 2);
    },
    onClick() {
      router.replace(hub());
    },
  };
}

export function titleScreen(router: Router, hub: () => Screen): Screen {
  return {
    update() {},
    render(view) {
      view.ctx.fillStyle = '#12121a';
      view.ctx.fillRect(0, 0, view.width, view.height);
      text(view, t('game.title'), view.width / 2, view.height / 2 - 12, '#7ddc6f');
      text(view, t('game.tagline'), view.width / 2, view.height / 2 + 2, '#ccc');
      text(view, t('title.start'), view.width / 2, view.height / 2 + 24, '#ffd84a');
    },
    onClick() {
      router.replace(hub());
    },
  };
}

/** Hub placeholder: Steve idling at the art resolution (the zoom is applied by the canvas). */
export function hubScreen(atlas: Atlas): Screen {
  const anim = new Animator(atlas.anim('hero.steve.none.none.idle'));
  return {
    update(dt) {
      anim.update(dt);
    },
    render(view) {
      const { ctx, width, height } = view;
      ctx.fillStyle = '#2b1f3a';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#4b6b3a';
      ctx.fillRect(0, Math.floor(height * 0.7), width, height);
      text(view, t('screen.hub'), width / 2, 16);
      atlas.draw(ctx, anim.frameKey, width / 2, height * 0.7 + 8);
    },
  };
}
