/** Registry of hero abilities and the cast/tick helpers used by RunState and the screens. */
import { heroById } from '../data/companions';
import type { RunState } from '../game';
import { MAX_ABILITY_RANK, RANK_COOLDOWN, RANK_POWER } from '../systems/meta';
import { anvilDrop } from './anvilDrop';
import { arrowRain } from './arrowRain';
import { blink } from './blink';
import { boneBarrage } from './boneBarrage';
import { chargedBlast } from './chargedBlast';
import { emeraldShower } from './emeraldShower';
import { frogLeap } from './frogLeap';
import { goldRush } from './goldRush';
import { ironResolve } from './ironResolve';
import { mirrorImages } from './mirrorImages';
import type { AbilityAim, AbilityDef } from './types';
import { witchBrew } from './witchBrew';

export type { AbilityAim, AbilityDef } from './types';

const LIST: AbilityDef[] = [
  ironResolve,
  arrowRain,
  frogLeap,
  boneBarrage,
  emeraldShower,
  anvilDrop,
  blink,
  witchBrew,
  mirrorImages,
  goldRush,
  chargedBlast,
];

export const ABILITIES: Record<string, AbilityDef> = Object.fromEntries(LIST.map((a) => [a.id, a]));
export const ABILITY_IDS = LIST.map((a) => a.id);

/** Seconds of the hero's cast animation when an ability does not set its own. */
const CAST_ANIM = 0.45;

export function abilityById(id: string | null | undefined): AbilityDef | undefined {
  return id ? ABILITIES[id] : undefined;
}

/** Seconds a cast of `def` keeps the ability on cooldown for this run. */
export function abilityCooldown(run: RunState, def: AbilityDef): number {
  return Math.max(2, def.cooldown * run.mods.abilityCd);
}

/** Try to cast the hero's ability; returns true when it fired. */
export function castAbility(run: RunState, aim: AbilityAim): boolean {
  const def = abilityById(run.abilityId);
  const p = run.player;
  if (!def || p.dead || run.ability.cd > 0) return false;
  p.castT = 0;
  if (!def.cast(run, aim)) return false;
  if (p.castT <= 0) p.castT = p.castDur = CAST_ANIM;
  run.ability.cd = abilityCooldown(run, def);
  run.ability.castCount++;
  return true;
}

export interface AbilityText {
  name: string;
  blurb: string;
  /** Rank 1..5 (from hero shards, see systems/meta abilityRank). */
  rank: number;
  /** Base cooldown after the rank bonus, seconds (before in-run modifiers). */
  cooldown: number;
  /** e.g. "Rank 3: +16% power, -8% cooldown" (rank 1: "Rank 1"). */
  bonus: string;
}

/** Name, blurb and rank bonus line of a hero's ability, for the hub screens. */
export function abilityText(heroId: string, rank: number): AbilityText {
  const def = abilityById(heroById(heroId).ability);
  const r = Math.max(1, Math.min(MAX_ABILITY_RANK, Math.floor(rank)));
  const extra = r - 1;
  const power = Math.round(RANK_POWER * extra * 100);
  const cd = Math.round(RANK_COOLDOWN * extra * 100);
  return {
    name: def?.name ?? '',
    blurb: def?.blurb ?? '',
    rank: r,
    cooldown: Math.round((def?.cooldown ?? 0) * (1 - RANK_COOLDOWN * extra) * 10) / 10,
    bonus: extra > 0 ? `Rank ${r}: +${power}% power, -${cd}% cooldown` : `Rank ${r}`,
  };
}
