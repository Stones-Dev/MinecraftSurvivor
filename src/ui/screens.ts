import { Animator } from '../core/animator';
import type { View } from '../core/canvas';
import { t } from '../core/i18n';
import type { App } from '../app';
import { allyById, heroById, petById } from '../data/companions';
import { loadoutFromSave } from '../systems/meta';
import { aboutScreen } from './aboutScreen';
import { collectionScreen } from './collectionScreen';
import { drawIcon } from './icons';
import { drawText } from './panel';
import { runSetupScreen } from './runSetupScreen';
import type { Router, Screen } from './router';
import { settingsScreen } from './settingsScreen';
import { spawnerScreen } from './spawnerScreen';
import { upgradesScreen } from './upgradesScreen';
import { Buttons, drawCompanion } from './widgets';

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
    onKey(code) {
      if (code === 'Enter' || code === 'Space') router.replace(hub());
    },
  };
}

/** Main menu: the equipped hero idling at dusk plus the entry points to every meta screen. */
export function hubScreen(app: App): Screen {
  app.audio.setTheme('hub');
  const { atlas, router } = app;
  const buttons = new Buttons();
  let time = 0;
  const heroAnim = (): Animator => {
    const id = `hero.${heroById(app.data().loadout.hero).hero}.none.none.idle`;
    return new Animator(
      atlas.hasAnim(id) ? atlas.anim(id) : atlas.anim('hero.steve.none.none.idle'),
    );
  };
  let anim = heroAnim();
  let animHero = app.data().loadout.hero;
  const back = (): void => router.pop();
  const play = (): void => {
    const data = app.data();
    if (data.records.runs === 0 && !data.flags.tutorialDone) app.startRun();
    else router.push(runSetupScreen(app, (l) => app.startRun(l), back));
  };
  return {
    update(dt) {
      time += dt;
      const hero = app.data().loadout.hero;
      if (hero !== animHero) {
        animHero = hero;
        anim = heroAnim();
      }
      anim.update(dt);
    },
    render(view) {
      const { ctx, width, height } = view;
      const data = app.data();
      const g = ctx.createLinearGradient(0, 0, 0, height);
      g.addColorStop(0, '#2b1f3a');
      g.addColorStop(0.7, '#a2536a');
      g.addColorStop(1, '#d8895a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
      const ground = Math.floor(height * 0.72);
      ctx.fillStyle = '#3d5a2e';
      ctx.fillRect(0, ground, width, height - ground);
      ctx.fillStyle = '#4b6b3a';
      ctx.fillRect(0, ground, width, 2);
      // Stars.
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (let i = 0; i < 24; i++) {
        const sx = (i * 97) % width;
        const sy = (i * 53) % Math.floor(ground * 0.6);
        if ((Math.floor(time * 2) + i) % 7 !== 0) ctx.fillRect(sx, sy, 1, 1);
      }
      drawText(ctx, t('game.title'), width / 2, 30, '#7ddc6f', 'center');
      drawText(ctx, t('game.tagline'), width / 2, 42, '#e8d8c8', 'center');
      // Hero and companions.
      const hx = Math.floor(width * 0.3);
      atlas.draw(ctx, anim.frameKey, hx, ground + 14, false, 1.6);
      const lo = loadoutFromSave(data);
      const petDef = lo.pet ? petById(lo.pet.id) : undefined;
      if (petDef) drawCompanion(ctx, atlas, petDef, hx - 28, ground + 14, time);
      lo.allies.forEach((a, i) => {
        const def = allyById(a.id);
        if (def) drawCompanion(ctx, atlas, def, hx + 30 + i * 26, ground + 14, time);
      });
      // Menu.
      buttons.begin();
      const bw = 96;
      const bx = Math.floor(width * 0.66 - bw / 2);
      // Six buttons plus the resource line must fit even at the smallest canvas (320x180).
      const step = Math.min(23, Math.floor((height - 64) / 6.5));
      let by = Math.max(46, Math.floor(height * 0.26));
      const add = (label: string, fn: () => void): void => {
        buttons.add({ x: bx, y: by, w: bw, h: step - 4 }, label, fn);
        by += step;
      };
      add('PLAY', play);
      add('COLLECTION', () => router.push(collectionScreen(app, back)));
      add('SPAWNER', () => router.push(spawnerScreen(app, back)));
      add('UPGRADES', () => router.push(upgradesScreen(app, back)));
      add('SETTINGS', () => router.push(settingsScreen(app, back)));
      add('ABOUT', () => router.push(aboutScreen(app, back)));
      buttons.draw(view);
      drawIcon(ctx, 'emerald', bx, by + 2);
      drawText(ctx, String(data.currencies.emeralds), bx + 15, by + 11, '#7dff9a');
      drawIcon(ctx, 'egg', bx + 48, by + 2);
      drawText(
        ctx,
        `${data.currencies.spawnEggs} / ${data.currencies.rareSpawnEggs}`,
        bx + 63,
        by + 11,
        '#ffd84a',
      );
      if (data.records.bestTimeSec > 0) {
        const m = Math.floor(data.records.bestTimeSec / 60);
        const sec = String(Math.floor(data.records.bestTimeSec % 60)).padStart(2, '0');
        drawText(
          ctx,
          `Best ${m}:${sec}  Kills ${data.records.bestKills}`,
          width / 2,
          height - 6,
          '#e8d8c8',
          'center',
        );
      }
    },
    onMove(x, y) {
      buttons.move(x, y);
    },
    onClick(x, y) {
      buttons.click(x, y);
    },
    onKey(code) {
      if (code === 'Enter' || code === 'Space') play();
    },
  };
}
