/**
 * Per-run statistics (kills by type and biome, damage, ability casts, time per biome, ...) and the
 * merge of a finished run into the save's lifetime stats. The tracker is fed by a few hooks in
 * game.ts / combat.ts / npcs.ts / runScreen.ts; everything that decides what is stored is a pure
 * function over plain data so it can be tested without a running game.
 */
import { MAX_COUNT, MAX_SECONDS, type SaveData } from '../core/save';

/** Seconds a hero must spend in a biome in one run for it to count as visited. */
export const BIOME_VISIT_SEC = 8;

/** The slice of RunState the tracker reads (kept structural so tests can pass a plain object). */
export interface RunLike {
  time: number;
  kills: number;
  level: number;
  bossKills: number;
  miniKills: number;
  won: boolean;
  spawnEggs: number;
  rareSpawnEggs: number;
  emeraldsPicked: number;
  armorTier: number;
  swordTier: number;
  item: string | null;
  ability: { castCount: number };
  rift: { active: boolean };
  loadout: { hero: string };
  biome(): string;
}

/** Immutable summary of one finished run: the single input of missions and achievements. */
export interface RunRecord {
  hero: string;
  timeSec: number;
  kills: number;
  level: number;
  bosses: number;
  minis: number;
  won: boolean;
  damageDealt: number;
  damageTaken: number;
  abilityCasts: number;
  /** Emeralds picked up during the run (before the payout formula). */
  emeraldsPicked: number;
  /** Emeralds paid out at the end of the run (set by the results flow). */
  emeraldsEarned: number;
  eggsFound: number;
  rareEggsFound: number;
  itemsFound: number;
  itemsUsed: number;
  trades: number;
  rescues: number;
  rifts: number;
  armorTier: number;
  swordTier: number;
  killsByType: Record<string, number>;
  killsByBiome: Record<string, number>;
  timeByBiome: Record<string, number>;
  /** Wall-clock ms when the run ended (secrets such as the night owl read the local hour). */
  endedAt: number;
}

export class RunStats {
  damageDealt = 0;
  damageTaken = 0;
  itemsFound = 0;
  itemsUsed = 0;
  trades = 0;
  rescues = 0;
  rifts = 0;
  killsByType: Record<string, number> = {};
  killsByBiome: Record<string, number> = {};
  timeByBiome: Record<string, number> = {};
  private lastItem: string | null = null;
  private riftWas = false;

  /** A rewarded kill of enemy `id` while the hero was in `biome`. */
  kill(id: string, biome: string): void {
    this.killsByType[id] = (this.killsByType[id] ?? 0) + 1;
    this.killsByBiome[biome] = (this.killsByBiome[biome] ?? 0) + 1;
  }

  /** Once per simulation step: time per biome, rifts entered and items picked up. */
  tick(run: RunLike, dt: number): void {
    const b = run.biome();
    this.timeByBiome[b] = (this.timeByBiome[b] ?? 0) + dt;
    if (run.rift.active && !this.riftWas) this.rifts++;
    this.riftWas = run.rift.active;
    if (run.item !== null && run.item !== this.lastItem) this.itemsFound++;
    this.lastItem = run.item;
  }

  snapshot(run: RunLike, endedAt = Date.now()): RunRecord {
    return {
      hero: run.loadout.hero,
      timeSec: Math.max(0, run.time),
      kills: run.kills,
      level: run.level,
      bosses: run.bossKills,
      minis: run.miniKills,
      won: run.won,
      damageDealt: Math.round(this.damageDealt),
      damageTaken: Math.round(this.damageTaken),
      abilityCasts: run.ability.castCount,
      emeraldsPicked: run.emeraldsPicked,
      emeraldsEarned: 0,
      eggsFound: run.spawnEggs,
      rareEggsFound: run.rareSpawnEggs,
      itemsFound: this.itemsFound,
      itemsUsed: this.itemsUsed,
      trades: this.trades,
      rescues: this.rescues,
      rifts: this.rifts,
      armorTier: run.armorTier,
      swordTier: run.swordTier,
      killsByType: { ...this.killsByType },
      killsByBiome: { ...this.killsByBiome },
      timeByBiome: { ...this.timeByBiome },
      endedAt,
    };
  }
}

/** Distinct biomes the hero spent at least BIOME_VISIT_SEC in. */
export function biomesVisited(timeByBiome: Record<string, number>): string[] {
  return Object.entries(timeByBiome)
    .filter(([, s]) => s >= BIOME_VISIT_SEC)
    .map(([b]) => b);
}

const KEY_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
const MAX_COUNTERS = 480;

/** Add `n` (>= 0) to a lifetime counter: clamped to MAX_COUNT; invalid keys and a full table are ignored. */
export function bumpCounter(save: SaveData, key: string, n: number): void {
  if (!KEY_RE.test(key) || !Number.isFinite(n) || n <= 0) return;
  const c = save.stats.counters;
  if (!(key in c) && Object.keys(c).length >= MAX_COUNTERS) return;
  c[key] = Math.min(MAX_COUNT, Math.floor((c[key] ?? 0) + n));
}

/** Raise a "best ever" counter to `v` if it is higher. */
export function maxCounter(save: SaveData, key: string, v: number): void {
  if (!KEY_RE.test(key) || !Number.isFinite(v) || v <= 0) return;
  const c = save.stats.counters;
  if (!(key in c) && Object.keys(c).length >= MAX_COUNTERS) return;
  c[key] = Math.min(MAX_COUNT, Math.max(c[key] ?? 0, Math.floor(v)));
}

export interface MergeResult {
  newBestTime: boolean;
  newBestKills: boolean;
}

/**
 * Merge one finished run into `save.stats`, `save.stats.perHero` and the legacy `save.records`.
 * Never call this for debug runs. Counters stay below MAX_COUNT / MAX_SECONDS.
 */
export function mergeRunIntoSave(save: SaveData, rec: RunRecord): MergeResult {
  const s = save.stats;
  const cap = (v: number): number => Math.min(MAX_COUNT, Math.max(0, Math.floor(v)));
  const timeSec = Math.min(MAX_SECONDS, Math.max(0, rec.timeSec));
  const whole = Math.floor(timeSec);
  const result: MergeResult = {
    newBestTime: whole > Math.floor(Math.max(s.bestTimeSec, save.records.bestTimeSec)),
    newBestKills: rec.kills > Math.max(s.bestKills, save.records.bestKills),
  };
  s.runs = cap(s.runs + 1);
  if (rec.won) s.wins = cap(s.wins + 1);
  s.kills = cap(s.kills + rec.kills);
  s.playSeconds = Math.min(MAX_SECONDS, s.playSeconds + timeSec);
  s.bosses = cap(s.bosses + rec.bosses);
  s.minis = cap(s.minis + rec.minis);
  s.emeraldsEarned = cap(s.emeraldsEarned + rec.emeraldsEarned);
  s.bestTimeSec = Math.max(s.bestTimeSec, whole);
  s.bestKills = Math.max(s.bestKills, cap(rec.kills));
  const h = (s.perHero[rec.hero] ??= { runs: 0, bestTimeSec: 0, bestKills: 0 });
  h.runs = cap(h.runs + 1);
  h.bestTimeSec = Math.max(h.bestTimeSec, whole);
  h.bestKills = Math.max(h.bestKills, cap(rec.kills));

  const r = save.records;
  r.runs = cap(r.runs + 1);
  if (rec.won) r.wins = cap(r.wins + 1);
  r.bestTimeSec = Math.max(r.bestTimeSec, whole);
  r.bestKills = Math.max(r.bestKills, cap(rec.kills));

  for (const [id, n] of Object.entries(rec.killsByType)) bumpCounter(save, `kills.${id}`, n);
  for (const [b, sec] of Object.entries(rec.timeByBiome)) bumpCounter(save, `sec.${b}`, sec);
  bumpCounter(save, 'damageDealt', rec.damageDealt);
  bumpCounter(save, 'damageTaken', rec.damageTaken);
  bumpCounter(save, 'abilityCasts', rec.abilityCasts);
  bumpCounter(save, 'emeraldsPicked', rec.emeraldsPicked);
  bumpCounter(save, 'eggsFound', rec.eggsFound + rec.rareEggsFound);
  bumpCounter(save, 'itemsFound', rec.itemsFound);
  bumpCounter(save, 'itemsUsed', rec.itemsUsed);
  bumpCounter(save, 'trades', rec.trades);
  bumpCounter(save, 'rescues', rec.rescues);
  bumpCounter(save, 'rifts', rec.rifts);
  bumpCounter(save, 'levelUps', Math.max(0, rec.level - 1));
  if (rec.won) bumpCounter(save, `wins.${rec.hero}`, 1);
  maxCounter(save, 'best.level', rec.level);
  maxCounter(save, 'best.damage', rec.damageDealt);
  maxCounter(save, 'best.bosses', rec.bosses);
  maxCounter(save, 'best.biomes', biomesVisited(rec.timeByBiome).length);
  return result;
}

/** Overwrite a bookkeeping counter (e.g. the last value seen of a meta stat). */
export function setCounter(save: SaveData, key: string, v: number): void {
  if (!KEY_RE.test(key) || !Number.isFinite(v) || v < 0) return;
  const c = save.stats.counters;
  if (!(key in c) && Object.keys(c).length >= MAX_COUNTERS) return;
  c[key] = Math.min(MAX_COUNT, Math.floor(v));
}
