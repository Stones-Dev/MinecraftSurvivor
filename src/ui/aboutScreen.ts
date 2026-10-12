/** About / credits / legal (BRIEF sections 3.5 and 5). */
import type { App } from '../app';
import { drawPanel, drawText, wrap } from './panel';
import type { Screen } from './router';
import { keyToNav, type NavEvent } from './hubModel';
import { Buttons, PadNav, drawTitle } from './widgets';

export const GAME_VERSION = '1.1.0';

interface Section {
  head: string;
  body: string;
}

/** Sprite sheets by Askywalker on The Spriters Resource (Minecraft Customs); shown with their source links. */
export const SPRITE_CREDITS: { name: string; url: string }[] = [
  {
    name: 'Steve (Deltarune Battle-Style)',
    url: 'spriters-resource.com/custom_edited/minecraftcustoms/asset/144121/',
  },
  {
    name: 'Alex (Deltarune Battle-Style)',
    url: 'spriters-resource.com/custom_edited/minecraftcustoms/asset/156769/',
  },
  {
    name: 'Rana (Deltarune Battle-Style)',
    url: 'spriters-resource.com/custom_edited/minecraftcustoms/asset/156770/',
  },
  {
    name: 'Enemies (Deltarune Battle-Style)',
    url: 'spriters-resource.com/custom_edited/minecraftcustoms/asset/138730/',
  },
  {
    name: 'Allies (Deltarune Battle-Style)',
    url: 'spriters-resource.com/custom_edited/minecraftcustoms/asset/156864/',
  },
  {
    name: 'Animals (Deltarune Battle-Style)',
    url: 'spriters-resource.com/custom_edited/minecraftcustoms/asset/154783/',
  },
  {
    name: 'Villagers (Undertale Overworld-Style)',
    url: 'spriters-resource.com/custom_edited/minecraftcustoms/asset/156322/',
  },
];

const GENERAL: Section[] = [
  {
    head: 'MineSurvive',
    body: `Version ${GAME_VERSION}. A browser bullet-heaven in a blocky world: survive the night, gear up, collect every mob.`,
  },
  {
    head: 'Font',
    body: 'Tiny5, Copyright 2022-2024 The Tiny5 Project Authors, SIL Open Font License 1.1.',
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
  const pad = new PadNav();
  let page = 0;
  const ENTRY_H = 18;
  const perPage = (boxH: number): number => Math.max(3, Math.floor((boxH - 36) / ENTRY_H));
  const pageCount = (boxH: number): number => 1 + Math.ceil(SPRITE_CREDITS.length / perPage(boxH));
  /** Keyboard and pad: left / right (or Q / E) turn pages, OK presses the focused button or turns the page. */
  const navigate = (ev: NavEvent): void => {
    if (ev === 'back') return onBack();
    if (ev === 'left' || ev === 'prev') page = Math.max(0, page - 1);
    else if (ev === 'right' || ev === 'next') page++;
    else if (ev === 'ok' && !buttons.keyboardActive) page++;
    else buttons.handleNav(ev);
  };
  return {
    update(dt) {
      for (const ev of pad.poll(dt)) navigate(ev);
    },
    render(view) {
      const { ctx, width, height } = view;
      const box = { x: 12, y: 30, w: width - 24, h: height - 58 };
      const pages = pageCount(box.h);
      page = Math.min(page, pages - 1);
      drawTitle(
        view,
        'ABOUT',
        page === 0 ? `Credits and legal  (1/${pages})` : `Sprite credits  (${page + 1}/${pages})`,
      );
      drawPanel(ctx, box);
      let y = box.y + 12;
      if (page === 0) {
        for (const s of GENERAL) {
          drawText(ctx, s.head, box.x + 8, y, '#ffd84a');
          y += 9;
          for (const line of wrap(ctx, s.body, box.w - 16)) {
            if (y > box.y + box.h - 4) break;
            drawText(ctx, line, box.x + 8, y, '#d8d8e0');
            y += 9;
          }
          y += 4;
        }
      } else {
        drawText(ctx, 'All sprite sheets by Askywalker', box.x + 8, y, '#ffd84a');
        y += 9;
        for (const line of wrap(
          ctx,
          "The Spriters Resource, Minecraft Customs (Custom / Edited). Used with the author's permission and credit.",
          box.w - 16,
        )) {
          drawText(ctx, line, box.x + 8, y, '#d8d8e0');
          y += 9;
        }
        y += 3;
        const n = perPage(box.h);
        for (const c of SPRITE_CREDITS.slice((page - 1) * n, page * n)) {
          drawText(ctx, c.name, box.x + 8, y, '#ffffff');
          y += 8;
          drawText(ctx, c.url, box.x + 8, y, '#7de8e8');
          y += 10;
        }
      }
      buttons.begin();
      const by = height - 22;
      const cx = Math.floor(width / 2);
      buttons.add({ x: cx - 90, y: by, w: 84, h: 16 }, 'Next page', () => {
        page = (page + 1) % pages;
      });
      buttons.add({ x: cx + 6, y: by, w: 84, h: 16 }, 'Back', onBack);
      buttons.draw(view);
    },
    onMove(x, y) {
      buttons.move(x, y);
    },
    onClick(x, y) {
      buttons.click(x, y);
    },
    onKey(code) {
      const ev = keyToNav(code);
      if (ev) navigate(ev);
    },
  };
}
