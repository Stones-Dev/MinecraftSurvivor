/** Registry of hero abilities and the cast/tick helpers used by RunState and the screens. */
import type { RunState } from '../game';
import { arrowRain } from './arrowRain';
import { frogLeap } from './frogLeap';
import { ironResolve } from './ironResolve';
import type { AbilityAim, AbilityDef } from './types';

export type { AbilityAim, AbilityDef } from './types';

const LIST: AbilityDef[] = [ironResolve, arrowRain, frogLeap];

export const ABILITIES: Record<string, AbilityDef> = Object.fromEntries(LIST.map((a) => [a.id, a]));
export const ABILITY_IDS = LIST.map((a) => a.id);

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
  if (!def.cast(run, aim)) return false;
  run.ability.cd = abilityCooldown(run, def);
  run.ability.castCount++;
  return true;
}
