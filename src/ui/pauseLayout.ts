/**
 * Layout of the pause menu (pure, tested from 213x120 to 640x360): title, the run so far, today's missions,
 * the music / SFX volume rows and the Resume / Settings / Quit buttons. Missions are what gives way when the
 * view is short: they lose rows, then disappear, before anything else is dropped.
 */

export interface PauseRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PauseLayout {
  panel: PauseRect;
  /** Baseline y of the title and of the one-line run summary (null when there is no room / no run). */
  titleY: number;
  infoY: number | null;
  /** Mission heading baseline (null = no missions section), the first row's top and how many rows. */
  missionsY: number | null;
  missionsTop: number;
  missionRows: number;
  /** Music and SFX rows: label x, bar (the click / focus target) and the percentage's right edge. */
  volume: { label: string; y: number; labelX: number; bar: PauseRect; pctRight: number }[];
  resume: PauseRect;
  settings: PauseRect;
  quit: PauseRect;
  /** Baseline of the "Quitting forfeits this run" note (null when it does not fit). */
  hintY: number | null;
}

const TITLE_H = 18;
const INFO_H = 12;
const MISSIONS_HEAD = 11;
const MISSION_ROW = 12;
const VOL_ROW = 12;
const BTN_H = 16;
const BTN_GAP = 4;
const HINT_H = 10;
const PAD_BOTTOM = 6;
const MARGIN = 2;

/**
 * `missions` is how many mission rows are available (0 without a run); at most 3 are shown on short views
 * (under 220 px), 5 otherwise, and fewer when the panel would not fit.
 */
export function pauseLayout(
  width: number,
  height: number,
  hasInfo: boolean,
  missions: number,
): PauseLayout {
  const w = Math.min(width - 12, 230);
  const cx = Math.floor(width / 2);
  const fixed = TITLE_H + 2 * VOL_ROW + 4 + 2 * BTN_H + BTN_GAP + PAD_BOTTOM;
  const room = height - 2 * MARGIN;
  let info = hasInfo;
  let rows = Math.min(missions, height < 220 ? 3 : 5);
  let hint = height >= 200;
  const total = (): number =>
    fixed +
    (info ? INFO_H : 0) +
    (rows > 0 ? MISSIONS_HEAD + rows * MISSION_ROW : 0) +
    (hint ? HINT_H : 0);
  while (total() > room && rows > 0) rows--;
  if (total() > room) hint = false;
  if (total() > room) info = false;
  const h = total();
  const panel = {
    x: cx - Math.floor(w / 2),
    y: Math.max(MARGIN, Math.floor((height - h) / 2)),
    w,
    h,
  };
  let y = panel.y + TITLE_H;
  const infoY = info ? y + 8 : null;
  if (info) y += INFO_H;
  const missionsY = rows > 0 ? y + 8 : null;
  if (rows > 0) y += MISSIONS_HEAD;
  const missionsTop = y;
  y += rows * MISSION_ROW;
  const labelX = panel.x + 8;
  const barX = panel.x + 44;
  const pctRight = panel.x + w - 8;
  const barW = Math.max(30, pctRight - 24 - barX);
  const volume = (['Music', 'SFX'] as const).map((label, i) => {
    const ry = y + 2 + i * VOL_ROW;
    return {
      label,
      y: ry,
      labelX,
      bar: { x: barX, y: ry + 1, w: barW, h: 10 },
      pctRight,
    };
  });
  y += 2 * VOL_ROW + 4;
  const bw = Math.min(74, Math.floor((w - 16 - BTN_GAP) / 2));
  const bx = cx - bw - Math.floor(BTN_GAP / 2);
  const resume = { x: bx, y, w: bw, h: BTN_H };
  const settings = { x: bx + bw + BTN_GAP, y, w: bw, h: BTN_H };
  const quit = { x: bx, y: y + BTN_H + BTN_GAP, w: bw * 2 + BTN_GAP, h: BTN_H };
  return {
    panel,
    titleY: panel.y + 13,
    infoY,
    missionsY,
    missionsTop,
    missionRows: rows,
    volume,
    resume,
    settings,
    quit,
    hintY: hint ? quit.y + BTN_H + 8 : null,
  };
}
