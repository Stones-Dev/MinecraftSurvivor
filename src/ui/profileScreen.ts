import type { App } from '../app';
import { drawText } from './panel';
import type { Screen } from './router';

/** Profile (avatar, nickname, stats, account) — owned by the accounts agent; stub until it lands. */
export function profileScreen(app: App, back: () => void): Screen {
  return {
    update() {},
    render(view) {
      view.ctx.fillStyle = '#1b1b24';
      view.ctx.fillRect(0, 0, view.width, view.height);
      drawText(view.ctx, 'Profile', view.width / 2, view.height / 2, '#fff', 'center');
      void app;
    },
    onClick() {
      back();
    },
  };
}
