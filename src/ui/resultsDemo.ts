/** Review helper behind `?screen=results&debug`: a made-up finished run (saved, but not sent to the leaderboard). */
import type { App } from '../app';
import { RunState } from '../game';
import { resultsScreen } from './resultsScreen';
import type { Screen } from './router';

export function demoResults(app: App): Screen {
  const run = new RunState(1337, 0, undefined);
  run.time = 754;
  run.kills = 612;
  run.level = 17;
  run.bossKills = 1;
  run.miniKills = 2;
  run.emeraldsPicked = 143;
  run.spawnEggs = 2;
  run.rareSpawnEggs = 1;
  run.ability.castCount = 31;
  const st = run.stats;
  st.damageDealt = 48210;
  st.damageTaken = 1830;
  st.trades = 1;
  st.rescues = 1;
  st.killsByType = { zombie: 240, skeleton: 150, creeper: 38, spider: 90, raid_captain: 1 };
  st.timeByBiome = { plains: 400, forest: 200, desert: 120, nether: 34 };
  return resultsScreen(app, run, false, { submit: false });
}
