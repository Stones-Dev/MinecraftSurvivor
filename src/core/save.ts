import { COMPANION_BY_ID } from '../data/companions';
import { META_BY_ID } from '../data/metaUpgrades';

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
    /** Key remaps (action -> KeyboardEvent.code list); empty uses the defaults. */
    controls: Partial<Record<'up' | 'down' | 'left' | 'right' | 'pause' | 'item', string[]>>;
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
      controls: {},
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

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const num = (v: unknown, fallback: number, min = -Infinity): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min ? v : fallback;
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

/** Keep only well-typed fields of a merged v1 save; everything else falls back to the defaults. */
function sanitize(data: Record<string, unknown>, d: SaveData): SaveData {
  const cur = isRecord(data.currencies) ? data.currencies : {};
  const rec = isRecord(data.records) ? data.records : {};
  const set = isRecord(data.settings) ? data.settings : {};
  const flg = isRecord(data.flags) ? data.flags : {};
  const lo = isRecord(data.loadout) ? data.loadout : {};
  const owned: SaveData['owned'] = {};
  if (isRecord(data.owned)) {
    for (const [id, o] of Object.entries(data.owned)) {
      if (!isRecord(o) || UNSAFE_KEYS.has(id)) continue;
      owned[id] = {
        level: Math.min(5, Math.max(1, Math.floor(num(o.level, 1)))),
        shards: Math.max(0, Math.floor(num(o.shards, 0))),
        obtainedAt: num(o.obtainedAt, d.createdAt),
      };
    }
  }
  if (!owned['steve']) owned['steve'] = { level: 1, shards: 0, obtainedAt: d.createdAt };
  const pity: SaveData['pity'] = {};
  if (isRecord(data.pity)) {
    for (const [k, v] of Object.entries(data.pity)) if (!UNSAFE_KEYS.has(k)) pity[k] = num(v, 0, 0);
  }
  const upgrades: SaveData['upgrades'] = {};
  if (isRecord(data.upgrades)) {
    for (const [hero, ranks] of Object.entries(data.upgrades)) {
      if (!isRecord(ranks) || UNSAFE_KEYS.has(hero)) continue;
      const out: Record<string, number> = {};
      for (const [id, r] of Object.entries(ranks)) {
        const def = META_BY_ID.get(id);
        // Unknown upgrades are dropped; ranks are capped at the upgrade's maximum.
        if (def) out[id] = Math.min(def.max, Math.max(0, Math.floor(num(r, 0))));
      }
      upgrades[hero] = out;
    }
  }
  const quality = set.quality;
  const controls: SaveData['settings']['controls'] = {};
  if (isRecord(set.controls)) {
    for (const [action, keys] of Object.entries(set.controls)) {
      if (
        !UNSAFE_KEYS.has(action) &&
        Array.isArray(keys) &&
        keys.every((k) => typeof k === 'string')
      ) {
        (controls as Record<string, string[]>)[action] = keys as string[];
      }
    }
  }
  return {
    saveVersion: SAVE_VERSION,
    createdAt: num(data.createdAt, d.createdAt),
    gachaSeed: num(data.gachaSeed, d.gachaSeed),
    pullCount: Math.floor(num(data.pullCount, 0, 0)),
    pity,
    currencies: {
      emeralds: Math.floor(num(cur.emeralds, d.currencies.emeralds, 0)),
      spawnEggs: Math.floor(num(cur.spawnEggs, 0, 0)),
      rareSpawnEggs: Math.floor(num(cur.rareSpawnEggs, 0, 0)),
    },
    owned,
    loadout: {
      hero:
        typeof lo.hero === 'string' &&
        owned[lo.hero] &&
        COMPANION_BY_ID.get(lo.hero)?.kind === 'hero'
          ? lo.hero
          : 'steve',
      pet:
        typeof lo.pet === 'string' && owned[lo.pet] && COMPANION_BY_ID.get(lo.pet)?.kind === 'pet'
          ? lo.pet
          : null,
      allies: Array.isArray(lo.allies)
        ? [...new Set(lo.allies)].filter(
            (a): a is string =>
              typeof a === 'string' && !!owned[a] && COMPANION_BY_ID.get(a)?.kind === 'ally',
          )
        : [],
    },
    upgrades,
    records: {
      bestTimeSec: num(rec.bestTimeSec, 0, 0),
      bestKills: num(rec.bestKills, 0, 0),
      wins: Math.floor(num(rec.wins, 0, 0)),
      runs: Math.floor(num(rec.runs, 0, 0)),
    },
    settings: {
      musicVolume: Math.min(1, num(set.musicVolume, d.settings.musicVolume, 0)),
      sfxVolume: Math.min(1, num(set.sfxVolume, d.settings.sfxVolume, 0)),
      muted: bool(set.muted, false),
      damageNumbers: bool(set.damageNumbers, true),
      screenShake: bool(set.screenShake, true),
      showFps: bool(set.showFps, false),
      quality: quality === 'high' || quality === 'medium' || quality === 'low' ? quality : 'auto',
      controls,
    },
    flags: { tutorialDone: bool(flg.tutorialDone, false) },
  };
}

/** Bring any stored value to the current schema, or null when it cannot be used (corrupt or from a newer build). */
export function tryMigrate(raw: unknown): SaveData | null {
  if (!isRecord(raw)) return null;
  let data: Record<string, unknown> = raw;
  let version = typeof data.saveVersion === 'number' ? data.saveVersion : 0;
  if (version > SAVE_VERSION) return null; // from a newer build: do not guess
  while (version < SAVE_VERSION) {
    const step = migrations[version];
    if (!step) return null;
    data = step(data);
    version = typeof data.saveVersion === 'number' ? data.saveVersion : version + 1;
  }
  const d = defaultSave(typeof data.createdAt === 'number' ? data.createdAt : Date.now());
  return sanitize(data, d);
}

/** Like `tryMigrate` but falls back to a fresh save. */
export function migrate(raw: unknown): SaveData {
  return tryMigrate(raw) ?? defaultSave();
}

/** True when `raw` looks like a MineSurvive save (current or prototype), used to vet imports. */
function looksLikeSave(raw: unknown): boolean {
  if (!isRecord(raw)) return false;
  return ['saveVersion', 'currencies', 'owned', 'records', 'emeralds', 'bestTime'].some(
    (k) => k in raw,
  );
}

export class LocalSaveStore implements SaveStore {
  private cache: SaveData | null = null;
  /** Set when the stored blob was unusable and kept aside: never overwrite it silently. */
  private locked = false;
  /** True once a write failed (quota or blocked storage); the session continues in memory. */
  saveFailed = false;

  constructor(
    private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null,
    private readonly key = 'minesurvive.save',
  ) {}

  load(): SaveData {
    if (this.cache) return this.cache;
    let text: string | null | undefined;
    let parsed: unknown;
    try {
      text = this.storage?.getItem(this.key);
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = undefined; // blocked storage or corrupt JSON
    }
    const migrated = text ? tryMigrate(parsed) : null;
    if (text && !migrated) {
      // Corrupt or from a newer build: keep the original aside so a rollback does not wipe progress.
      this.backup(text);
      const newer =
        isRecord(parsed) &&
        typeof parsed.saveVersion === 'number' &&
        parsed.saveVersion > SAVE_VERSION;
      this.locked = newer;
    }
    this.cache = migrated ?? defaultSave();
    return this.cache;
  }

  private backup(text: string): void {
    try {
      if (!this.storage?.getItem(`${this.key}.bak`)) this.storage?.setItem(`${this.key}.bak`, text);
    } catch {
      // Nothing more we can do.
    }
  }

  save(data: SaveData): void {
    this.cache = data;
    if (this.locked) return; // a newer build's save stays untouched until the player resets or imports
    try {
      this.storage?.setItem(this.key, JSON.stringify(data));
      this.saveFailed = false;
    } catch {
      this.saveFailed = true; // storage full or blocked: keep the in-memory copy so the session works
    }
  }

  export(): string {
    return JSON.stringify(this.load(), null, 2);
  }

  import(json: string): SaveData {
    const raw: unknown = JSON.parse(json);
    const data = looksLikeSave(raw) ? tryMigrate(raw) : null;
    if (!data) throw new Error('Not a valid MineSurvive save');
    this.locked = false;
    this.save(data);
    return data;
  }

  reset(): SaveData {
    const data = defaultSave();
    this.locked = false;
    this.save(data);
    return data;
  }
}
