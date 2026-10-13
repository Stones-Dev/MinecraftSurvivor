/** About / credits / legal (BRIEF sections 3.5 and 5). */
import type { App } from '../app';
import { drawPanel, drawText, wrap, wrapText } from './panel';
import { textWidth } from './font';
import type { Screen } from './router';
import { keyToNav, type NavEvent } from './hubModel';
import { Buttons, PadNav, drawTitle } from './widgets';

export const GAME_VERSION = '1.4.0';

export interface Section {
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

export const GENERAL: Section[] = [
  {
    head: 'MineSurvive',
    body: `Version ${GAME_VERSION}. A browser bullet-heaven in a blocky world: survive the night, gear up, collect every mob.`,
  },
  {
    head: 'Font',
    body: 'Tiny5, Copyright 2022-2024 The Tiny5 Project Authors, SIL Open Font License 1.1.',
  },
  {
    head: 'Cloud',
    body: 'Optional accounts use the Firebase JavaScript SDK (Apache-2.0), loaded only on deployments set up with Firebase. See CREDITS.md for the full list.',
  },
  {
    head: 'Audio',
    body: 'All music and sound effects are generated live with the Web Audio API. No audio files.',
  },
  {
    head: 'Art',
    body: 'Terrain, blocks, props, icons, the End, the Ender Dragon and the world structures are drawn by the game code. No AI-generated art is included.',
  },
  {
    head: 'Legal',
    body: 'Non-commercial fan project. Not affiliated with, endorsed or sponsored by Mojang or Microsoft. Minecraft is a trademark of Mojang Synergies AB.',
  },
];

/** Height of the section list's first row below the panel top, and the room left at the bottom. */
const TOP = 12;
const BOTTOM = 4;

/**
 * Split the credits sections over as many pages as the panel height needs (pure; a section is never split,
 * and every page holds at least one). A 320x180 view has room for about four sections, taller views fit more.
 */
export function paginateSections(
  sections: readonly Section[],
  boxW: number,
  boxH: number,
  measure: (s: string) => number = (t) => textWidth(t),
): Section[][] {
  const pages: Section[][] = [];
  let cur: Section[] = [];
  let y = TOP;
  for (const s of sections) {
    const rows = 1 + wrapText(s.body, boxW - 16, measure).length;
    const h = rows * 9;
    if (cur.length > 0 && y + h > boxH - BOTTOM) {
      pages.push(cur);
      cur = [];
      y = TOP;
    }
    cur.push(s);
    y += h + 4;
  }
  if (cur.length > 0) pages.push(cur);
  return pages;
}

export function aboutScreen(_app: App, onBack: () => void): Screen {
  const buttons = new Buttons();
  const pad = new PadNav();
  let page = 0;
  const ENTRY_H = 18;
  const perPage = (boxH: number): number => Math.max(3, Math.floor((boxH - 36) / ENTRY_H));
  const generalPages = (box: { w: number; h: number }): Section[][] =>
    paginateSections(GENERAL, box.w, box.h);
  const pageCount = (box: { w: number; h: number }): number =>
    generalPages(box).length + Math.ceil(SPRITE_CREDITS.length / perPage(box.h));
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
      const general = generalPages(box);
      const pages = pageCount(box);
      page = Math.min(page, pages - 1);
      drawTitle(
        view,
        'ABOUT',
        page < general.length
          ? `Credits and legal  (${page + 1}/${pages})`
          : `Sprite credits  (${page + 1}/${pages})`,
      );
      drawPanel(ctx, box);
      let y = box.y + TOP;
      if (page < general.length) {
        for (const s of general[page] ?? []) {
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
        const k = page - general.length;
        for (const c of SPRITE_CREDITS.slice(k * n, (k + 1) * n)) {
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
