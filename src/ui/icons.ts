/** Code-drawn 12x12 pixel-art icons with a shared 1 px dark outline (BRIEF section 13). */

const OUTLINE = '#1b1528';

/** Edge length of every icon grid, in art pixels. */
export const ICON_SIZE = 12;

const NAMES = [
  'sword',
  'bow',
  'tnt',
  'heart',
  'heart_half',
  'heart_empty',
  'emerald',
  'xp_orb',
  'boots',
  'shield',
  'magnet',
  'clock',
  'skull',
  'arrow',
  'egg',
  'potion',
  'book',
] as const;

/** Name of a code-drawn icon. */
export type IconName = (typeof NAMES)[number];

/** All icon names in declaration order. */
export const ICON_NAMES: readonly IconName[] = NAMES;

/** Char grids and palettes per icon; '.' is transparent and K is the dark outline. */
export const ICON_DATA: Record<
  IconName,
  { rows: readonly string[]; palette: Readonly<Record<string, string>> }
> = {
  sword: {
    rows: [
      '.........KK.',
      '........KgwK',
      '.......KgwK.',
      '......KgwK..',
      '.....KgwK...',
      '..KKKgwK....',
      '.KnngwK.....',
      '..KNKK......',
      '.KNK........',
      'KNK.........',
      '.K..........',
      '............',
    ],
    palette: {
      K: OUTLINE,
      g: '#b4bdc7',
      w: '#eef3f7',
      n: '#8b5a2b',
      N: '#5a3818',
    },
  },
  bow: {
    rows: [
      '.......KKK..',
      '......KnnwK.',
      '.....KnKKwK.',
      '....KnK.KwK.',
      '...KnKKKKwK.',
      '..KnTTTTTggK',
      '..KnKKKKKwK.',
      '...KnK..KwK.',
      '....KnK.KwK.',
      '.....KnKKwK.',
      '......KnnwK.',
      '.......KKK..',
    ],
    palette: {
      K: OUTLINE,
      n: '#8b5a2b',
      w: '#f2f2f2',
      T: '#d9b382',
      g: '#b4bdc7',
    },
  },
  tnt: {
    rows: [
      '.KKKKKKKKKK.',
      'KhhhhhhhhhhK',
      'KrrrrrrrrrRK',
      'KrrrrrrrrrRK',
      'KRRRRRwRRRwK',
      'KwRwRwRwRwwK',
      'KwRwRwRwRwwK',
      'KrrrrrrrrrRK',
      'KrrrrrrrrrRK',
      'KrrrrrrrrrRK',
      'KRRRRRRRRRRK',
      '.KKKKKKKKKK.',
    ],
    palette: {
      K: OUTLINE,
      h: '#e8554a',
      r: '#c8302a',
      R: '#7a1a1a',
      w: '#f4f4f4',
    },
  },
  heart: {
    rows: [
      '............',
      '..KKK..KKK..',
      '.KhhrKKrrRK.',
      'KhhrrrrrrRRK',
      'KhrrrrrrrrRK',
      '.KrrrrrrrRK.',
      '..KrrrrrRK..',
      '...KrrrRK...',
      '....KrRK....',
      '.....KK.....',
      '............',
      '............',
    ],
    palette: {
      K: OUTLINE,
      h: '#ff7a7a',
      r: '#d62e2e',
      R: '#8a1616',
    },
  },
  heart_half: {
    rows: [
      '............',
      '..KKK..KKK..',
      '.KhhrKKDDDK.',
      'KhhrrrDDDDDK',
      'KhrrrrDDDDDK',
      '.KrrrrDDDDK.',
      '..KrrrDDDK..',
      '...KrrDDK...',
      '....KrDK....',
      '.....KK.....',
      '............',
      '............',
    ],
    palette: {
      K: OUTLINE,
      h: '#ff7a7a',
      r: '#d62e2e',
      D: '#3a3346',
    },
  },
  heart_empty: {
    rows: [
      '............',
      '..KKK..KKK..',
      '.KqqQKKQQQK.',
      'KqqQQQQQQQQK',
      'KqQQQQQQQQQK',
      '.KQQQQQQQQK.',
      '..KQQQQQQK..',
      '...KQQQQK...',
      '....KQQK....',
      '.....KK.....',
      '............',
      '............',
    ],
    palette: {
      K: OUTLINE,
      q: '#5e5070',
      Q: '#3d3350',
    },
  },
  emerald: {
    rows: [
      '............',
      '...KKKKKK...',
      '..KffeeEEK..',
      '.KfwfeeeEEK.',
      '.KfeeeeeEEK.',
      '.KeeeeeeEEK.',
      '.KeeeeeEEEK.',
      '.KeeEEEEEEK.',
      '..KeeEEEEK..',
      '...KKKKKK...',
      '............',
      '............',
    ],
    palette: {
      K: OUTLINE,
      f: '#9bf5b0',
      e: '#2ecc71',
      E: '#14703a',
      w: '#f0fff4',
    },
  },
  xp_orb: {
    rows: [
      '.....KK.....',
      '...KKGGKK...',
      '..KGggggGK..',
      '.KGgwyyygGK.',
      '.KgyyccyygK.',
      'KGgyccccygGK',
      'KGgyccccygGK',
      '.KgyyccyygK.',
      '.KGgyyyygGK.',
      '..KGggggGK..',
      '...KKGGKK...',
      '.....KK.....',
    ],
    palette: {
      K: OUTLINE,
      G: '#3d8a2a',
      g: '#7fcf4a',
      w: '#ffffff',
      y: '#c8f25a',
      c: '#f4ffc2',
    },
  },
  boots: {
    rows: [
      '...KKKK.....',
      '..KLLLLK....',
      '..KlLLlK....',
      '..KlLLlK....',
      '..KllllK....',
      '..KllllK....',
      '..KlllllKKK.',
      '..KLLLLLLLlK',
      '..KllllllldK',
      '..KSSSSSSSSK',
      '...KKKKKKKK.',
      '............',
    ],
    palette: {
      K: OUTLINE,
      L: '#c48a52',
      l: '#a0683a',
      d: '#6b4423',
      S: '#6e7480',
    },
  },
  shield: {
    rows: [
      '...KKKKKK...',
      '..KWWWWWWK..',
      '.KWWWWWWWWK.',
      '.KWWWbbWWWK.',
      '.KgWbbbbWgK.',
      '.KgWWbbWWgK.',
      '.KgggWWgggK.',
      '..KggGGggK..',
      '...KgGGgK...',
      '....KGGK....',
      '.....KK.....',
      '............',
    ],
    palette: {
      K: OUTLINE,
      W: '#d5dae1',
      b: '#3b7fe0',
      g: '#9aa3af',
      G: '#5f6875',
    },
  },
  magnet: {
    rows: [
      '..KKK..KKK..',
      '.KgggKKgggK.',
      '.KGGGKKGGGK.',
      '.KhrRKKhrRK.',
      '.KhrRKKhrRK.',
      '.KhrRKKhrRK.',
      '.KhrRKKhrRK.',
      '.KrrrrrrrRK.',
      '..KrrrrrRK..',
      '...KKKKKK...',
      '............',
      '............',
    ],
    palette: {
      K: OUTLINE,
      g: '#c4ccd6',
      G: '#6e7986',
      h: '#ff7a7a',
      r: '#d62e2e',
      R: '#8a1616',
    },
  },
  clock: {
    rows: [
      '.....KK.....',
      '...KKOOKK...',
      '..KOOooOOK..',
      '.KOyyDoooOK.',
      '.KOyyDoooOK.',
      'KOoooDDDDoOK',
      'KOooooooooOK',
      '.KOooooooOK.',
      '.KOooooooOK.',
      '..KOOooOOK..',
      '...KKOOKK...',
      '.....KK.....',
    ],
    palette: {
      K: OUTLINE,
      O: '#9a6a12',
      o: '#f2c33a',
      y: '#ffe98a',
      D: '#3a2f45',
    },
  },
  skull: {
    rows: [
      '...KKKKKK...',
      '..KWWWWWWK..',
      '.KWWWWWWWgK.',
      '.KWWWWWWWgK.',
      '.KWDDWWDDgK.',
      '.KWDDWWDDgK.',
      '.KWWWWDWWgK.',
      '..KWWWWWgK..',
      '..KWDWDWgK..',
      '...KWWWgK...',
      '....KKKK....',
      '............',
    ],
    palette: {
      K: OUTLINE,
      W: '#f4f4f0',
      g: '#c9c9c4',
      D: '#2a2236',
    },
  },
  arrow: {
    rows: [
      '.........KK.',
      '........KggK',
      '........KGgK',
      '.......KTKK.',
      '......KTTK..',
      '.....KTTK...',
      '....KTTK....',
      '.K.KTTK.....',
      'KwKTTK......',
      'KwTTK.......',
      '.KwK........',
      '..K.........',
    ],
    palette: {
      K: OUTLINE,
      g: '#c4ccd6',
      G: '#6e7986',
      T: '#c9a06a',
      w: '#f4f4f4',
    },
  },
  egg: {
    rows: [
      '....KKKK....',
      '...KeeeeK...',
      '..KfeeeeEK..',
      '.KffDeeDEEK.',
      '.KffeeeeEEK.',
      '.KeDeeeDEEK.',
      '.KeeeDeeEEK.',
      '.KeeeeeeEEK.',
      '.KeeDeeDEEK.',
      '..KeeeeeEK..',
      '...KEEEEK...',
      '....KKKK....',
    ],
    palette: {
      K: OUTLINE,
      e: '#5fae3f',
      f: '#9ad978',
      E: '#2f6b2a',
      D: '#1d3b1c',
    },
  },
  potion: {
    rows: [
      '....KKKK....',
      '...KnnnnK...',
      '....KggK....',
      '....KggK....',
      '...KppppK...',
      '..KqppppPK..',
      '.KqqppppPPK.',
      '.KppppppPPK.',
      '.KppppppPPK.',
      '..KpppppPK..',
      '...KPPPPK...',
      '....KKKK....',
    ],
    palette: {
      K: OUTLINE,
      n: '#8b5a2b',
      g: '#c4ccd6',
      p: '#8e4fc4',
      q: '#c49cf0',
      P: '#5b2d8a',
    },
  },
  book: {
    rows: [
      '..KKKKKKKK..',
      '.KNNNNNNNNK.',
      '.KNnnnnnnNK.',
      '.KNnnqqnnNK.',
      '.KNnqpqnnNK.',
      '.KNnnqqnnNK.',
      '.KNnnnnnnNK.',
      '.KNnnnnnnNK.',
      '.KNwwwwwwWK.',
      '.KNNNNNNNNK.',
      '..KKKKKKKK..',
      '............',
    ],
    palette: {
      K: OUTLINE,
      N: '#5a3818',
      n: '#8b5a2b',
      q: '#c49cf0',
      p: '#8e4fc4',
      w: '#f3ead2',
      W: '#d8cba8',
    },
  },
};

const canvasCache = new Map<IconName, HTMLCanvasElement>();

/** Returns a cached 12x12 canvas with the icon painted one pixel at a time. */
export function iconCanvas(name: IconName): HTMLCanvasElement {
  const cached = canvasCache.get(name);
  if (cached) return cached;

  const { rows, palette } = ICON_DATA[name];
  const canvas = document.createElement('canvas');
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context is unavailable');

  ctx.imageSmoothingEnabled = false;
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const color = ch === '.' ? undefined : palette[ch];
      if (color === undefined) return;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    });
  });

  canvasCache.set(name, canvas);
  return canvas;
}

/** Draws an icon at rounded coordinates, scaled to whole pixels, with smoothing disabled. */
export function drawIcon(
  ctx: CanvasRenderingContext2D,
  name: IconName,
  x: number,
  y: number,
  scale = 1,
): void {
  const size = Math.round(ICON_SIZE * scale);
  if (size <= 0) return;
  const smoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(iconCanvas(name), Math.round(x), Math.round(y), size, size);
  ctx.imageSmoothingEnabled = smoothing;
}
