import type { App } from '../app';
import { drawText } from './panel';
import type { Screen } from './router';

/** Daily / weekly missions and the daily reward (owned by the meta agent; stub until it lands). */
export function missionsScreen(app: App, back: () => void): Screen {
  return {
    update() {},
    render(view) {
      view.ctx.fillStyle = '#1b1b24';
      view.ctx.fillRect(0, 0, view.width, view.height);
      drawText(view.ctx, 'Missions', view.width / 2, view.height / 2, '#fff', 'center');
      void app;
    },
    onClick() {
      back();
    },
  };
}
