import type { App } from './app';
import { Atlas } from './core/atlas';
import { AudioEngine } from './core/audio';
import { fitCanvas, type View } from './core/canvas';
import { KeyboardInput } from './core/input';
import { Loop } from './core/loop';
import { LocalSaveStore } from './core/save';
import type { WeaponId } from './weapons/types';
import { galleryScreen } from './ui/gallery';
import { Router } from './ui/router';
import { runScreen } from './ui/runScreen';
import { hubScreen, titleScreen } from './ui/screens';
import { WorldRenderer } from './world/renderer';
import { World } from './world/world';

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

  await document.fonts.load('8px "Pixelify Sans"').catch(() => undefined);
  const atlas = await Atlas.load(import.meta.env.BASE_URL);
  const input = new KeyboardInput();
  const audio = new AudioEngine();
  const router = new Router();
  const store = new LocalSaveStore(safeStorage());
  const params = new URLSearchParams(window.location.search);
  const num = (key: string, fallback: number): number => {
    const v = Number(params.get(key));
    return params.has(key) && Number.isFinite(v) ? v : fallback;
  };

  const app: App = {
    atlas,
    audio,
    input,
    router,
    store,
    params,
    pointer: { x: 0, y: 0 },
    data: () => store.load(),
    goHub: () => router.reset(hubScreen(atlas, () => app.startRun())),
    startRun: () =>
      router.reset(
        runScreen(app, {
          seed: num('seed', Date.now() % 1_000_000_000),
          startTime: num('t', 0),
          debug: params.has('debug'),
          weapons: params.get('weapons')?.split(',') as WeaponId[] | undefined,
          startXp: num('xp', 0),
          hp: num('hp', 0),
          portal: params.has('portal'),
          trader: params.has('trader'),
          villager: params.has('villager'),
        }),
      ),
  };

  if (params.has('gallery')) {
    router.push(galleryScreen(new WorldRenderer(new World(num('seed', 1337))), num('gallery', 0)));
  } else if (params.has('run')) {
    app.startRun();
  } else {
    router.push(titleScreen(router, () => hubScreen(atlas, () => app.startRun())));
  }

  const unlock = (): void => {
    const s = store.load().settings;
    audio.musicVolume = s.musicVolume;
    audio.sfxVolume = s.sfxVolume;
    audio.muted = s.muted;
    audio.unlock();
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    router.top?.onKey?.(e.code);
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
  canvas.addEventListener('pointermove', (e) => {
    const { x, y } = toArt(e);
    app.pointer.x = x;
    app.pointer.y = y;
    router.top?.onMove?.(x, y);
  });

  new Loop({
    update(dt) {
      router.update(dt);
      input.endStep();
    },
    render() {
      view.ctx.imageSmoothingEnabled = false;
      router.render(view);
    },
  }).start();
}

boot().catch((err) => {
  console.error(err);
  document.body.textContent = `MineSurvive failed to start: ${String(err)}`;
});
