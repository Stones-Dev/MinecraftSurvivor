import { Atlas } from './core/atlas';
import { fitCanvas, type View } from './core/canvas';
import { KeyboardInput } from './core/input';
import { Loop } from './core/loop';
import { galleryScreen } from './ui/gallery';
import { Router } from './ui/router';
import { runScreen } from './ui/runScreen';
import { hubScreen, titleScreen } from './ui/screens';
import { WorldRenderer } from './world/renderer';
import { World } from './world/world';

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
  const router = new Router();
  const params = new URLSearchParams(window.location.search);
  const num = (key: string, fallback: number): number => {
    const v = Number(params.get(key));
    return params.has(key) && Number.isFinite(v) ? v : fallback;
  };
  const play = (): void =>
    router.replace(
      runScreen(atlas, input, {
        seed: num('seed', 1337),
        startTime: num('t', 0),
        debug: params.has('debug'),
      }),
    );
  const hub = () => hubScreen(atlas, play);
  if (params.has('gallery')) {
    router.push(galleryScreen(new WorldRenderer(new World(num('seed', 1337)))));
  } else if (params.has('run')) {
    router.push(hub());
    play();
  } else {
    router.push(titleScreen(router, hub));
  }
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Enter' || e.code === 'Space') router.top?.onClick?.(0, 0);
  });

  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect();
    router.top?.onClick?.(
      ((e.clientX - r.left) / r.width) * view.width,
      ((e.clientY - r.top) / r.height) * view.height,
    );
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
