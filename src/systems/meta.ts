/** Turns the hero, pet, allies and permanent upgrades picked in the hub into run modifiers (BRIEF sections 6, 11, 12). */
import { ACCOUNT_KEY, applyUpgradeMods } from '../data/metaUpgrades';
import { allyById, heroById, petById, type PetDef } from '../data/companions';
import type { Mods } from '../data/upgrades';
import type { SaveData } from '../core/save';

export interface LoadoutCompanion {
  id: string;
  level: number;
}

export interface RunLoadout {
  hero: string;
  pet: LoadoutCompanion | null;
  allies: LoadoutCompanion[];
  /** Per-hero upgrade ranks for the chosen hero. */
  upgrades: Record<string, number>;
  /** Account-wide Kennel rank (pet buffs +10% per rank). */
  kennel: number;
  /** Leadership: second ally slot. */
  leadership: boolean;
}

export function defaultLoadout(): RunLoadout {
  return { hero: 'steve', pet: null, allies: [], upgrades: {}, kennel: 0, leadership: false };
}

export function maxAllySlots(save: SaveData): number {
  return (save.upgrades[ACCOUNT_KEY]?.['leadership'] ?? 0) > 0 ? 2 : 1;
}

/** Snapshot the equipped loadout from the save, dropping anything not owned (or ally overflow). */
export function loadoutFromSave(save: SaveData): RunLoadout {
  const owned = (id: string): LoadoutCompanion | null => {
    const o = save.owned[id];
    return o ? { id, level: o.level } : null;
  };
  const hero = save.owned[save.loadout.hero] ? save.loadout.hero : 'steve';
  const petId = save.loadout.pet;
  const pet = petId && petById(petId) ? owned(petId) : null;
  const slots = maxAllySlots(save);
  const allies: LoadoutCompanion[] = [];
  for (const id of save.loadout.allies) {
    const c = allyById(id) ? owned(id) : null;
    if (c && allies.length < slots) allies.push(c);
  }
  return {
    hero,
    pet,
    allies,
    upgrades: { ...(save.upgrades[hero] ?? {}) },
    kennel: save.upgrades[ACCOUNT_KEY]?.['kennel'] ?? 0,
    leadership: slots > 1,
  };
}

/** Buff value of a pet at its level, with the Kennel bonus applied. */
export function petValue(pet: PetDef, level: number, kennel: number): number {
  const v = pet.values[Math.max(0, Math.min(4, level - 1))] ?? 0;
  return v * (1 + kennel * 0.1);
}

function applyPet(l: RunLoadout, m: Mods): void {
  const def = l.pet ? petById(l.pet.id) : undefined;
  if (!def || !l.pet) return;
  const v = petValue(def, l.pet.level, l.kennel);
  switch (def.effect) {
    case 'xp':
      m.xpMult += v / 100;
      break;
    case 'emeralds':
      m.lootMult *= 1 + v / 100;
      break;
    case 'max_hp':
      m.maxHpBonus += v;
      break;
    case 'armor':
      m.armor += v;
      break;
    case 'speed':
      m.speed *= 1 + v / 100;
      break;
    case 'cat':
      m.explosionResist += v / 100;
      m.fuseBonus += 0.5 + (l.pet.level - 1) * 0.25;
      break;
    case 'parrot':
      m.magnet *= 1 + v / 100;
      break;
    case 'bee':
      m.poisonChance += v / 100;
      break;
    case 'frog':
      m.slimeXp += v / 100;
      break;
    case 'fox':
      m.luck += v / 100;
      m.emeraldDrop += 0.02 + (l.pet.level - 1) * 0.01;
      break;
    case 'turtle':
      m.turtleShield += v;
      break;
    case 'axolotl':
      m.healWater += v / 100;
      m.regen += 0.1 * l.pet.level;
      break;
    case 'wolf_pup':
      m.dmg *= 1 + v / 100;
      break;
    case 'panda':
      m.cd *= 1 - v / 100;
      break;
    case 'strider':
      m.lavaImmune = true;
      m.lavaSpeed += v / 100;
      break;
  }
}

/** Add everything the loadout gives to `m` (called from RunState.recomputeStats after passives). */
export function applyLoadoutMods(l: RunLoadout, m: Mods): void {
  const hero = heroById(l.hero);
  m.dmg *= hero.dmg;
  m.speed *= hero.speed;
  if (hero.id === 'alex') {
    m.projSpeed *= 1.15;
    m.pierce += 1;
  } else if (hero.id === 'rana') {
    m.luck += 0.1;
    m.waterImmune = true;
  }
  applyUpgradeMods(l.upgrades, m);
  applyPet(l, m);
  if (l.allies.some((a) => allyById(a.id)?.role === 'horse')) m.speed *= 1.2;
}

/** Base max HP of a hero (before bonuses); Steve gets +10% from Builder's Grit. */
export function heroBaseHp(heroId: string): number {
  const hero = heroById(heroId);
  return Math.round(hero.hp * (hero.id === 'steve' ? 1.1 : 1));
}
