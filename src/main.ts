import { Atlas } from './core/atlas';
import { fitCanvas, type View } from './core/canvas';
import { KeyboardInput } from './core/input';
import { Loop } from './core/loop';
import { Router } from './ui/router';
import { hubScreen, titleScreen } from './ui/screens';

async function boot(): Promise<void> {
  const canvas = document.getElementById('game');
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing #game canvas');
  let view: View = fitCanvas(canvas);
  window.addEventListener('resize', () => {
    view = fitCanvas(canvas);
  });

  const atlas = await Atlas.load(import.meta.env.BASE_URL);
  const input = new KeyboardInput();
  const router = new Router();
  const hub = () => hubScreen(atlas);
  router.push(titleScreen(router, hub));

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
