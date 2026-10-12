import type { RunState } from '../game';
import type { IconName } from '../ui/icons';

/** Where the player is aiming (world px) and the current move direction (unit vector or zero). */
export interface AbilityAim {
  x: number;
  y: number;
  moveX: number;
  moveY: number;
}

/**
 * A hero's active ability (Q / Shift). Data-driven like WeaponDef: each ability is a small module that
 * exports one of these and is registered in abilities/index.ts. `cast` returns false when it could not
 * be used (no cooldown is spent then).
 */
export interface AbilityDef {
  id: string;
  name: string;
  icon: IconName;
  /** Base cooldown in seconds (scaled by `mods.abilityCd`). */
  cooldown: number;
  blurb: string;
  cast(run: RunState, aim: AbilityAim): boolean;
}

/** Unit vector from the hero towards the aim point; falls back to the move direction, then to facing. */
export function aimDirection(run: RunState, aim: AbilityAim): { x: number; y: number } {
  const p = run.player;
  const dx = aim.x - p.x;
  const dy = aim.y - p.y;
  const d = Math.hypot(dx, dy);
  if (d > 6) return { x: dx / d, y: dy / d };
  const m = Math.hypot(aim.moveX, aim.moveY);
  if (m > 0.1) return { x: aim.moveX / m, y: aim.moveY / m };
  return { x: p.facing, y: 0 };
}
