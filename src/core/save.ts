import { COMPANION_BY_ID } from '../data/companions';
import { META_BY_ID } from '../data/metaUpgrades';

/**
 * Versioned save data behind a SaveStore interface (BRIEF section 2). `LocalSaveStore` is the
 * device copy; `CloudSaveStore` (src/net/cloudSave.ts) wraps it and syncs to the cloud.
 */
export const SAVE_VERSION = 2;

export type ColorblindMode = 'off' | 'protanopia' | 'deuteranopia' | 'tritanopia';
export type TouchControlsMode = 'auto' | 'on' | 'off';

export interface HeroStats {
  runs: number;
  bestTimeSec: number;
  bestKills: number;
}

export interface MissionProgress {
  id: string;
  progress: number;
  claimed: boolean;
}

export interface SaveData {
  saveVersion: number;
  createdAt: number;
  /** Wall-clock ms of the last local change (stamped by the store); drives cloud conflict checks. */
  lastModified: number;
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
  /** v1 records, kept for compatibility; `stats` is the v2 superset (never lower than these). */
  records: { bestTimeSec: number; bestKills: number; wins: number; runs: number };
  /** Player identity shown in the hub and leaderboards. `avatar` is a hero id. */
  profile: { id: string; name: string; avatar: string };
  stats: {
    kills: number;
    runs: number;
    wins: number;
    playSeconds: number;
    bosses: number;
    minis: number;
    eggsOpened: number;
    emeraldsEarned: number;
    bestTimeSec: number;
    bestKills: number;
    perHero: Record<string, HeroStats>;
    /**
     * Open-ended lifetime counters (`kills.<enemy>`, `sec.<biome>`, `damageDealt`, `trades`, ...) fed by
     * src/systems/runStats.ts and read by achievements; unknown keys are kept, values are clamped.
     */
    counters: Record<string, number>;
  };
  /** Achievement id -> unlock time (ms). */
  achievements: Record<string, { at: number }>;
  missions: {
    /** yyyy-mm-dd of the current daily set ('' = none rolled yet). */
    day: string;
    /** ISO week key (yyyy-Www) of the current weekly set. */
    weekKey: string;
    daily: MissionProgress[];
    weekly: MissionProgress[];
    rerollsLeft: number;
  };
  dailyReward: { lastClaimDay: string; streak: number };
  /**
   * Cloud bookkeeping: `uid` of the account this copy last synced with, `rev` the remote revision
   * it is based on, and `lastSyncedAt` the `lastModified` value that the cloud copy holds.
   */
  cloud: { uid: string | null; rev: number; lastSyncedAt: number };
  settings: {
    musicVolume: number;
    sfxVolume: number;
    muted: boolean;
    damageNumbers: boolean;
    screenShake: boolean;
    showFps: boolean;
    quality: 'auto' | 'high' | 'medium' | 'low';
    /** Camera leads slightly in the movement direction (default on; the game always did this before the setting existed). */
    cameraLead: boolean;
    accessibility: {
      colorblind: ColorblindMode;
      textScale: 1 | 2;
      reduceFlash: boolean;
      touchControls: TouchControlsMode;
    };
    /** Key remaps (action -> KeyboardEvent.code list); empty uses the defaults. */
    controls: Partial<
      Record<'up' | 'down' | 'left' | 'right' | 'pause' | 'item' | 'ability', string[]>
    >;
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

/** Random id for profiles and devices: crypto.randomUUID when available, never Math.random. */
export function makeId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  if (c && typeof c.getRandomValues === 'function') {
    const b = c.getRandomValues(new Uint8Array(16));
    return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  }
  idCounter = (idCounter + 1) >>> 0;
  const perf = typeof performance !== 'undefined' ? Math.floor(performance.now() * 1000) : 0;
  return `${Date.now().toString(36)}-${perf.toString(36)}-${idCounter.toString(36)}`;
}
let idCounter = 0;

export const DEFAULT_AVATAR = 'steve';
/** Upper bound for counters (emeralds, kills, ...): keeps tampered saves from overflowing math. */
export const MAX_COUNT = 1e12;
/** Upper bound for second-based stats (about 31 years). */
export const MAX_SECONDS = 1e9;

export function defaultSave(now = Date.now()): SaveData {
  const gachaSeed = (now ^ 0x5bd1e995) >>> 0;
  return {
    saveVersion: SAVE_VERSION,
    createdAt: now,
    lastModified: now,
    gachaSeed,
    pullCount: 0,
    pity: {},
    currencies: { emeralds: 500, spawnEggs: 0, rareSpawnEggs: 0 },
    owned: { steve: { level: 1, shards: 0, obtainedAt: now } },
    loadout: { hero: 'steve', pet: null, allies: [] },
    upgrades: {},
    records: { bestTimeSec: 0, bestKills: 0, wins: 0, runs: 0 },
    // Deterministic so defaultSave(t) is reproducible; local profiles get a random id when created.
    profile: { id: `p-${now.toString(36)}-${gachaSeed.toString(36)}`, name: '', avatar: 'steve' },
    stats: {
      kills: 0,
      runs: 0,
      wins: 0,
      playSeconds: 0,
      bosses: 0,
      minis: 0,
      eggsOpened: 0,
      emeraldsEarned: 0,
      bestTimeSec: 0,
      bestKills: 0,
      perHero: {},
      counters: {},
    },
    achievements: {},
    missions: { day: '', weekKey: '', daily: [], weekly: [], rerollsLeft: 0 },
    dailyReward: { lastClaimDay: '', streak: 0 },
    cloud: { uid: null, rev: 0, lastSyncedAt: 0 },
    settings: {
      musicVolume: 0.6,
      sfxVolume: 0.8,
      muted: false,
      damageNumbers: true,
      screenShake: true,
      showFps: false,
      quality: 'auto',
      cameraLead: true,
      accessibility: {
        colorblind: 'off',
        textScale: 1,
        reduceFlash: false,
        touchControls: 'auto',
      },
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
  // v2 adds profile, stats, achievements, missions, daily reward, cloud bookkeeping and
  // accessibility settings. `records` seeds `stats`; the rest starts from the defaults.
  1: (old) => {
    const rec = isRecord(old.records) ? old.records : {};
    const createdAt = typeof old.createdAt === 'number' ? old.createdAt : Date.now();
    const pick = (k: string): number => (typeof rec[k] === 'number' ? (rec[k] as number) : 0);
    const loadout = isRecord(old.loadout) ? old.loadout : {};
    const hero = typeof loadout.hero === 'string' ? loadout.hero : 'steve';
    const runs = pick('runs');
    return {
      ...old,
      lastModified: createdAt,
      profile: { ...defaultSave(createdAt).profile, avatar: hero },
      stats: {
        runs,
        wins: pick('wins'),
        bestTimeSec: pick('bestTimeSec'),
        bestKills: pick('bestKills'),
      },
      saveVersion: 2,
    };
  },
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
/** Ids used as object keys (heroes, achievements, missions): short, plain and prototype-safe. */
const ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
const safeId = (k: unknown): k is string =>
  typeof k === 'string' && ID_RE.test(k) && !UNSAFE_KEYS.has(k);
/** Keys of free-form maps: not empty, short, prototype-safe and valid Firestore field names. */
const badKey = (k: string): boolean =>
  !k || k.length > 64 || UNSAFE_KEYS.has(k) || /^__.*__$/.test(k);
const num = (v: unknown, fallback: number, min = -Infinity, max = Infinity): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min ? Math.min(max, v) : fallback;
const count = (v: unknown, fallback = 0, max = MAX_COUNT): number =>
  Math.floor(num(v, fallback, 0, max));
const secs = (v: unknown): number => num(v, 0, 0, MAX_SECONDS);
/** Wall-clock ms are capped at year 2100: a huge value would freeze `lastModified + 1` and stop cloud sync. */
const MAX_TIME_MS = 4_102_444_800_000;
const ts = (v: unknown, fallback: number): number => num(v, fallback, 0, MAX_TIME_MS);
/** Largest accepted save JSON text (a real save is a few KB; Firestore documents cap at 1 MiB). */
export const MAX_SAVE_JSON = 512 * 1024;
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
function oneOf<T extends string | number>(v: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}
/** Printable text without control characters, trimmed and capped. */
export function cleanText(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return [...v.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim()].slice(0, max).join('');
}
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEK_RE = /^\d{4}-W\d{2}$/;
const dayKey = (v: unknown): string => (typeof v === 'string' && DAY_RE.test(v) ? v : '');

function sanitizeMissions(v: unknown): MissionProgress[] {
  if (!Array.isArray(v)) return [];
  const out: MissionProgress[] = [];
  for (const m of v.slice(0, 12)) {
    if (!isRecord(m) || !safeId(m.id)) continue;
    out.push({ id: m.id, progress: count(m.progress), claimed: bool(m.claimed, false) });
  }
  return out;
}

/** Keep only well-typed fields of a merged save; everything else falls back to the defaults. */
function sanitize(data: Record<string, unknown>, d: SaveData): SaveData {
  const cur = isRecord(data.currencies) ? data.currencies : {};
  const rec = isRecord(data.records) ? data.records : {};
  const set = isRecord(data.settings) ? data.settings : {};
  const acc = isRecord(set.accessibility) ? set.accessibility : {};
  const flg = isRecord(data.flags) ? data.flags : {};
  const lo = isRecord(data.loadout) ? data.loadout : {};
  const prof = isRecord(data.profile) ? data.profile : {};
  const st = isRecord(data.stats) ? data.stats : {};
  const mis = isRecord(data.missions) ? data.missions : {};
  const dr = isRecord(data.dailyReward) ? data.dailyReward : {};
  const cl = isRecord(data.cloud) ? data.cloud : {};
  const owned: SaveData['owned'] = {};
  if (isRecord(data.owned)) {
    for (const [id, o] of Object.entries(data.owned).slice(0, 256)) {
      if (!isRecord(o) || badKey(id)) continue;
      owned[id] = {
        level: Math.min(5, Math.max(1, Math.floor(num(o.level, 1)))),
        shards: count(o.shards),
        obtainedAt: ts(o.obtainedAt, d.createdAt),
      };
    }
  }
  if (!owned['steve']) owned['steve'] = { level: 1, shards: 0, obtainedAt: d.createdAt };
  const pity: SaveData['pity'] = {};
  if (isRecord(data.pity)) {
    for (const [k, v] of Object.entries(data.pity).slice(0, 64))
      if (!badKey(k)) pity[k] = num(v, 0, 0, MAX_COUNT);
  }
  const upgrades: SaveData['upgrades'] = {};
  if (isRecord(data.upgrades)) {
    for (const [hero, ranks] of Object.entries(data.upgrades).slice(0, 64)) {
      if (!isRecord(ranks) || badKey(hero)) continue;
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
    for (const [action, keys] of Object.entries(set.controls).slice(0, 16)) {
      if (
        !badKey(action) &&
        Array.isArray(keys) &&
        keys.length <= 8 &&
        keys.every((k) => typeof k === 'string' && k.length <= 32)
      ) {
        (controls as Record<string, string[]>)[action] = keys as string[];
      }
    }
  }
  const records: SaveData['records'] = {
    bestTimeSec: secs(rec.bestTimeSec),
    bestKills: count(rec.bestKills),
    wins: count(rec.wins),
    runs: count(rec.runs),
  };
  const perHero: SaveData['stats']['perHero'] = {};
  if (isRecord(st.perHero)) {
    for (const [id, h] of Object.entries(st.perHero).slice(0, 128)) {
      if (!safeId(id) || !isRecord(h)) continue;
      perHero[id] = {
        runs: count(h.runs),
        bestTimeSec: secs(h.bestTimeSec),
        bestKills: count(h.bestKills),
      };
    }
  }
  const counters: SaveData['stats']['counters'] = {};
  if (isRecord(st.counters)) {
    for (const [k, v] of Object.entries(st.counters).slice(0, 512)) {
      if (safeId(k)) counters[k] = count(v);
    }
  }
  const achievements: SaveData['achievements'] = {};
  if (isRecord(data.achievements)) {
    for (const [id, a] of Object.entries(data.achievements).slice(0, 1000)) {
      if (safeId(id) && isRecord(a)) achievements[id] = { at: ts(a.at, 0) };
    }
  }
  const avatar = typeof prof.avatar === 'string' ? prof.avatar : '';
  const createdAt = ts(data.createdAt, d.createdAt);
  const profileId = cleanText(prof.id, 64);
  const uid = cleanText(cl.uid, 128);
  return {
    saveVersion: SAVE_VERSION,
    createdAt,
    lastModified: ts(data.lastModified, createdAt),
    gachaSeed: num(data.gachaSeed, d.gachaSeed),
    pullCount: count(data.pullCount),
    pity,
    currencies: {
      emeralds: count(cur.emeralds, d.currencies.emeralds, 1e9),
      spawnEggs: count(cur.spawnEggs, 0, 1e9),
      rareSpawnEggs: count(cur.rareSpawnEggs, 0, 1e9),
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
    records,
    profile: {
      id: profileId || d.profile.id,
      name: cleanText(prof.name, 16),
      avatar: COMPANION_BY_ID.get(avatar)?.kind === 'hero' ? avatar : DEFAULT_AVATAR,
    },
    stats: {
      kills: Math.max(count(st.kills), records.bestKills),
      // Older code paths still bump `records`: stats never report less than them.
      runs: Math.max(count(st.runs), records.runs),
      wins: Math.max(count(st.wins), records.wins),
      playSeconds: secs(st.playSeconds),
      bosses: count(st.bosses),
      minis: count(st.minis),
      eggsOpened: count(st.eggsOpened),
      emeraldsEarned: count(st.emeraldsEarned),
      bestTimeSec: Math.max(secs(st.bestTimeSec), records.bestTimeSec),
      bestKills: Math.max(count(st.bestKills), records.bestKills),
      perHero,
      counters,
    },
    achievements,
    missions: {
      day: dayKey(mis.day),
      weekKey: typeof mis.weekKey === 'string' && WEEK_RE.test(mis.weekKey) ? mis.weekKey : '',
      daily: sanitizeMissions(mis.daily),
      weekly: sanitizeMissions(mis.weekly),
      rerollsLeft: count(mis.rerollsLeft, 0, 99),
    },
    dailyReward: {
      lastClaimDay: dayKey(dr.lastClaimDay),
      streak: count(dr.streak, 0, 100000),
    },
    cloud: {
      uid: uid || null,
      rev: count(cl.rev),
      lastSyncedAt: ts(cl.lastSyncedAt, 0),
    },
    settings: {
      musicVolume: num(set.musicVolume, d.settings.musicVolume, 0, 1),
      sfxVolume: num(set.sfxVolume, d.settings.sfxVolume, 0, 1),
      muted: bool(set.muted, false),
      damageNumbers: bool(set.damageNumbers, true),
      screenShake: bool(set.screenShake, true),
      showFps: bool(set.showFps, false),
      quality: quality === 'high' || quality === 'medium' || quality === 'low' ? quality : 'auto',
      cameraLead: bool(set.cameraLead, d.settings.cameraLead),
      accessibility: {
        colorblind: oneOf(
          acc.colorblind,
          ['off', 'protanopia', 'deuteranopia', 'tritanopia'] as const,
          'off',
        ),
        textScale: oneOf(acc.textScale, [1, 2] as const, 1),
        reduceFlash: bool(acc.reduceFlash, false),
        touchControls: oneOf(acc.touchControls, ['auto', 'on', 'off'] as const, 'auto'),
      },
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

/** True when `raw` is a save from a newer build than this one (never overwrite it). */
export function isNewerSave(raw: unknown): boolean {
  return isRecord(raw) && typeof raw.saveVersion === 'number' && raw.saveVersion > SAVE_VERSION;
}

/** True when `raw` looks like a MineSurvive save (current or prototype), used to vet imports. */
function looksLikeSave(raw: unknown): boolean {
  if (!isRecord(raw)) return false;
  if (typeof raw.saveVersion === 'number' || isRecord(raw.currencies)) return true;
  // The v0 prototype save had no version: it is recognised by its two numeric counters.
  return typeof raw.emeralds === 'number' && typeof raw.bestTime === 'number';
}

/** Summary used by sync conflict prompts and to tell an untouched save from real progress. */
export interface SaveSummary {
  runs: number;
  emeralds: number;
  owned: number;
  pullCount: number;
  lastPlayed: number;
  name: string;
  /** runs + pulls + owned companions beyond Steve: 0 means a fresh, untouched save. */
  progress: number;
}

export function summarizeSave(s: SaveData): SaveSummary {
  const owned = Object.keys(s.owned).length;
  const runs = Math.max(s.stats.runs, s.records.runs);
  return {
    runs,
    emeralds: s.currencies.emeralds,
    owned,
    pullCount: s.pullCount,
    lastPlayed: s.lastModified,
    name: s.profile.name,
    progress: runs + s.pullCount + Math.max(0, owned - 1),
  };
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'> & Partial<Pick<Storage, 'removeItem'>>;

export class LocalSaveStore implements SaveStore {
  private cache: SaveData | null = null;
  /** Set when the stored blob was unusable and kept aside: never overwrite it silently. */
  private locked = false;
  /** True once a write failed (quota or blocked storage); the session continues in memory. */
  saveFailed = false;

  constructor(
    private readonly storage: StorageLike | null,
    readonly key = 'minesurvive.save',
  ) {}

  /** True while the stored save comes from a newer build (writes are held back). */
  get isLocked(): boolean {
    this.load();
    return this.locked;
  }

  /** True when this key holds a stored blob (usable or not). */
  hasStored(): boolean {
    try {
      return !!this.storage?.getItem(this.key);
    } catch {
      return false;
    }
  }

  /** The raw stored text (for backups), or null. */
  rawText(): string | null {
    try {
      return this.storage?.getItem(this.key) ?? null;
    } catch {
      return null;
    }
  }

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
      this.locked = isNewerSave(parsed);
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

  /** Replace the save wholesale (cloud adoption, account switch); clears a newer-build lock. */
  replace(data: SaveData): void {
    this.locked = false;
    this.save(data);
  }

  export(): string {
    return JSON.stringify(this.load(), null, 2);
  }

  import(json: string): SaveData {
    if (json.length > MAX_SAVE_JSON) throw new Error('Save file is too large');
    const raw: unknown = JSON.parse(json);
    const data = looksLikeSave(raw) ? tryMigrate(raw) : null;
    if (!data) throw new Error('Not a valid MineSurvive save');
    // Keep the save being replaced aside, like a reset does, so a wrong file can be recovered by hand.
    try {
      const current = this.rawText();
      if (current) this.storage?.setItem(`${this.key}.pre-import.bak`, current);
    } catch {
      // Nothing more we can do.
    }
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
