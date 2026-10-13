/**
 * Tiered hit-stop (docs/DECISIONS.md, v1.3a). Everything is counted in fixed 60 Hz simulation steps, never in wall
 * clock time, so a run replays identically at any refresh rate and the balance simulator can use the same rules.
 *
 *  A. Victim hit-stun: a hurt enemy stands still (movement and animation) for 2 steps, 4 on a crit.
 *  B. Attacker recoil: the hero's melee swing frame holds for 2 steps when the swing lands a hit.
 *  C. Global micro-pause (the whole simulation skips steps, presentation only): 3 steps when the hero takes more
 *     than 15 HP in one hit, 5 steps for the killing blow on an elite or a boss, at most one per 150 ms.
 *     Never requested while "reduce flashing" is on (`globalEnabled` is false), and the balance simulator does
 *     not enable it, so only A and B reach the simulation.
 */

export const HITSTUN_STEPS = 2;
export const HITSTUN_CRIT_STEPS = 4;
export const SWING_HOLD_STEPS = 2;
/** A hero hit has to take more than this many HP to freeze the game. */
export const HERO_BIG_HIT_HP = 15;
export const HERO_HIT_PAUSE_STEPS = 3;
export const BIG_KILL_PAUSE_STEPS = 5;
/** 150 ms at 60 Hz, counted from the end of one global pause to the next request. */
export const GLOBAL_COOLDOWN_STEPS = 9;

/** Steps a victim stands still after a direct hit. */
export function hitStunSteps(crit: boolean): number {
  return crit ? HITSTUN_CRIT_STEPS : HITSTUN_STEPS;
}

export class HitStop {
  /** Whether global micro-pauses may fire. Off by default (simulation, tests); the run screen turns it on. */
  globalEnabled = false;
  /** Global pause steps still to skip. */
  globalLeft = 0;
  /** Steps until the next global pause may start. */
  cooldown = 0;
  /** Steps the hero's swing frame still holds. */
  swingHold = 0;

  /** Ask for a global pause of `steps`. Returns whether it was granted. */
  requestGlobal(steps: number): boolean {
    if (!this.globalEnabled || this.globalLeft > 0 || this.cooldown > 0 || steps <= 0) return false;
    this.globalLeft = steps;
    this.cooldown = steps + GLOBAL_COOLDOWN_STEPS;
    return true;
  }

  /** The hero took `dealt` HP from one hit. */
  heroHurt(dealt: number): boolean {
    return dealt > HERO_BIG_HIT_HP && this.requestGlobal(HERO_HIT_PAUSE_STEPS);
  }

  /** A killing blow landed; only elites and bosses freeze the game. */
  kill(big: boolean): boolean {
    return big && this.requestGlobal(BIG_KILL_PAUSE_STEPS);
  }

  /**
   * Call once per fixed step from the screen. Returns true when this step must be skipped (the global pause is
   * running). The cooldown counts every step, paused or not.
   */
  tickGlobal(): boolean {
    if (this.cooldown > 0) this.cooldown--;
    if (this.globalLeft > 0) {
      this.globalLeft--;
      return true;
    }
    return false;
  }

  /** The hero's swing landed a hit: hold its frame. */
  holdSwing(steps: number = SWING_HOLD_STEPS): void {
    this.swingHold = Math.max(this.swingHold, steps);
  }

  /** Call once per simulation step; true while the swing animation must not advance. */
  consumeSwingHold(): boolean {
    if (this.swingHold <= 0) return false;
    this.swingHold--;
    return true;
  }

  reset(): void {
    this.globalLeft = 0;
    this.cooldown = 0;
    this.swingHold = 0;
  }
}
