import type { App } from '../app';
import { Camera } from '../core/camera';
import type { View } from '../core/canvas';
import { newWeapon } from '../weapons';
import type { WeaponId } from '../weapons/types';
import { RunState } from '../game';
import {
  drawEnemy,
  drawOrbiter,
  drawZone,
  drawFx,
  drawFxText,
  drawHero,
  drawMine,
  drawPickup,
  drawProjectile,
  drawTelegraph,
} from '../render/entities';
import { drawNight, nightFactor } from '../systems/daynight';
import { useItem } from '../systems/items';
import { gainXp } from '../systems/levelup';
import { BIOMES, biomeState } from '../world/biomes';
import type { Enemy } from '../entities/enemy';
import { WorldRenderer, type PropItem } from '../world/renderer';
import { drawDebug, FrameStats } from './debug';
import { drawHud } from './hud';
import { itemChoiceScreen, levelupScreen, pauseScreen, resultsScreen } from './overlays';
import type { Screen } from './router';

export interface RunOptions {
  seed: number;
  /** Run clock start in seconds (debug: jump to a biome or to night). */
  startTime: number;
  debug: boolean;
  /** Debug/testing: starting weapons and bonus XP. */
  weapons?: WeaponId[];
  startXp?: number;
}

type Drawable =
  | { y: number; kind: 'prop'; item: PropItem }
  | { y: number; kind: 'enemy'; enemy: Enemy }
  | { y: number; kind: 'hero' };

export function runScreen(app: App, opts: RunOptions): Screen {
  const { atlas, input, router } = app;
  const run = new RunState(opts.seed, opts.startTime);
  if (opts.weapons) run.weapons = opts.weapons.map((id) => newWeapon(id));
  if (opts.startXp) gainXp(run, opts.startXp);
  const renderer = new WorldRenderer(run.world);
  const camera = new Camera();
  const stats = new FrameStats();
  let showDebug = opts.debug;
  let prebaked = false;
  let propsVisible = 0;
  let lastCamX = 0;
  let lastCamY = 0;

  const onKey = (e: KeyboardEvent): void => {
    if (e.code === 'F3') {
      e.preventDefault();
      showDebug = !showDebug;
    }
  };

  return {
    enter() {
      window.addEventListener('keydown', onKey);
    },
    exit() {
      window.removeEventListener('keydown', onKey);
    },
    update(dt) {
      if (run.offer !== null) {
        router.push(levelupScreen(app, run));
        return;
      }
      if (run.pendingItem !== null) {
        router.push(itemChoiceScreen(app, run));
        return;
      }
      run.targetX = lastCamX + app.pointer.x;
      run.targetY = lastCamY + app.pointer.y;
      if (input.activePressed()) {
        const v = input.moveVector();
        useItem(run, v.x, v.y);
      }
      if (input.pausePressed() && !run.player.dead) {
        router.push(pauseScreen(app, () => app.goHub()));
        return;
      }
      run.update(dt, input);
      for (const ev of new Set(run.events)) app.audio.play(ev);
      run.events.length = 0;
      if (run.status === 'dead' && run.deadT > 1.4) router.replace(resultsScreen(app, run));
    },
    render(view: View) {
      const { ctx, width, height } = view;
      stats.tick(performance.now());
      const state = biomeState(run.time);
      const p = run.player;
      renderer.beginFrame();
      camera.follow(p.x, p.y, width, height);
      const shake = app.data().settings.screenShake ? run.shake : 0;
      const camX = camera.x + (shake > 0.5 ? Math.round(Math.sin(run.time * 97) * shake) : 0);
      const camY = camera.y + (shake > 0.5 ? Math.round(Math.cos(run.time * 83) * shake) : 0);
      lastCamX = camX;
      lastCamY = camY;
      if (!prebaked) {
        renderer.drawGround(ctx, camX, camY, width, height, state, true);
        prebaked = true;
      }
      renderer.drawGround(ctx, camX, camY, width, height, state);

      for (const z of run.zones) drawZone(ctx, z, camX, camY, run.time);
      for (const t of run.telegraphs) drawTelegraph(ctx, t, camX, camY);
      for (const pk of run.pickups) drawPickup(ctx, pk, camX, camY);

      const items = renderer.collectProps(camX, camY, width, height, state);
      propsVisible = items.length;
      for (const it of items) {
        const k = it.prop.kind;
        if (k === 'tree' || k === 'boulder' || k === 'ore') {
          renderer.drawShadow(ctx, it.prop.x, it.prop.y, k === 'tree' ? 1.1 : 0.8, camX, camY);
        }
      }
      for (const e of run.enemies) {
        if (!e.dying) renderer.drawShadow(ctx, e.x, e.y, e.radius / 6, camX, camY);
      }
      renderer.drawShadow(ctx, p.x, p.y, 0.9, camX, camY);

      const drawables: Drawable[] = items.map((item) => ({ y: item.prop.y, kind: 'prop', item }));
      for (const enemy of run.enemies) drawables.push({ y: enemy.y, kind: 'enemy', enemy });
      drawables.push({ y: p.y, kind: 'hero' });
      drawables.sort((a, b) => a.y - b.y);
      for (const d of drawables) {
        if (d.kind === 'prop') renderer.drawProp(ctx, d.item, camX, camY);
        else if (d.kind === 'enemy') drawEnemy(ctx, atlas, d.enemy, camX, camY);
        else drawHero(ctx, atlas, run, camX, camY);
      }
      for (const m of run.mines) drawMine(ctx, m, camX, camY);
      for (const o of run.orbiters) drawOrbiter(ctx, o, camX, camY, run.time);
      for (const pr of run.projectiles) drawProjectile(ctx, pr, camX, camY, p.x, p.y);
      for (const f of run.fx) drawFx(ctx, f, camX, camY);

      drawNight(ctx, width, height, nightFactor(run.time));
      if (app.data().settings.damageNumbers) for (const f of run.fx) drawFxText(ctx, f, camX, camY);
      drawHud(view, run);

      if (showDebug) {
        drawDebug(
          ctx,
          [
            `${stats.fps.toFixed(0)} FPS  ${stats.ms.toFixed(1)} ms`,
            `chunks ${renderer.cachedChunks} cached, ${renderer.bakedThisFrame} baked`,
            `bake ${renderer.lastBakeMs.toFixed(1)} ms (max ${renderer.maxBakeMs.toFixed(1)})`,
            `props ${propsVisible}  enemies ${run.enemies.length}  proj ${run.projectiles.length}`,
            `biome ${BIOMES[state.current].name} (fade ${state.fade.toFixed(2)})`,
            `time ${run.time.toFixed(0)} s  night ${nightFactor(run.time).toFixed(2)}`,
            `pos ${p.x.toFixed(0)}, ${p.y.toFixed(0)}  seed ${opts.seed}`,
          ],
          width - 152,
          height - 70,
        );
      }
    },
  };
}
