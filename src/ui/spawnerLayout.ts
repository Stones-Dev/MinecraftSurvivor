/**
 * Pure layout of the Spawner screen for any art size. 320x180 is the smallest supported canvas, but the
 * screen also holds together down to ~213x120 (a 426x240 window at zoom 2): below 150 px of height it
 * switches to a compact layout (smaller cage, a side-by-side reveal card, a half-height tray, no hint line).
 * Nothing here touches the canvas, so the tests can assert that the parts never overlap.
 */
import type { Rect } from './panel';

export interface SpawnerLayout {
  compact: boolean;
  /** Header row under the title: currency pills (height 14, left) and the pity bar (height 16, right). */
  rowY: number;
  rowH: number;
  /** First y below the header row; modal content (reveal, tray, rates) starts here. */
  top: number;
  /** Last y modal content may use (just above the buttons). */
  bottom: number;
  buttons: { y: number; h: number; w: number; gap: number; x0: number };
  /** Baseline of the hint line (null when there is no room) and of an error message. */
  hintY: number | null;
  msgY: number;
  /** The cage's interior rect; the frame, bars and base are drawn around it, flames above it. */
  cage: { cx: number; x: number; y: number; w: number; h: number; flame: number };
  torchY: number;
  /** x1 reveal: portrait (feet position and max height) and the info card. */
  reveal: { cx: number; feetY: number; fit: number; box: Rect; lines: number[]; textW: number };
  rates: Rect;
  /** x10 tray: 5 x 2 cells. */
  tray: {
    x: number;
    y: number;
    cw: number;
    ch: number;
    cols: number;
    names: boolean;
    textY: number;
  };
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export function spawnerLayout(width: number, height: number): SpawnerLayout {
  const compact = height < 150;
  const rowY = 23;
  const rowH = 16;
  const top = rowY + rowH + 2;

  // Buttons: one row along the bottom edge.
  const bh = compact ? 14 : 16;
  const by = height - (compact ? 19 : 22);
  const gap = compact ? 3 : 6;
  const bw = Math.max(20, Math.min(78, Math.floor((width - 12 - 3 * gap) / 4)));
  const bx0 = Math.floor((width - (4 * bw + 3 * gap)) / 2);
  const bottom = by - 3;
  const cageBottom = by - 14; // leaves the hint / message line between the cage and the buttons
  const hintY = compact ? null : by - 5;
  const msgY = by - 4;
  const cx = Math.floor(width / 2);

  // Cage: as tall as the room allows (flames on top, 10 px of frame and base), centred in the room.
  const flame = compact ? 8 : 14;
  const room = Math.max(0, cageBottom - top);
  const ih = clamp(room - flame - 10, 24, 46);
  const slack = Math.max(0, room - flame - ih - 10);
  const frameTop = top + flame + Math.floor(slack / 2);
  const iw = compact ? 40 : 44;
  const cage = { cx, x: cx - Math.floor(iw / 2), y: frameTop + 2, w: iw, h: ih, flame };
  const torchY = cage.y + Math.floor(ih / 2) - 4;

  // Reveal.
  const textW = 188;
  let reveal: SpawnerLayout['reveal'];
  if (compact) {
    const bx = 64;
    const box: Rect = {
      x: bx,
      y: top,
      w: Math.max(60, width - 6 - bx),
      h: Math.max(40, bottom - top),
    };
    reveal = {
      cx: 6 + Math.floor((bx - 6 - 4) / 2),
      feetY: box.y + box.h - 4,
      fit: Math.min(52, box.h - 6),
      box,
      lines: [11, 20, 29, 38, 47],
      textW: box.w - 10,
    };
  } else {
    const boxH = 58;
    const region = bottom - top;
    const fit = clamp(region - boxH - 4, 28, 64);
    const groupH = fit + 4 + boxH;
    const groupTop = top + Math.max(0, Math.floor((region - groupH) / 2));
    const box: Rect = { x: cx - 100, y: groupTop + fit + 4, w: 200, h: boxH };
    reveal = {
      cx,
      feetY: groupTop + fit,
      fit,
      box,
      lines: [13, 23, 33, 44, 53],
      textW,
    };
  }

  // Rates panel.
  let rates: Rect;
  if (compact) {
    // Covers the header row too: five rows need the room.
    rates = { x: 6, y: rowY + 1, w: width - 12, h: bottom - rowY - 1 };
  } else {
    const h = Math.min(100, bottom - top);
    rates = { x: cx - 96, y: top + Math.floor((bottom - top - h) / 2), w: 192, h };
  }

  // Tray.
  const cw = Math.min(36, Math.floor((width - 8) / 5));
  const ch = compact ? 22 : 46;
  const trayH = 2 * (ch + 2);
  const trayRoom = bottom - top - 12; // the "Click to continue" line sits under the cells
  const ty = top + Math.max(0, Math.floor((trayRoom - trayH) / 2));
  const tray = {
    x: Math.floor((width - 5 * cw) / 2),
    y: ty,
    cw,
    ch,
    cols: 5,
    names: !compact,
    textY: ty + trayH + 8,
  };

  return {
    compact,
    rowY,
    rowH,
    top,
    bottom,
    buttons: { y: by, h: bh, w: bw, gap, x0: bx0 },
    hintY,
    msgY,
    cage,
    torchY,
    reveal,
    rates,
    tray,
  };
}
