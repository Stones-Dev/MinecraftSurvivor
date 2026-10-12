/** About / credits / legal (BRIEF sections 3.5 and 5). */
import type { App } from '../app';
import { drawPanel, drawText, wrap } from './panel';
import type { Screen } from './router';
import { Buttons, drawTitle } from './widgets';

export const GAME_VERSION = '1.0.0';

const SECTIONS: { head: string; body: string }[] = [
  {
    head: 'MineSurvive',
    body: `Version ${GAME_VERSION}. A browser bullet-heaven in a blocky world: survive the night, gear up, collect every mob.`,
  },
  {
    head: 'Art',
    body: 'Hero, mob, ally, animal and villager sprites are fan-made custom sheets supplied by the project owner; their authors are credited in CREDITS.md in the repository. Terrain, props and icons are drawn in code.',
  },
  {
    head: 'Font',
    body: 'Pixelify Sans, Copyright 2021 The Pixelify Sans Project Authors, SIL Open Font License 1.1.',
  },
  {
    head: 'Audio',
    body: 'All music and sound effects are generated live with the Web Audio API. No audio files.',
  },
  {
    head: 'Legal',
    body: 'Non-commercial fan project. Not affiliated with, endorsed or sponsored by Mojang or Microsoft. Minecraft is a trademark of Mojang Synergies AB.',
  },
];

export function aboutScreen(_app: App, onBack: () => void): Screen {
  const buttons = new Buttons();
  return {
    update() {},
    render(view) {
      const { ctx, width, height } = view;
      drawTitle(view, 'ABOUT');
      const box = { x: 12, y: 24, w: width - 24, h: height - 52 };
      drawPanel(ctx, box);
      let y = box.y + 12;
      for (const s of SECTIONS) {
        drawText(ctx, s.head, box.x + 8, y, '#ffd84a');
        y += 9;
        for (const line of wrap(ctx, s.body, box.w - 16)) {
          if (y > box.y + box.h - 4) break;
          drawText(ctx, line, box.x + 8, y, '#d8d8e0');
          y += 9;
        }
        y += 4;
      }
      buttons.begin();
      buttons.add({ x: Math.floor(width / 2) - 40, y: height - 22, w: 80, h: 16 }, 'Back', onBack);
      buttons.draw(view);
    },
    onMove(x, y) {
      buttons.move(x, y);
    },
    onClick(x, y) {
      buttons.click(x, y);
    },
    onKey(code) {
      if (code === 'Escape' || code === 'Enter' || code === 'Space') onBack();
    },
  };
}
