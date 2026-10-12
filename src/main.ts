import type { App } from './app';
import { Atlas } from './core/atlas';
import { AudioEngine } from './core/audio';
import { fitCanvas, type View } from './core/canvas';
import { GamepadInput } from './core/gamepad';
import { KeyboardInput, MergedInput } from './core/input';
import { TouchInput } from './core/touch';
import { Loop } from './core/loop';
import { LocalSaveStore } from './core/save';
import { loadoutFromSave, type RunLoadout } from './systems/meta';
import type { WeaponId } from './weapons/types';
import { aboutScreen } from './ui/aboutScreen';
import { collectionScreen } from './ui/collectionScreen';
import { initFont } from './ui/font';
import { galleryScreen } from './ui/gallery';
import { runSetupScreen } from './ui/runSetupScreen';
import { settingsScreen } from './ui/settingsScreen';
import { spawnerScreen } from './ui/spawnerScreen';
import { upgradesScreen } from './ui/upgradesScreen';
import { Router } from './ui/router';
import { runScreen } from './ui/runScreen';
import { hubScreen, titleScreen } from './ui/screens';
import { WorldRenderer } from './world/renderer';
import { type BiomeId, isBiomeId } from './world/biomes';
import { World } from './world/world';

/** `?biome=<id>` debug start; unknown ids are ignored. */
function biomeParam(v: string | null): BiomeId | undefined {
  return v !== null && isBiomeId(v) ? v : undefined;
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

async function boot(): Promise<void> {
  const canvas = document.getElementById('game');
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing #game canvas');
  let view: View = fitCanvas(canvas);
  window.addEventListener('resize', () => {
    view = fitCanvas(canvas);
  });

  await initFont();
  const atlas = await Atlas.load(import.meta.env.BASE_URL);
  const keyboard = new KeyboardInput();
  const gamepad = new GamepadInput();
  const touch = new TouchInput();
  const input = new MergedInput([keyboard, gamepad, touch]);
  const audio = new AudioEngine();
  const router = new Router();
  const store = new LocalSaveStore(safeStorage());
  const params = new URLSearchParams(window.location.search);
  const num = (key: string, fallback: number): number => {
    const v = Number(params.get(key));
    return params.has(key) && Number.isFinite(v) ? v : fallback;
  };

  /** `?hero=alex&pet=cat&ally=wolf,horse&lv=3` overrides the equipped loadout (reviews and tests). */
  const debugLoadout = (): RunLoadout => {
    const base = loadoutFromSave(store.load());
    if (!params.has('debug')) return base; // debug-only: ownership and slot limits are not checked here
    const lv = num('lv', 3);
    const petId = params.get('pet');
    return {
      ...base,
      hero: params.get('hero') ?? base.hero,
      pet: petId ? { id: petId, level: lv } : base.pet,
      allies: params.has('ally')
        ? (params.get('ally') ?? '')
            .split(',')
            .filter(Boolean)
            .slice(0, 2)
            .map((id) => ({ id, level: lv }))
        : base.allies,
      upgrades: { ...(store.load().upgrades[params.get('hero') ?? base.hero] ?? {}) },
      kennel: Math.min(5, num('kennel', base.kennel)),
    };
  };

  const app: App = {
    atlas,
    audio,
    input,
    touch,
    router,
    store,
    params,
    pointer: { x: 0, y: 0 },
    data: () => store.load(),
    goHub: () => router.reset(hubScreen(app)),
    applySettings: () => {
      const s = store.load().settings;
      audio.musicVolume = s.musicVolume;
      audio.sfxVolume = s.sfxVolume;
      audio.muted = s.muted;
      keyboard.setBindings(s.controls);
      audio.refresh();
    },
    startRun: (loadout?: RunLoadout) =>
      router.reset(
        runScreen(app, {
          loadout: loadout ?? debugLoadout(),
          seed: num('seed', Date.now() % 1_000_000_000),
          startTime: params.has('debug') ? num('t', 0) : 0,
          debug: params.has('debug'),
          // Test hooks only work together with `debug`, and debug runs never touch the save.
          weapons: params.has('debug')
            ? (params.get('weapons')?.split(',') as WeaponId[] | undefined)
            : undefined,
          startXp: params.has('debug') ? num('xp', 0) : 0,
          hp: params.has('debug') ? num('hp', 0) : 0,
          crowd: params.has('debug') ? num('crowd', 0) : 0,
          portal: params.has('debug') && params.has('portal'),
          trader: params.has('debug') && params.has('trader'),
          villager: params.has('debug') && params.has('villager'),
          biome: params.has('debug') ? biomeParam(params.get('biome')) : undefined,
        }),
      ),
  };

  app.applySettings();
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    // Offline after the first load; failures (private mode, file://) are harmless. The `load` event has
    // usually fired already (the atlas is awaited above), so register right away in that case.
    const register = (): void => {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register);
  }
  if (params.has('gallery')) {
    router.push(galleryScreen(new WorldRenderer(new World(num('seed', 1337))), num('gallery', 0)));
  } else if (params.has('screen')) {
    // Review helper: `?screen=collection|spawner|upgrades|settings|setup` opens a hub screen directly.
    const back = (): void => app.goHub();
    router.push(hubScreen(app));
    const which = params.get('screen');
    if (which === 'collection') router.push(collectionScreen(app, back));
    else if (which === 'spawner') router.push(spawnerScreen(app, back));
    else if (which === 'upgrades') router.push(upgradesScreen(app, back));
    else if (which === 'settings') router.push(settingsScreen(app, back));
    else if (which === 'about') router.push(aboutScreen(app, back));
    else if (which === 'setup') router.push(runSetupScreen(app, (l) => app.startRun(l), back));
  } else if (params.has('run')) {
    app.startRun();
  } else {
    router.push(titleScreen(router, () => hubScreen(app)));
  }

  const unlock = (): void => {
    app.applySettings();
    audio.unlock();
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.repeat) return; // auto-repeat must not skip offers or dismiss results
    const before = router.top;
    before?.onKey?.(e.code);
    // A key that closed or opened a screen must not also act on the screen underneath (Esc un-pausing then re-pausing).
    if (router.top !== before) input.endStep();
  });
  const toArt = (e: PointerEvent): { x: number; y: number } => {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * view.width,
      y: ((e.clientY - r.top) / r.height) * view.height,
    };
  };
  canvas.addEventListener('pointerdown', (e) => {
    const { x, y } = toArt(e);
    router.top?.onClick?.(x, y);
  });
  touch.attach(canvas, toArt, () => view);
  canvas.addEventListener('pointermove', (e) => {
    const { x, y } = toArt(e);
    app.pointer.x = x;
    app.pointer.y = y;
    router.top?.onMove?.(x, y);
  });

  new Loop({
    update(dt) {
      gamepad.poll();
      router.update(dt);
      input.endStep();
    },
    render(alpha) {
      view.ctx.imageSmoothingEnabled = false;
      router.render(view, alpha);
    },
  }).start();
}

boot().catch((err) => {
  console.error(err);
  document.body.textContent = `MineSurvive failed to start: ${String(err)}`;
});
