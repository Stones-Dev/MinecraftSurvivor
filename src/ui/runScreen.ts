import type { App } from '../app';
import { cameraLead, reduceFlash, textScale } from '../core/accessibility';
import { aggregateEvents, stepMaterial, type StepMaterial } from '../core/sfxModel';
import { Camera } from '../core/camera';
import { Shake } from '../core/shake';
import type { View } from '../core/canvas';
import { makeEnemy } from '../systems/spawner';
import { newWeapon } from '../weapons';
import type { WeaponId } from '../weapons/types';
import { RunState } from '../game';
import {
  drawEnemy,
  drawOrbiter,
  drawZone,
  drawFx,
  drawFxTexts,
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
import { MusicDirector } from '../data/music';
import { pickEnemyId, spawnPool } from '../data/rosters';
import type { Ally, PetState } from '../entities/ally';
import { castAbility } from '../abilities';
import { useItem } from '../systems/items';
import { gainXp } from '../systems/levelup';
import { BIOMES, type BiomeId } from '../world/biomes';
import type { Enemy } from '../entities/enemy';
import { WorldRenderer, type PropItem } from '../world/renderer';
import { AmbientField } from '../render/ambient';
import { drawDebug, FrameStats } from './debug';
import { drawHud } from './hud';
import { Minimap } from './minimap';
import { drawPanel, drawText } from './panel';
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
  /** Debug: spawn this many enemies around the hero at the start (performance checks). */
  crowd?: number;
  /** Hero, pet, allies and upgrades chosen in the hub. */
  loadout?: RunLoadout;
  /** Debug: start at the nearest spot inside this biome instead of the spawn meadow. */
  biome?: BiomeId;
}

type Drawable =
  | { y: number; kind: 'prop'; item: PropItem }
  | { y: number; kind: 'enemy'; enemy: Enemy }
  | { y: number; kind: 'npc'; npc: Npc }
  | { y: number; kind: 'ally'; ally: Ally }
  | { y: number; kind: 'pet'; pet: PetState }
  | { y: number; kind: 'hero' };

const RAIN_DROPS = [20, 50, 90] as const;
const SNOW_FLAKES = [16, 40, 70] as const;

/** Rain, snow, lightning flash and the Warden's darkness (screen-space, drawn over the world). */
function drawWeather(
  ctx: CanvasRenderingContext2D,
  run: RunState,
  w: number,
  h: number,
  snowing: boolean,
  quality: 0 | 1 | 2,
): void {
  const t = run.time;
  if (run.storm) {
    ctx.fillStyle = 'rgba(20,30,60,0.28)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(190,210,255,0.55)';
    for (let i = 0; i < RAIN_DROPS[quality]; i++) {
      const x = (i * 37 + t * 60) % w;
      const y = (i * 53 + t * 340) % h;
      ctx.fillRect(Math.round(x), Math.round(y), 1, 4);
    }
  }
  if (snowing) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < SNOW_FLAKES[quality]; i++) {
      const x = (i * 41 + Math.sin(t * 0.9 + i) * 12 + t * 9 + w * 4) % w;
      const y = (i * 29 + t * (26 + (i % 5) * 6)) % h;
      ctx.fillRect(Math.round(x), Math.round(y), i % 3 === 0 ? 2 : 1, i % 3 === 0 ? 2 : 1);
    }
  }
  if (run.flash > 0 && !reduceFlash()) {
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

/** The footstep material under the hero (tile, the biome's ground family and the world's surface answer). */
function stepMaterialUnder(run: RunState): StepMaterial {
  const p = run.player;
  return stepMaterial(
    run.world.tileAtPx(p.x, p.y),
    BIOMES[run.biome()].ground,
    run.world.surface(p.x, p.y, run.biome()),
  );
}

/** The 20-second first-run hints (BRIEF section 5). */
function drawTutorial(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  const steps = [
    'Move with WASD or the arrow keys',
    'Your weapons fire on their own',
    'Collect the green gems for XP',
    'Level up to pick a new card',
  ];
  const i = Math.min(steps.length - 1, Math.floor(t / 5.5));
  const text = steps[i] ?? '';
  const alpha = Math.min(1, (22 - t) / 2, (t % 5.5) / 0.4 + 0.2);
  ctx.globalAlpha = Math.max(0, alpha);
  drawPanel(ctx, { x: Math.floor(w / 2) - 100, y: h - 56, w: 200, h: 20 });
  drawText(ctx, text, w / 2, h - 43, '#ffd84a', 'center');
  ctx.globalAlpha = 1;
}

export function runScreen(app: App, opts: RunOptions): Screen {
  const { atlas, input, router } = app;
  const run = new RunState(opts.seed, opts.startTime, opts.loadout);
  if (opts.biome) run.startInBiome(opts.biome);
  if (opts.weapons) run.weapons = opts.weapons.map((id) => newWeapon(id));
  if (opts.startXp) gainXp(run, opts.startXp);
  if (opts.hp) {
    run.baseMaxHp = opts.hp;
    run.recomputeStats();
    run.player.hp = run.player.maxHp;
  }
  if (opts.crowd) {
    // The crowd is drawn from the roster of the biome the run starts in (`?biome=` shows each one's mobs):
    // half from the whole weighted pool, half from the mobs that only live in that biome.
    const night = nightFactor(run.time) > 0.6;
    const minute = Math.max(run.time / 60, 6);
    const generic = Math.max(run.time / 60, 3);
    const own = spawnPool(run.biome(), minute, night, true).filter((e) =>
      e.def.biomes?.includes(run.biome()),
    );
    for (let i = 0; i < opts.crowd; i++) {
      const id =
        i % 2 === 1 && own.length > 0
          ? (own[Math.floor(i / 2) % own.length]?.def.id ?? 'zombie')
          : pickEnemyId(run.biome(), generic, night, true, (i * 0.618) % 1);
      const e = makeEnemy(run, id, 0, 0, false);
      if (!e) continue;
      const a = (i / opts.crowd) * Math.PI * 2 * 7;
      const r = 50 + ((i * 37) % 220);
      e.x = run.player.x + Math.cos(a) * r;
      e.y = run.player.y + Math.sin(a) * r;
      run.enemies.push(e);
    }
  }
  if (opts.portal) run.rift.portal = { x: 50, y: -20, left: 45 };
  if (opts.trader) spawnTrader(run);
  if (opts.villager) spawnVillager(run);
  const overRenderer = new WorldRenderer(run.overworld);
  const arenaRenderer = new WorldRenderer(run.arenaWorld);
  let renderer = overRenderer;
  const camera = new Camera();
  const stats = new FrameStats();
  // True while the last update stepped the simulation (false when an overlay paused it).
  let simRan = false;
  const screenShake = new Shake();
  let lastRenderMs = performance.now();
  // First run ever: a short overlay explains movement, auto-attack, XP and level-up cards.
  const tutorial = !opts.debug && !app.data().flags.tutorialDone && app.data().records.runs === 0;
  let showDebug = opts.debug;
  let prebaked = false;
  let propsVisible = 0;
  let lastCamX = 0;
  let lastCamY = 0;

  let deathSting = false;
  let runStarted = false;
  // Biome music with hysteresis, the corner minimap (M) and the ambient specks.
  const musicDir = new MusicDirector();
  const minimap = new Minimap();
  const ambient = new AmbientField(opts.seed);

  // Quality tier: fixed by the setting, or adapted to the measured frame time when set to auto.
  let autoTier: 0 | 1 | 2 = 2;
  let slowFrames = 0;
  let fastFrames = 0;
  const updateQuality = (): void => {
    const q = app.data().settings.quality;
    if (q !== 'auto') {
      run.quality = q === 'high' ? 2 : q === 'medium' ? 1 : 0;
      return;
    }
    if (stats.ms > 24) {
      fastFrames = 0;
      if (++slowFrames >= 90 && autoTier > 0) {
        autoTier = (autoTier - 1) as 0 | 1 | 2;
        slowFrames = 0;
      }
    } else if (stats.ms < 15) {
      slowFrames = 0;
      if (++fastFrames >= 900 && autoTier < 2) {
        autoTier = (autoTier + 1) as 0 | 1 | 2;
        fastFrames = 0;
      }
    } else {
      slowFrames = Math.max(0, slowFrames - 1);
    }
    run.quality = autoTier;
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.code === 'F3') {
      e.preventDefault();
      showDebug = !showDebug;
    } else if (e.code === 'KeyM' && !e.repeat) {
      minimap.toggle();
    }
  };

  return {
    enter() {
      window.addEventListener('keydown', onKey);
      if (!opts.debug && !runStarted) {
        // Anti-cheat timestamp for the leaderboard; fire and forget, never blocks the run.
        runStarted = true;
        try {
          void app
            .leaderboard()
            .runStarted?.()
            ?.catch(() => undefined);
        } catch {
          // Offline / signed out: nothing to record.
        }
      }
    },
    onClick(x, y) {
      // Tap or click the minimap (or its touch chip) to toggle it, like the M key; touch buttons win.
      if (!(app.touch.enabled && app.touch.buttonAt(x, y))) minimap.tap(x, y);
    },
    exit() {
      window.removeEventListener('keydown', onKey);
    },
    update(dt) {
      simRan = false;
      if (run.offer !== null) {
        router.push(levelupScreen(app, run));
        return;
      }
      if (run.won && !run.victoryShown) {
        run.victoryShown = true;
        router.push(victoryScreen(app, run, !opts.debug));
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
        const itemBefore = run.item;
        const cdBefore = run.itemCd;
        useItem(run, v.x, v.y);
        if (run.itemCd > cdBefore || run.item !== itemBefore) run.stats.itemsUsed++;
      }
      if (input.abilityPressed?.()) {
        const v = input.moveVector();
        castAbility(run, { x: run.targetX, y: run.targetY, moveX: v.x, moveY: v.y });
      }
      if (input.pausePressed() && !run.player.dead) {
        router.push(pauseScreen(app, () => app.goHub(), run));
        return;
      }
      // Global hit-stop (core/hitstop.ts): a few skipped steps after a heavy hit; never with reduced flashing.
      run.hitStop.globalEnabled = !reduceFlash() && !run.player.dead;
      if (run.hitStop.tickGlobal()) return;
      run.update(dt, input);
      simRan = true;
      app.audio.setTheme(
        run.status === 'dead'
          ? null
          : musicDir.update(dt, {
              boss: run.enemies.some((e) => e.boss === 'boss' && !e.dying),
              rift: run.rift.active,
              night: nightFactor(run.time),
              biome: run.biome(),
            }),
      );
      app.audio.noteKillTotal(run.kills); // kill-streak pitch of the hit sounds
      for (const [ev, count] of aggregateEvents(run.events)) {
        app.audio.play(ev, count, ev === 'step' ? stepMaterialUnder(run) : undefined);
      }
      run.events.length = 0;
      if (run.status === 'dead' && !deathSting) {
        deathSting = true;
        app.audio.play('gameover');
      }
      if (run.status === 'dead' && run.deadT > 1.4)
        router.replace(resultsScreen(app, run, !opts.debug));
    },
    render(view: View, alpha = 1) {
      const { ctx, width, height } = view;
      stats.tick(performance.now());
      updateQuality();
      const state = run.biomeState();
      const p = run.player;
      const nextRenderer = run.rift.active ? arenaRenderer : overRenderer;
      if (nextRenderer !== renderer) {
        renderer = nextRenderer;
        prebaked = false;
      }
      renderer.beginFrame();
      // Blend the last two simulation steps so motion is smooth at any refresh rate; while the sim is
      // paused (overlays) there is nothing to blend.
      run.interpolate(simRan ? alpha : 1);
      const nowMs = performance.now();
      const frameDt = Math.min(0.05, (nowMs - lastRenderMs) / 1000);
      lastRenderMs = nowMs;
      // Settings: camera look-ahead off = follow the hero exactly; reduce-flashing also stops the shake.
      const lead = cameraLead();
      camera.follow(p.rx, p.ry, width, height, lead ? p.vx : 0, lead ? p.vy : 0, frameDt);
      const shakeOn = app.data().settings.screenShake && !reduceFlash();
      const shakeOff = screenShake.step(run.shake, frameDt, shakeOn);
      const camX = camera.x + shakeOff.x;
      const camY = camera.y + shakeOff.y;
      lastCamX = camX;
      lastCamY = camY;
      if (!prebaked) {
        renderer.drawGround(ctx, camX, camY, width, height, state, true);
        prebaked = true;
      }
      renderer.drawGround(ctx, camX, camY, width, height, state, false, run.time);

      for (const z of run.zones) drawZone(ctx, z, camX, camY, run.time);
      if (run.rescue) drawRescueFlag(ctx, run.rescue, camX, camY, run.time);
      if (run.rift.portal) drawPortal(ctx, run.rift.portal, camX, camY, run.time);
      for (const t of run.telegraphs) drawTelegraph(ctx, t, camX, camY);
      for (const pk of run.pickups) {
        if (
          pk.x < camX - 8 ||
          pk.x > camX + width + 8 ||
          pk.y < camY - 8 ||
          pk.y > camY + height + 8
        )
          continue;
        drawPickup(ctx, pk, camX, camY);
      }

      const items = renderer.collectProps(camX, camY, width, height, state);
      propsVisible = items.length;
      for (const it of items) {
        const k = it.prop.kind;
        if (k === 'tree' || k === 'boulder' || k === 'ore') {
          renderer.drawShadow(ctx, it.prop.x, it.prop.y, k === 'tree' ? 1.1 : 0.8, camX, camY);
        }
      }
      for (const e of run.enemies) {
        if (!e.dying && run.quality > 0)
          renderer.drawShadow(ctx, e.rx, e.ry, e.radius / 6, camX, camY);
      }
      if (run.quality > 0) renderer.drawShadow(ctx, p.rx, p.ry, 0.9, camX, camY);

      const drawables: Drawable[] = items.map((item) => ({ y: item.prop.y, kind: 'prop', item }));
      for (const enemy of run.enemies) drawables.push({ y: enemy.ry, kind: 'enemy', enemy });
      for (const npc of run.npcs) drawables.push({ y: npc.y, kind: 'npc', npc });
      for (const ally of run.allies) drawables.push({ y: ally.ry, kind: 'ally', ally });
      if (run.pet) drawables.push({ y: run.pet.ry, kind: 'pet', pet: run.pet });
      drawables.push({ y: p.ry, kind: 'hero' });
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
      for (const pr of run.projectiles) drawProjectile(ctx, pr, camX, camY, p.rx, p.ry);
      for (const f of run.fx) drawFx(ctx, f, camX, camY);

      drawNight(
        ctx,
        width,
        height,
        nightFactor(run.time) * (1 - Math.min(0.6, run.mods.nightVision)),
      );
      drawWeather(ctx, run, width, height, false, run.quality);
      ambient.update(
        frameDt,
        state.current,
        nightFactor(run.time),
        camX,
        camY,
        width,
        height,
        run.quality,
      );
      ambient.draw(ctx, reduceFlash());
      if (app.data().settings.damageNumbers) drawFxTexts(ctx, run.fx, camX, camY);
      if (run.rift.active) {
        ctx.fillStyle = 'rgba(120,20,0,0.14)';
        ctx.fillRect(0, 0, width, height);
      }
      drawHud(view, run, camX, camY);
      minimap.draw(
        ctx,
        run,
        width,
        textScale() === 2 ? 74 : 56,
        height,
        app.touch.enabled,
        run.time,
      );
      app.touch.draw(ctx, width, height, view.zoom);
      if (tutorial && run.time < 22) drawTutorial(ctx, width, height, run.time);

      if (showDebug) {
        drawDebug(
          ctx,
          [
            `${stats.fps.toFixed(0)} FPS  ${stats.ms.toFixed(1)} ms`,
            `chunks ${renderer.cachedChunks} cached, ${renderer.bakedThisFrame} baked`,
            `bake ${renderer.lastBakeMs.toFixed(1)} ms (max ${renderer.maxBakeMs.toFixed(1)})`,
            `props ${propsVisible}  enemies ${run.enemies.length}  proj ${run.projectiles.length}`,
            `biome ${BIOMES[state.current].name}`,
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
