/**
 * Headless player bot for the balance simulator. It never touches the DOM: it drives RunState
 * through the same InputSource interface the keyboard uses.
 *
 * Policies:
 *  - `smart`: kites away from enemies/projectiles, collects gems, takes evolutions > weapon levels > tiers > passives.
 *  - `newbie`: reacts late, ignores far gems and picks random cards.
 */
import type { InputSource } from '../../src/core/input';
import { Rng } from '../../src/core/rng';
import { RunState } from '../../src/game';
import { applyCard, type Card, finishOffer } from '../../src/systems/levelup';
import { resolveItemChoice, useItem } from '../../src/systems/items';
import { newWeapon } from '../../src/weapons';
import type { WeaponId } from '../../src/weapons/types';

export type Policy = 'smart' | 'newbie';

export interface BotResult {
  seed: number;
  policy: Policy;
  start: WeaponId;
  /** Seconds survived (capped). */
  time: number;
  kills: number;
  level: number;
  bossKills: number;
  miniKills: number;
  won: boolean;
  dead: boolean;
  weapons: string[];
  picks: string[];
}

class BotInput implements InputSource {
  x = 0;
  y = 0;
  moveVector(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }
  pausePressed(): boolean {
    return false;
  }
  confirmPressed(): boolean {
    return false;
  }
  cancelPressed(): boolean {
    return false;
  }
  activePressed(): boolean {
    return false;
  }
  endStep(): void {}
}

const MELEE = new Set<string>(['sword', 'axe', 'shield', 'trident']);

function steer(run: RunState, bot: BotInput, policy: Policy, wander: number, melee: boolean): void {
  const p = run.player;
  const hpFrac = p.hp / Math.max(1, p.maxHp);
  const danger =
    policy === 'smart' ? (hpFrac < 0.35 ? 110 : melee ? 12 : 55) : hpFrac < 0.3 ? 70 : 28;
  let fx = 0;
  let fy = 0;
  let nearest: { x: number; y: number } | null = null;
  let nd = 220 * 220;
  for (const e of run.enemies) {
    if (e.dying) continue;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < nd) {
      nd = d2;
      nearest = e;
    }
    const reach = e.def.archetype === 'kamikaze' && policy === 'smart' ? 75 : danger;
    if (d2 > reach * reach || d2 < 0.01) continue;
    const d = Math.sqrt(d2);
    const w =
      ((reach - d) / reach) ** 1.5 * (e.boss ? 2 : e.def.archetype === 'kamikaze' ? 2.5 : 1.4);
    fx += (dx / d) * w;
    fy += (dy / d) * w;
  }
  if (policy === 'smart') {
    for (const prop of run.world.propsInRect(p.x - 60, p.y - 60, p.x + 60, p.y + 60, run.biome())) {
      if (prop.kind !== 'tnt_trap' && prop.kind !== 'magma') continue;
      const dx = p.x - prop.x;
      const dy = p.y - prop.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > 45) continue;
      fx += (dx / d) * ((45 - d) / 45) * 3;
      fy += (dy / d) * ((45 - d) / 45) * 3;
    }
    for (const pr of run.projectiles) {
      if (pr.friendly) continue;
      const dx = p.x - pr.x;
      const dy = p.y - pr.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 70 * 70 || d2 < 0.01) continue;
      const d = Math.sqrt(d2);
      // Sidestep perpendicular to the shot rather than backing along it.
      const sx = -pr.vy;
      const sy = pr.vx;
      const sl = Math.hypot(sx, sy) || 1;
      const side = sx * dx + sy * dy >= 0 ? 1 : -1;
      fx += ((side * sx) / sl) * (70 - d) * 0.03;
      fy += ((side * sy) / sl) * (70 - d) * 0.03;
    }
  }
  if (Math.hypot(fx, fy) < 0.3) {
    // Not in immediate danger: collect gems, then close in (melee) or drift.
    let best: { x: number; y: number } | null = null;
    let bd = (policy === 'smart' ? 150 : 50) ** 2;
    for (const pk of run.pickups) {
      const dx = pk.x - p.x;
      const dy = pk.y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bd) {
        bd = d2;
        best = pk;
      }
    }
    const target = best ?? (melee && nearest && hpFrac > 0.4 ? nearest : null);
    if (target) {
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      fx += dx / d;
      fy += dy / d;
    } else {
      fx += Math.cos(wander);
      fy += Math.sin(wander);
    }
  }
  const l = Math.hypot(fx, fy);
  bot.x = l > 0 ? fx / l : 0;
  bot.y = l > 0 ? fy / l : 0;
}

function score(card: Card, run: RunState): number {
  if (card.kind === 'evolve') return 100;
  if (card.kind === 'weapon') return card.isNew ? (run.weapons.length < 3 ? 60 : 30) : 50;
  if (card.kind === 'armor') return 40;
  if (card.kind === 'sword') return 35;
  if (card.kind === 'passive') return 20 + card.level;
  return 0;
}

function pickCard(run: RunState, offer: Card[], policy: Policy, rng: Rng): Card | undefined {
  if (policy === 'newbie') return offer[rng.int(offer.length)];
  let best: Card | undefined;
  let bs = -1;
  for (const c of offer) {
    const s = score(c, run) + rng.float() * 3;
    if (s > bs) {
      bs = s;
      best = c;
    }
  }
  return best;
}

export interface PlayOptions {
  seed: number;
  policy: Policy;
  start?: WeaponId;
  /** Seconds of game time to simulate at most. */
  maxTime?: number;
  /** Called once per simulated second (debugging). */
  trace?: (run: RunState) => void;
}

export function playRun(opts: PlayOptions): BotResult {
  const start = opts.start ?? 'sword';
  const policy = opts.policy;
  const run = new RunState(opts.seed, 0);
  run.weapons = [newWeapon(start)];
  const input = new BotInput();
  const rng = new Rng(opts.seed ^ 0x9e3779b9);
  const cap = opts.maxTime ?? 1200;
  const picks: string[] = [];
  let wander = rng.range(0, Math.PI * 2);
  let step = 0;
  const dt = 1 / 60;
  while (run.time < cap && run.status !== 'dead') {
    if (step % 6 === 0) {
      if (step % 180 === 0) wander += rng.range(-1, 1);
      steer(run, input, policy, wander, MELEE.has(start));
      if (policy === 'smart' && run.item && run.itemCd <= 0 && run.enemies.length > 12) {
        useItem(run, input.x, input.y);
      }
    }
    run.update(dt, input);
    step++;
    if (opts.trace && step % 60 === 0) opts.trace(run);
    // Resolve pending screens the way a player would.
    let guard = 0;
    while (run.offer && guard++ < 50) {
      const card = pickCard(run, run.offer, policy, rng);
      if (card) {
        applyCard(run, card);
        picks.push(`${card.kind}:${card.id}`);
      }
      finishOffer(run);
    }
    if (run.pendingItem) resolveItemChoice(run, policy === 'smart' ? false : rng.chance(0.5));
  }
  return {
    seed: opts.seed,
    policy,
    start,
    time: run.time,
    kills: run.kills,
    level: run.level,
    bossKills: run.bossKills,
    miniKills: run.miniKills,
    won: run.won,
    dead: run.status === 'dead',
    weapons: run.weapons.map((w) => `${w.id}${w.evolved ? '*' : ''}${w.level}`),
    picks,
  };
}
