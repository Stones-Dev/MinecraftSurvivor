/** Auto-fire loop over the registry of weapon modules. */
import type { RunState } from '../game';
import { cooldownOf } from '../weapons/helpers';
import { WEAPONS, weaponLevel } from '../weapons';

export function updateWeapons(run: RunState, dt: number): void {
  if (run.player.dead) return;
  for (const w of run.weapons) {
    const def = WEAPONS[w.id];
    const s = weaponLevel(w.id, w.level);
    def.tick?.(run, w, s, dt);
    w.cd -= dt;
    if (w.cd > 0) continue;
    const fired = def.fire(run, w, s);
    // Without a target, poll again soon instead of burning the cooldown.
    w.cd = fired ? (def.cooldown ? def.cooldown(run, w, s) : cooldownOf(run, s)) : 0.1;
  }
}
