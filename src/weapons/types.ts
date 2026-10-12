import type { PassiveId } from '../data/upgrades';
import type { RunState } from '../game';
import type { IconName } from '../ui/icons';

export type WeaponId =
  | 'sword'
  | 'bow'
  | 'crossbow'
  | 'trident'
  | 'harming'
  | 'poison'
  | 'tnt'
  | 'snowball'
  | 'fishing_rod'
  | 'lava_bucket'
  | 'blaze_rods'
  | 'axe'
  | 'shield'
  | 'lightning_rod';

export const MAX_WEAPON_LEVEL = 5;

export interface WeaponLevel {
  dmg: number;
  /** Seconds between uses. */
  cd: number;
  /** Radius / reach in art px (arcs, blasts, pools, orbits). 0 if unused. */
  area: number;
  /** Projectiles per volley, mines per drop, jumps, rods... */
  count: number;
  pierce: number;
  blurb: string;
}

export interface Evolution {
  id: string;
  name: string;
  /** The passive that must be owned (any level) once the weapon is level 5. */
  needs: PassiveId;
  blurb: string;
  icon: IconName;
}

/** Runtime state of an owned weapon. */
export interface WeaponState {
  id: WeaponId;
  level: number;
  cd: number;
  evolved: boolean;
  /** Scratch space for weapons that need memory (positions, timers). */
  data: Record<string, number>;
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  icon: IconName;
  /** Exactly 5 entries. */
  levels: readonly WeaponLevel[];
  evolution: Evolution;
  /**
   * Try to use the weapon. Return true if it fired (the cooldown starts), false if there was
   * nothing to do (it is polled again in 0.1 s). `w.evolved` selects the evolved behaviour.
   */
  fire(run: RunState, w: WeaponState, s: WeaponLevel): boolean;
  /** Cooldown after a successful use; defaults to `cooldownOf(run, s)` (level cooldown x run.mods.cd). */
  cooldown?(run: RunState, w: WeaponState, s: WeaponLevel): number;
  /** Optional every-step update for persistent weapons (orbiting rods, trails, shields). */
  tick?(run: RunState, w: WeaponState, s: WeaponLevel, dt: number): void;
}
