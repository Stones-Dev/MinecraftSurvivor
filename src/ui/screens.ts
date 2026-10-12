import { Animator } from '../core/animator';
import { t } from '../core/i18n';
import type { App } from '../app';
import { allyById, heroById, petById } from '../data/companions';
import { drawNight } from '../systems/daynight';
import { loadoutFromSave } from '../systems/meta';
import { biomeState } from '../world/biomes';
import { WorldRenderer } from '../world/renderer';
import { World } from '../world/world';
import { aboutScreen } from './aboutScreen';
import { collectionScreen } from './collectionScreen';
import { drawIcon } from './icons';
import { drawText, drawTextScaled } from './panel';
import { runSetupScreen } from './runSetupScreen';
import type { Router, Screen } from './router';
import { settingsScreen } from './settingsScreen';
import { spawnerScreen } from './spawnerScreen';
import { upgradesScreen } from './upgradesScreen';
import { Buttons, drawCompanion } from './widgets';

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
      drawText(
        view.ctx,
        `${name} — ${t('screen.empty')}`,
        view.width / 2,
        view.height / 2,
        '#fff',
        'center',
      );
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
      const { ctx, width, height } = view;
      drawTextScaled(ctx, t('game.title'), width / 2, height / 2 - 12, '#7ddc6f', 'center', 2);
      drawText(ctx, t('game.tagline'), width / 2, height / 2 + 2, '#ccc', 'center');
      drawText(ctx, t('title.start'), width / 2, height / 2 + 24, '#ffd84a', 'center');
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
  let baked = false;
  const world = new WorldRenderer(new World(1337 + (app.data().createdAt % 97)));
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
      // Live slice of the world at dusk behind the menu: the hero and companions stand on real terrain.
      const ground = Math.floor(height * 0.72);
      const camX = -Math.floor(width * 0.3);
      const camY = -(ground + 14);
      const state = biomeState(0);
      if (!baked) {
        world.drawGround(ctx, camX, camY, width, height, state, true);
        baked = true;
      }
      world.beginFrame();
      world.drawGround(ctx, camX, camY, width, height, state, false, time);
      for (const item of world.collectProps(camX, camY, width, height, state)) {
        if (Math.abs(item.prop.x) > 14 || Math.abs(item.prop.y) > 8)
          world.drawProp(ctx, item, camX, camY);
      }
      drawNight(ctx, width, height, 1);
      const glow = ctx.createLinearGradient(0, 0, 0, height);
      glow.addColorStop(0, 'rgba(214,110,70,0)');
      glow.addColorStop(1, 'rgba(214,110,70,0.2)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);
      drawTextScaled(ctx, t('game.title'), width / 2, 30, '#7ddc6f', 'center', 2);
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
        drawText(ctx, `Best ${m}:${sec}  Kills ${data.records.bestKills}`, 6, 10, '#e8d8c8');
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
