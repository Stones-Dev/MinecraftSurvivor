import { describe, expect, it } from 'vitest';
import { RunState } from '../src/game';
import {
  CAGED_PILLARS,
  CAGE_HP,
  CRYSTAL_BLAST_DMG,
  CRYSTAL_STUN,
  DIVE_KNOCK,
  DIVE_WIDTH,
  DRAGON_BASE_HP,
  DRAGON_HP_MULT,
  DragonBrain,
  PHASE2_AT,
  PHASE3_AT,
  cageFactor,
  crystalHealRate,
  dragonFactor,
  dragonScale,
  diveLine,
  inFront,
  isGrounded,
  isMeleeOrigin,
  orbitOmega,
  orbitPoint,
  orbitTheta,
  phaseFor,
  CRUISE_SPEED,
} from '../src/entities/bossDragon';
import { Enemy } from '../src/entities/enemy';
import { Pickup } from '../src/entities/pickup';
import { damageEnemy, killEnemy } from '../src/systems/combat';
import { BOSS_SCHEDULE } from '../src/systems/director';
import {
  DEATH_ANIM,
  EGG_EMERALDS,
  END_ISLAND_PX,
  END_START,
  EXIT_PORTAL,
  PILLAR_RADIUS,
  VICTORY_EMERALDS,
  XP_SHOWER_CAP,
  debugEnterEnd,
  dragonStatus,
  enterEnd,
  leaveEnd,
  spawnEndPortal,
  xpShowerTotal,
} from '../src/systems/endDimension';
import { getMarkers } from '../src/systems/npcs';
import { applyRunToMissions, ensureMissions } from '../src/systems/missions';
import { defaultSave } from '../src/core/save';
import { evaluateAchievements } from '../src/systems/achievements';
import { finishRun } from '../src/systems/runEnd';
import { hpScale } from '../src/data/enemies';
import { makeEnemy } from '../src/systems/spawner';
import { endPillarCentre, END_ISLAND_TILES, TILE, tileAt } from '../src/world/terrain';
import { ScriptInput, endRun, buildRun, STRONG } from './helpers/endFight';
import { Zone } from './zone';

void Zone;
