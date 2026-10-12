/** Pure economy formulas (BRIEF section 12). */
export interface RunSummary {
  timeSec: number;
  kills: number;
  bosses: number;
  miniBosses: number;
  /** Emeralds picked up during the run. */
  picked: number;
}

/** Emeralds earned by a run: time/5 + kills/4 + 80 per boss + 40 per mini-boss + picked, times Looting. */
export function runReward(run: RunSummary, lootingMult = 1): number {
  const base = run.timeSec / 5 + run.kills / 4 + 80 * run.bosses + 40 * run.miniBosses + run.picked;
  return Math.floor(base * lootingMult);
}

/** XP needed to go from `level` to `level + 1` (BRIEF section 15). */
export function xpToNext(level: number): number {
  return 10 + level * 8;
}
