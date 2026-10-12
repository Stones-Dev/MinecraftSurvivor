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
  drawNpc,
  drawAlly,
  drawPet,
  drawPortal,
  drawPropExtra,
  drawRescueFlag,
  drawMine,
  drawPickup,
  drawProjectile,
  drawTelegraph,
} from '../render/entities';
import { drawNight, nightFactor } from '../systems/daynight';
import { type Npc, spawnTrader, spawnVillager } from '../systems/npcs';
import type { RunLoadout } from '../systems/meta';
import type { Ally, PetState } from '../entities/ally';
import { useItem } from '../systems/items';
import { gainXp } from '../systems/levelup';
import { BIOMES } from '../world/biomes';
import type { Enemy } from '../entities/enemy';
import { WorldRenderer, type PropItem } from '../world/renderer';
import { drawDebug, FrameStats } from './debug';
import { drawHud } from './hud';
import {
  itemChoiceScreen,
  levelupScreen,
  pauseScreen,
  resultsScreen,
  victoryScreen,
} from './overlays';
import type { Screen } from './router';

export interface RunOptions {
  seed: number;
  /** Run clock start in seconds (debug: jump to a biome or to night). */
  startTime: number;
  debug: boolean;
  /** Debug/testing: starting weapons and bonus XP. */
  weapons?: WeaponId[];
  startXp?: number;
  /** Debug: override max HP (for screenshots). */
  hp?: number;
  /** Debug: open a Nether portal, a trader or a lost villager right away. */
  portal?: boolean;
  trader?: boolean;
  villager?: boolean;
  /** Hero, pet, allies and upgrades chosen in the hub. */
  loadout?: RunLoadout;
}

type Drawable =
  | { y: number; kind: 'prop'; item: PropItem }
  | { y: number; kind: 'enemy'; enemy: Enemy }
  | { y: number; kind: 'npc'; npc: Npc }
  | { y: number; kind: 'ally'; ally: Ally }
  | { y: number; kind: 'pet'; pet: PetState }
  | { y: number; kind: 'hero' };

/** Rain, snow, lightning flash and the Warden's darkness (screen-space, drawn over the world). */
function drawWeather(
  ctx: CanvasRenderingContext2D,
  run: RunState,
  w: number,
  h: number,
  snowing: boolean,
): void {
  const t = run.time;
  if (run.storm) {
    ctx.fillStyle = 'rgba(20,30,60,0.28)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(190,210,255,0.55)';
    for (let i = 0; i < 90; i++) {
      const x = (i * 37 + t * 60) % w;
      const y = (i * 53 + t * 340) % h;
      ctx.fillRect(Math.round(x), Math.round(y), 1, 4);
    }
  }
  if (snowing) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 70; i++) {
      const x = (i * 41 + Math.sin(t * 0.9 + i) * 12 + t * 9 + w * 4) % w;
      const y = (i * 29 + t * (26 + (i % 5) * 6)) % h;
      ctx.fillRect(Math.round(x), Math.round(y), i % 3 === 0 ? 2 : 1, i % 3 === 0 ? 2 : 1);
    }
  }
  if (run.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.7, run.flash * 2).toFixed(2)})`;
    ctx.fillRect(0, 0, w, h);
  }
  if (run.darkness > 0) {
    const k = Math.min(1, run.darkness / 0.7, (3.5 - run.darkness) / 0.5 + 0.0001);
    const r = 260 - 190 * Math.max(0, Math.min(1, k));
    const g = ctx.createRadialGradient(w / 2, h / 2, r * 0.55, w / 2, h / 2, r);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.96)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}

export function runScreen(app: App, opts: RunOptions): Screen {
  const { atlas, input, router } = app;
  const run = new RunState(opts.seed, opts.startTime, opts.loadout);
  if (opts.weapons) run.weapons = opts.weapons.map((id) => newWeapon(id));
  if (opts.startXp) gainXp(run, opts.startXp);
  if (opts.hp) {
    run.baseMaxHp = opts.hp;
    run.recomputeStats();
    run.player.hp = run.player.maxHp;
  }
  if (opts.portal) run.rift.portal = { x: 50, y: -20, left: 45 };
  if (opts.trader) spawnTrader(run);
  if (opts.villager) spawnVillager(run);
  const overRenderer = new WorldRenderer(run.overworld);
  const arenaRenderer = new WorldRenderer(run.arenaWorld);
  let renderer = overRenderer;
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
      if (run.won && !run.victoryShown) {
        run.victoryShown = true;
        router.push(victoryScreen(app, run));
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
      const state = run.biomeState();
      const p = run.player;
      const nextRenderer = run.rift.active ? arenaRenderer : overRenderer;
      if (nextRenderer !== renderer) {
        renderer = nextRenderer;
        prebaked = false;
      }
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
      if (run.rescue) drawRescueFlag(ctx, run.rescue, camX, camY, run.time);
      if (run.rift.portal) drawPortal(ctx, run.rift.portal, camX, camY, run.time);
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
      for (const npc of run.npcs) drawables.push({ y: npc.y, kind: 'npc', npc });
      for (const ally of run.allies) drawables.push({ y: ally.y, kind: 'ally', ally });
      if (run.pet) drawables.push({ y: run.pet.y, kind: 'pet', pet: run.pet });
      drawables.push({ y: p.y, kind: 'hero' });
      drawables.sort((a, b) => a.y - b.y);
      for (const d of drawables) {
        if (d.kind === 'prop') {
          renderer.drawProp(ctx, d.item, camX, camY);
          drawPropExtra(ctx, run, d.item.prop, camX, camY);
        } else if (d.kind === 'npc') drawNpc(ctx, atlas, d.npc, camX, camY, run.time);
        else if (d.kind === 'ally') drawAlly(ctx, atlas, d.ally, camX, camY, run.time);
        else if (d.kind === 'pet') drawPet(ctx, atlas, d.pet, camX, camY, run.time);
        else if (d.kind === 'enemy') drawEnemy(ctx, atlas, d.enemy, camX, camY);
        else drawHero(ctx, atlas, run, camX, camY);
      }
      for (const m of run.mines) drawMine(ctx, m, camX, camY);
      for (const o of run.orbiters) drawOrbiter(ctx, o, camX, camY, run.time);
      for (const pr of run.projectiles) drawProjectile(ctx, pr, camX, camY, p.x, p.y);
      for (const f of run.fx) drawFx(ctx, f, camX, camY);

      drawNight(
        ctx,
        width,
        height,
        nightFactor(run.time) * (1 - Math.min(0.6, run.mods.nightVision)),
      );
      drawWeather(ctx, run, width, height, state.current === 'snowy_taiga');
      if (app.data().settings.damageNumbers) for (const f of run.fx) drawFxText(ctx, f, camX, camY);
      if (run.rift.active) {
        ctx.fillStyle = 'rgba(120,20,0,0.14)';
        ctx.fillRect(0, 0, width, height);
      }
      drawHud(view, run, camX, camY);

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
