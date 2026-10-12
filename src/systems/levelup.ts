/** XP, level-ups and the 3-card offer (BRIEF section 7.1). */
import { MAX_WEAPON_LEVEL, type WeaponId, WEAPONS } from '../data/weapons';
import {
  MAX_PASSIVE_LEVEL,
  MAX_PASSIVES,
  MAX_WEAPONS,
  PASSIVES,
  PASSIVE_IDS,
  type PassiveId,
} from '../data/upgrades';
import type { RunState } from '../game';
import type { IconName } from '../ui/icons';
import { xpToNext } from './economy';

export interface Card {
  kind: 'weapon' | 'passive' | 'emeralds';
  id: string;
  /** Level after taking the card. */
  level: number;
  isNew: boolean;
  title: string;
  desc: string;
  icon: IconName;
}

export const SKIP_EMERALDS = 25;

export function buildOffer(run: RunState): Card[] {
  const pool: Card[] = [];
  const owned = new Map(run.weapons.map((w) => [w.id, w.level]));
  for (const id of Object.keys(WEAPONS) as WeaponId[]) {
    const def = WEAPONS[id];
    const level = owned.get(id);
    if (level === undefined) {
      if (run.weapons.length < MAX_WEAPONS) {
        pool.push({
          kind: 'weapon',
          id,
          level: 1,
          isNew: true,
          title: def.name,
          desc: def.levels[0]?.blurb ?? '',
          icon: def.icon,
        });
      }
    } else if (level < MAX_WEAPON_LEVEL) {
      pool.push({
        kind: 'weapon',
        id,
        level: level + 1,
        isNew: false,
        title: `${def.name} Lv ${level + 1}`,
        desc: def.levels[level]?.blurb ?? '',
        icon: def.icon,
      });
    }
  }
  for (const id of PASSIVE_IDS) {
    const def = PASSIVES[id];
    const level = run.passives.get(id);
    if (level === undefined) {
      if (run.passives.size < MAX_PASSIVES) {
        pool.push({
          kind: 'passive',
          id,
          level: 1,
          isNew: true,
          title: def.name,
          desc: def.blurb(1),
          icon: def.icon,
        });
      }
    } else if (level < MAX_PASSIVE_LEVEL) {
      pool.push({
        kind: 'passive',
        id,
        level: level + 1,
        isNew: false,
        title: `${def.name} Lv ${level + 1}`,
        desc: def.blurb(level + 1),
        icon: def.icon,
      });
    }
  }
  const offer: Card[] = [];
  const count = run.offerSize;
  while (offer.length < count && pool.length > 0) {
    const i = run.rng.levelup.int(pool.length);
    const [card] = pool.splice(i, 1);
    if (card) offer.push(card);
  }
  while (offer.length < count) {
    offer.push({
      kind: 'emeralds',
      id: 'emeralds',
      level: 0,
      isNew: false,
      title: 'Emeralds',
      desc: `+${SKIP_EMERALDS} emeralds.`,
      icon: 'emerald',
    });
  }
  return offer;
}

export function applyCard(run: RunState, card: Card): void {
  if (card.kind === 'weapon') {
    const w = run.weapons.find((x) => x.id === card.id);
    if (w) w.level = card.level;
    else run.weapons.push({ id: card.id as WeaponId, level: 1, cd: 0 });
  } else if (card.kind === 'passive') {
    run.passives.set(card.id as PassiveId, card.level);
  } else {
    run.emeraldsPicked += SKIP_EMERALDS;
  }
  run.recomputeStats();
}

/** Add XP and queue level-ups; the screen opens the offer when `run.offer` is set. */
export function gainXp(run: RunState, amount: number): void {
  run.xp += amount;
  while (run.xp >= xpToNext(run.level)) {
    run.xp -= xpToNext(run.level);
    run.level++;
    run.pendingLevelups++;
  }
  if (run.pendingLevelups > 0 && run.offer === null) run.offer = buildOffer(run);
}

/** Close the current offer after a pick/skip and open the next queued one, if any. */
export function finishOffer(run: RunState): void {
  run.pendingLevelups = Math.max(0, run.pendingLevelups - 1);
  run.offer = run.pendingLevelups > 0 ? buildOffer(run) : null;
}
