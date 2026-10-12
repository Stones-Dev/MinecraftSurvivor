/** Versioned save data behind a SaveStore interface (BRIEF section 2); a cloud store can implement it later. */
export const SAVE_VERSION = 1;

export interface SaveData {
  saveVersion: number;
  createdAt: number;
  gachaSeed: number;
  pullCount: number;
  /** Pulls since the last Legendary, per banner id. */
  pity: Record<string, number>;
  currencies: { emeralds: number; spawnEggs: number; rareSpawnEggs: number };
  /** Companion/hero id -> progress. */
  owned: Record<string, { level: number; shards: number; obtainedAt: number }>;
  loadout: { hero: string; pet: string | null; allies: string[] };
  /** Permanent upgrades: per hero id, plus the account-wide pseudo-hero `account`. */
  upgrades: Record<string, Record<string, number>>;
  records: { bestTimeSec: number; bestKills: number; wins: number; runs: number };
  settings: {
    musicVolume: number;
    sfxVolume: number;
    muted: boolean;
    damageNumbers: boolean;
    screenShake: boolean;
    showFps: boolean;
    quality: 'auto' | 'high' | 'medium' | 'low';
  };
  flags: { tutorialDone: boolean };
}

export interface SaveStore {
  load(): SaveData;
  save(data: SaveData): void;
  /** JSON text for the Settings > Data export. */
  export(): string;
  /** Replace the save from JSON text (migrated); throws on invalid input. */
  import(json: string): SaveData;
  reset(): SaveData;
}

export function defaultSave(now = Date.now()): SaveData {
  return {
    saveVersion: SAVE_VERSION,
    createdAt: now,
    gachaSeed: (now ^ 0x5bd1e995) >>> 0,
    pullCount: 0,
    pity: {},
    currencies: { emeralds: 500, spawnEggs: 0, rareSpawnEggs: 0 },
    owned: { steve: { level: 1, shards: 0, obtainedAt: now } },
    loadout: { hero: 'steve', pet: null, allies: [] },
    upgrades: {},
    records: { bestTimeSec: 0, bestKills: 0, wins: 0, runs: 0 },
    settings: {
      musicVolume: 0.6,
      sfxVolume: 0.8,
      muted: false,
      damageNumbers: true,
      screenShake: true,
      showFps: false,
      quality: 'auto',
    },
    flags: { tutorialDone: false },
  };
}

type Migration = (old: Record<string, unknown>) => Record<string, unknown>;

/** `migrations[n]` upgrades a version-n save to version n + 1. */
export const migrations: Record<number, Migration> = {
  // v0 was the prototype save: flat `bestTime` / `bestKills` / `emeralds`.
  0: (old) => {
    const d = defaultSave(typeof old.createdAt === 'number' ? old.createdAt : Date.now());
    return {
      ...d,
      currencies: {
        ...d.currencies,
        emeralds: typeof old.emeralds === 'number' ? old.emeralds : 500,
      },
      records: {
        ...d.records,
        bestTimeSec: typeof old.bestTime === 'number' ? old.bestTime : 0,
        bestKills: typeof old.bestKills === 'number' ? old.bestKills : 0,
      },
      saveVersion: 1,
    };
  },
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Bring any stored value to the current schema; unknown/corrupt input yields a fresh save. */
export function migrate(raw: unknown): SaveData {
  if (!isRecord(raw)) return defaultSave();
  let data: Record<string, unknown> = raw;
  let version = typeof data.saveVersion === 'number' ? data.saveVersion : 0;
  if (version > SAVE_VERSION) return defaultSave(); // from a newer build: do not guess
  while (version < SAVE_VERSION) {
    const step = migrations[version];
    if (!step) return defaultSave();
    data = step(data);
    version = typeof data.saveVersion === 'number' ? data.saveVersion : version + 1;
  }
  // Fill any missing field from the defaults so older v1 saves keep working.
  const d = defaultSave(typeof data.createdAt === 'number' ? data.createdAt : Date.now());
  return {
    ...d,
    ...(data as Partial<SaveData>),
    currencies: { ...d.currencies, ...(isRecord(data.currencies) ? data.currencies : {}) },
    records: { ...d.records, ...(isRecord(data.records) ? data.records : {}) },
    settings: { ...d.settings, ...(isRecord(data.settings) ? data.settings : {}) },
    flags: { ...d.flags, ...(isRecord(data.flags) ? data.flags : {}) },
    loadout: { ...d.loadout, ...(isRecord(data.loadout) ? data.loadout : {}) },
    saveVersion: SAVE_VERSION,
  } as SaveData;
}

export class LocalSaveStore implements SaveStore {
  private cache: SaveData | null = null;

  constructor(
    private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null,
    private readonly key = 'minesurvive.save',
  ) {}

  load(): SaveData {
    if (this.cache) return this.cache;
    let parsed: unknown;
    try {
      const text = this.storage?.getItem(this.key);
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null; // blocked storage or corrupt JSON: start fresh
    }
    this.cache = migrate(parsed);
    return this.cache;
  }

  save(data: SaveData): void {
    this.cache = data;
    try {
      this.storage?.setItem(this.key, JSON.stringify(data));
    } catch {
      // Storage full or blocked: keep the in-memory copy so the session still works.
    }
  }

  export(): string {
    return JSON.stringify(this.load(), null, 2);
  }

  import(json: string): SaveData {
    const data = migrate(JSON.parse(json));
    this.save(data);
    return data;
  }

  reset(): SaveData {
    const data = defaultSave();
    this.save(data);
    return data;
  }
}
