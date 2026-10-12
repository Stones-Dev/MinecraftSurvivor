/** Everything that happens to the save when a (non-debug) run ends, as one pure function. */
import type { SaveData } from '../core/save';
import type { AchievementDef } from '../data/achievements';
import type { MissionReward } from '../data/missions';
import { evaluateAchievements } from './achievements';
import { applyRunToMissions, ensureMissions, grantReward, type MissionChange } from './missions';
import { mergeRunIntoSave, type MergeResult, type RunRecord } from './runStats';

export interface RunOutcome extends MergeResult {
  /** Emeralds paid out for the run. */
  earned: number;
  missions: MissionChange[];
  unlocked: AchievementDef[];
  /** Completed missions of an expired set that were claimed automatically at rollover. */
  autoClaimed: MissionReward;
}

/**
 * Pay the run out and record it: wallet (emeralds and found eggs), lifetime stats and per-hero bests,
 * mission progress, achievements. `rec.emeraldsEarned` is set to `earned`. Never call for debug runs.
 */
export function finishRun(save: SaveData, rec: RunRecord, earned: number, now: number): RunOutcome {
  rec.emeraldsEarned = earned;
  const roll = ensureMissions(save, now);
  grantReward(save, {
    emeralds: earned,
    spawnEggs: rec.eggsFound,
    rareSpawnEggs: rec.rareEggsFound,
  });
  save.flags.tutorialDone = true;
  const merge = mergeRunIntoSave(save, rec);
  const missions = applyRunToMissions(save, rec, now);
  const unlocked = evaluateAchievements(save, now, rec);
  return { ...merge, earned, missions, unlocked, autoClaimed: roll.autoClaimed };
}
