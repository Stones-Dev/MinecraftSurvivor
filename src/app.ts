import type { Atlas } from './core/atlas';
import type { AudioEngine } from './core/audio';
import type { InputSource } from './core/input';
import type { TouchInput } from './core/touch';
import type { SaveData, SaveStore } from './core/save';
import type { AuthService } from './net/auth';
import type { CloudSaveStore } from './net/cloudSave';
import type { CloudLeaderboardService, LeaderboardView } from './net/leaderboard';
import type { RunLoadout } from './systems/meta';
import type { Router } from './ui/router';

/** Everything screens need; built once in main.ts. */
export interface App {
  atlas: Atlas;
  audio: AudioEngine;
  input: InputSource;
  /** Touch controls state (joystick/buttons), drawn over the run screen when enabled. */
  touch: TouchInput;
  router: Router;
  store: SaveStore;
  /** Same object as `store`, typed with the sync API (status, conflicts, flush). */
  cloud: CloudSaveStore;
  /** Accounts: Google / email / local profile / guest (cloud methods fail with 'not-configured' offline). */
  auth: AuthService;
  /** The leaderboard for the current session (cloud when signed in with a nickname, otherwise local). */
  leaderboard(): LeaderboardView & {
    submitRun?: CloudLeaderboardService['submitRun'];
    runStarted?: () => Promise<void>;
  };
  /** Open the sign-in / create-account / guest overlay (lazy-loaded DOM modal). */
  openAccount(tab?: 'signin' | 'create' | 'guest'): Promise<void>;
  params: URLSearchParams;
  /** Last pointer position in art pixels (for aimed items). */
  pointer: { x: number; y: number };
  data(): SaveData;
  goHub(): void;
  /** Start a run with the given loadout (defaults to the equipped one in the save). */
  startRun(loadout?: RunLoadout): void;
  /** Push audio volumes and key bindings from the save to the engines (call after Settings changes). */
  applySettings(): void;
}
