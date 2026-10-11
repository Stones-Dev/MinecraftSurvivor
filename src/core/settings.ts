/** Settings stub; persisted through SaveStore in Phase 2. */
export interface Settings {
  musicVolume: number;
  sfxVolume: number;
  showFps: boolean;
}

export const defaultSettings: Settings = { musicVolume: 0.6, sfxVolume: 0.8, showFps: false };
