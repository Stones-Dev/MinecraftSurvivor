import type { Atlas } from './core/atlas';
import type { AudioEngine } from './core/audio';
import type { InputSource } from './core/input';
import type { SaveData, SaveStore } from './core/save';
import type { Router } from './ui/router';

/** Everything screens need; built once in main.ts. */
export interface App {
  atlas: Atlas;
  audio: AudioEngine;
  input: InputSource;
  router: Router;
  store: SaveStore;
  params: URLSearchParams;
  data(): SaveData;
  goHub(): void;
  startRun(): void;
}
