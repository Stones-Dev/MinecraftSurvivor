import { Animator } from '../core/animator';
import type { Atlas } from '../core/atlas';
import { Camera } from '../core/camera';
import type { View } from '../core/canvas';
import type { InputSource } from '../core/input';
import { Player } from '../entities/player';
import { drawNight, nightFactor } from '../systems/daynight';
import { BIOMES, biomeState } from '../world/biomes';
import { WorldRenderer, type PropItem } from '../world/renderer';
import { World } from '../world/world';
import { drawDebug, FrameStats } from './debug';
import type { Screen } from './router';

export interface RunOptions {
  seed: number;
  /** Run clock start in seconds (debug: jump to a biome or to night). */
  startTime: number;
  debug: boolean;
}

interface Drawable {
  y: number;
  item: PropItem | null;
}

/** Phase 1 run screen: walk around the generated world with day/night and a debug overlay. */
export function runScreen(atlas: Atlas, input: InputSource, opts: RunOptions): Screen {
  const world = new World(opts.seed);
  const renderer = new WorldRenderer(world);
  const player = new Player();
  const camera = new Camera();
  const anim = new Animator(atlas.anim('hero.steve.none.none.idle'));
  const stats = new FrameStats();
  let time = opts.startTime;
  let showDebug = opts.debug;
  let prebaked = false;
  let propsVisible = 0;

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
      time += dt;
      player.update(dt, input, world, biomeState(time).current);
      anim.update(dt);
    },
    render(view: View) {
      const { ctx, width, height } = view;
      stats.tick(performance.now());
      const state = biomeState(time);
      renderer.beginFrame();
      camera.follow(player.x, player.y, width, height);
      if (!prebaked) {
        renderer.drawGround(ctx, camera.x, camera.y, width, height, state, true);
        prebaked = true;
      }
      renderer.drawGround(ctx, camera.x, camera.y, width, height, state);

      const items = renderer.collectProps(camera.x, camera.y, width, height, state);
      propsVisible = items.length;
      for (const it of items) {
        if (it.prop.kind === 'tree' || it.prop.kind === 'boulder' || it.prop.kind === 'ore') {
          renderer.drawShadow(
            ctx,
            it.prop.x,
            it.prop.y,
            it.prop.kind === 'tree' ? 1.1 : 0.8,
            camera.x,
            camera.y,
          );
        }
      }
      renderer.drawShadow(ctx, player.x, player.y, 0.9, camera.x, camera.y);

      const drawables: Drawable[] = items.map((item) => ({ y: item.prop.y, item }));
      drawables.push({ y: player.y, item: null });
      drawables.sort((a, b) => a.y - b.y);
      for (const d of drawables) {
        if (d.item) {
          renderer.drawProp(ctx, d.item, camera.x, camera.y);
        } else {
          const bob = player.moving ? -(Math.floor(time * 10) % 2) : 0;
          atlas.draw(
            ctx,
            anim.frameKey,
            player.x - camera.x,
            player.y - camera.y + bob,
            player.facing < 0,
          );
        }
      }

      drawNight(ctx, width, height, nightFactor(time));

      if (showDebug) {
        drawDebug(ctx, [
          `${stats.fps.toFixed(0)} FPS  ${stats.ms.toFixed(1)} ms`,
          `chunks ${renderer.cachedChunks} cached, ${renderer.bakedThisFrame} baked`,
          `bake ${renderer.lastBakeMs.toFixed(1)} ms (max ${renderer.maxBakeMs.toFixed(1)})`,
          `props ${propsVisible}  entities 1`,
          `biome ${BIOMES[state.current].name} (fade ${state.fade.toFixed(2)})`,
          `time ${time.toFixed(0)} s  night ${nightFactor(time).toFixed(2)}`,
          `pos ${player.x.toFixed(0)}, ${player.y.toFixed(0)}  seed ${opts.seed}`,
        ]);
      }
    },
  };
}
