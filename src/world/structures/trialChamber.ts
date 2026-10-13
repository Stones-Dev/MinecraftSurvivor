/**
 * Trial Chamber (v1.4 part 2): an 18x18 chamber of tuff bricks with oxidised copper accents.
 *
 * Layout (x right, y down; symmetric, never mirrored):
 *
 *   - an apron strip at the north and south doors (y=0 and y=17, x=7..10);
 *   - a ring wall (k=1) with a 2-tile door at x=8..9 on the north and the south side; the door tiles hold
 *     copper bars, hidden until the trial starts and removed when it ends (systems/trialChamber.ts);
 *   - a 14x14 hall inside (x=2..15, y=2..15) of tuff with a cut-copper inlay in the middle (the arena) and
 *     corridors of the same copper to both doors; four oxidised copper pillars (4,4) (13,4) (4,13) (13,13);
 *   - the Trial Spawner on the vertex of the four middle tiles (9,9), its key spot just south of it;
 *   - the Vault (copper chest) in the north-east corner at (14,2);
 *   - spawn markers: six 'bogged' (skeleton family) and two 'breeze' (fast hoppers) around the arena.
 */
import { MAT } from '../blocks';
import { type StructureDef, Stamp } from './stamp';

export const TRIAL_SIZE = 18;
/** Hall interior in blueprint tiles (inclusive): the hero entering the middle of it starts the trial. */
export const TRIAL_HALL = { x0: 2, y0: 2, x1: 15, y1: 15 } as const;

export function buildTrialChamber(): ReturnType<Stamp['build']> {
  const n = TRIAL_SIZE;
  const s = new Stamp(n, n);
  s.floor(2, 2, 14, 14, MAT.TUFF);
  // The ring wall with copper accents every fifth block and in the corners.
  for (let i = 1; i <= n - 2; i++) {
    const accent = i % 5 === 0 || i === 1 || i === n - 2;
    const m = accent ? MAT.OXIDIZED_COPPER : MAT.TUFF_BRICKS;
    s.set(i, 1, m, true);
    s.set(i, n - 2, m, true);
    s.set(1, i, m, true);
    s.set(n - 2, i, m, true);
  }
  // Doors (floor tiles in the wall ring, plain tuff) and the apron in front of them.
  for (const x of [8, 9]) {
    s.set(x, 1, MAT.TUFF);
    s.set(x, n - 2, MAT.TUFF);
  }
  s.floor(7, 0, 4, 1, MAT.TUFF);
  s.floor(7, n - 1, 4, 1, MAT.TUFF);
  // The copper inlay: arena square and paths to the two doors.
  s.floor(6, 6, 6, 6, MAT.CUT_COPPER);
  s.floor(8, 2, 2, 4, MAT.CUT_COPPER);
  s.floor(8, 12, 2, 4, MAT.CUT_COPPER);
  for (const [x, y] of [
    [4, 4],
    [13, 4],
    [4, 13],
    [13, 13],
  ] as const)
    s.set(x, y, MAT.OXIDIZED_COPPER, true);
  // Props: the spawner on the middle vertex, the hidden key, the vault, the bars of both doors.
  s.prop('trial_spawner', 8, 8, { ox: 16, oy: 16 });
  s.prop('trial_key', 9, 10);
  s.prop('vault', 14, 2);
  for (const x of [8, 9]) {
    s.prop('copper_bars', x, 1);
    s.prop('copper_bars', x, n - 2);
  }
  // Spawn markers around the arena (all on open floor).
  for (const [x, y] of [
    [3, 6],
    [3, 11],
    [14, 6],
    [14, 11],
    [6, 3],
    [11, 3],
  ] as const)
    s.actor('trial_bogged', x, y);
  s.actor('trial_breeze', 6, 14).actor('trial_breeze', 11, 14);
  s.enter(8, 0).within(8, 4);
  return s.build();
}

export const TRIAL_CHAMBER: StructureDef = {
  id: 'trial_chamber',
  name: 'Trial Chamber',
  width: TRIAL_SIZE,
  height: TRIAL_SIZE,
  allowedBiomes: ['plains', 'dark_forest', 'forest'],
  minDistFromSpawn: 90,
  spacing: 48,
  chance: 0.9,
  nearChance: 0.95,
  priority: 3,
  clearance: 2,
  color: '#4fd6c0',
  build: buildTrialChamber,
};
