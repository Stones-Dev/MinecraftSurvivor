/**
 * Keeps missions and achievements in step with changes made outside a run (opening eggs, buying
 * upgrades, a new local day). The app calls `syncMeta` whenever the save changed; it is pure over
 * the save, so a save that was edited elsewhere (another tab, a cloud pull) is handled the same way.
 */
import type { SaveData } from '../core/save';
import { META_BY_ID } from '../data/metaUpgrades';
import type { AchievementDef } from '../data/achievements';
import type { MissionReward } from '../data/missions';
import { eggsOpened } from '../data/achievements';
import { evaluateAchievements } from './achievements';
import { applyMetaToMissions, ensureMissions, type MissionChange } from './missions';
import { setCounter } from './runStats';

export interface MetaSync {
  changed: boolean;
  unlocked: AchievementDef[];
  missions: MissionChange[];
  autoClaimed: MissionReward;
}

const totalRanks = (s: SaveData): number =>
  Object.values(s.upgrades).reduce(
    (a, ranks) =>
      a +
      Object.entries(ranks).reduce(
        (x, [id, r]) => x + (META_BY_ID.has(id) ? Math.max(0, r) : 0),
        0,
      ),
    0,
  );

/** Credit growth of a monotonic stat since the last sync (the first sync only records it). */
function delta(save: SaveData, key: string, now: number): number {
  const seen = save.stats.counters[key];
  if (seen === undefined) {
    setCounter(save, key, now);
    return 0;
  }
  if (now !== seen) setCounter(save, key, now);
  return Math.max(0, now - seen);
}

export function syncMeta(save: SaveData, now: number): MetaSync {
  const before = JSON.stringify([save.missions, save.achievements, save.currencies, save.stats]);
  const roll = ensureMissions(save, now);
  const eggs = delta(save, 'seen.eggs', eggsOpened(save));
  const ranks = delta(save, 'seen.ranks', totalRanks(save));
  const missions = applyMetaToMissions(save, { eggsOpened: eggs, upgradesBought: ranks }, now);
  const unlocked = evaluateAchievements(save, now, null);
  const after = JSON.stringify([save.missions, save.achievements, save.currencies, save.stats]);
  return { changed: before !== after, unlocked, missions, autoClaimed: roll.autoClaimed };
}
