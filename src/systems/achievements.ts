/** Achievement evaluation: pure functions over a SaveData (and the run that just ended, if any). */
import {
  ACHIEVEMENT_BY_ID,
  ACHIEVEMENTS,
  type AchievementCategory,
  type AchievementDef,
} from '../data/achievements';
import type { SaveData } from '../core/save';
import { grantReward } from './missions';
import type { RunRecord } from './runStats';

const num = (v: number): number => (Number.isFinite(v) ? Math.max(0, v) : 0);

export interface AchievementProgress {
  def: AchievementDef;
  unlocked: boolean;
  at: number;
  /** Current value, capped at the goal. */
  cur: number;
}

export function isUnlocked(save: SaveData, id: string): boolean {
  return Object.prototype.hasOwnProperty.call(save.achievements, id) && ACHIEVEMENT_BY_ID.has(id);
}

/** Progress of every achievement (optionally one category) in catalogue order. */
export function achievementProgress(
  save: SaveData,
  cat?: AchievementCategory,
  rec: RunRecord | null = null,
): AchievementProgress[] {
  return ACHIEVEMENTS.filter((d) => !cat || d.cat === cat).map((def) => {
    const unlocked = isUnlocked(save, def.id);
    const raw = unlocked ? def.goal : num(def.value({ save, rec }));
    return {
      def,
      unlocked,
      at: unlocked ? (save.achievements[def.id]?.at ?? 0) : 0,
      cur: Math.min(def.goal, Math.floor(raw)),
    };
  });
}

/** Number of unlocked achievements known to this build, and the catalogue size. */
export function achievementCounts(save: SaveData): { unlocked: number; total: number } {
  return {
    unlocked: ACHIEVEMENTS.filter((d) => isUnlocked(save, d.id)).length,
    total: ACHIEVEMENTS.length,
  };
}

/** Achievements whose condition is met but that are not unlocked yet (0 once evaluated). */
export function achievementsUnlockable(save: SaveData, rec: RunRecord | null = null): number {
  return ACHIEVEMENTS.filter(
    (d) => !isUnlocked(save, d.id) && num(d.value({ save, rec })) >= d.goal,
  ).length;
}

/**
 * Unlock every achievement whose condition holds, grant its reward and return the new ones.
 * Idempotent: a second call with the same save returns nothing. Rewards that could unlock more
 * (the emerald hoard) are picked up by a second pass.
 */
export function evaluateAchievements(
  save: SaveData,
  now: number,
  rec: RunRecord | null = null,
): AchievementDef[] {
  const out: AchievementDef[] = [];
  for (let pass = 0; pass < 3; pass++) {
    let any = false;
    for (const def of ACHIEVEMENTS) {
      if (isUnlocked(save, def.id)) continue;
      if (num(def.value({ save, rec })) < def.goal) continue;
      save.achievements[def.id] = { at: Math.max(0, Math.floor(now)) };
      if (def.reward) grantReward(save, def.reward);
      out.push(def);
      any = true;
    }
    if (!any) break;
  }
  return out;
}
