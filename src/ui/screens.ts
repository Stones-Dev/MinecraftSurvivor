/** Title screen and the hub (main menu): live world backdrop, profile chip, resources and the menu buttons. */
import { cb } from '../core/accessibility';
import { abilityById, abilityText } from '../abilities';
import { t } from '../core/i18n';
import type { App } from '../app';
import { allyById, heroById, petById, RARITY_COLOR, type CompanionDef } from '../data/companions';
import { abilityRank, loadoutFromSave } from '../systems/meta';
import { accountBadge } from './accountInfo';
import { GAME_VERSION } from './aboutScreen';
import type { MissionReward } from '../data/missions';
import { claimDailyReward, dailyRewardState, missionsClaimable } from '../systems/missions';
import { pushToast } from './toast';
import { achievementsScreen } from './achievementsScreen';
import { collectionScreen } from './collectionScreen';
import { drawAvatar } from './avatar';
import {
  hubLayout,
  keyToNav,
  levelInfo,
  pickSplash,
  playerXp,
  rankOf,
  Troupe,
  layoutTier,
  type UiRect,
} from './hubModel';
import { drawIcon, type IconName } from './icons';
import { drawLogo, logoBlock, logoSize } from './logo';
import { sharedMenuScene } from './menuScene';
import { missionsScreen } from './missionsScreen';
import {
  clipText,
  drawBar,
  drawPanel,
  drawSlot,
  drawText,
  drawTextScaled,
  fitText,
  textWidth,
  UI,
} from './panel';
import { profileScreen } from './profileScreen';
import { rankingScreen } from './rankingScreen';
import { runSetupScreen } from './runSetupScreen';
import type { Router, Screen } from './router';
import { settingsScreen } from './settingsScreen';
import { spawnerScreen } from './spawnerScreen';
import { upgradesScreen } from './upgradesScreen';
import { aboutScreen } from './aboutScreen';
import { Buttons, drawActor, drawPill, PadNav } from './widgets';

export const SCREEN_NAMES = [
  'run-setup',
  'run',
  'pause',
  'levelup',
  'results',
  'collection',
  'gacha',
  'upgrades',
  'settings',
  'about',
] as const;

/** Placeholder for screens that arrive in later phases. */
export function emptyScreen(name: string, router: Router, hub: () => Screen): Screen {
  return {
    update() {},
    render(view) {
      view.ctx.fillStyle = '#1b1b24';
      view.ctx.fillRect(0, 0, view.width, view.height);
      drawText(
        view.ctx,
        `${name} — ${t('screen.empty')}`,
        view.width / 2,
        view.height / 2,
        '#fff',
        'center',
      );
    },
    onClick() {
      router.replace(hub());
    },
  };
}

/** `?menubiome=<id>` picks the biome behind the menus (review helper); the default is a calm plains meadow. */
function sceneFor(app: App): ReturnType<typeof sharedMenuScene> {
  const raw = app.params.get('menubiome');
  const biome = raw === null ? 'plains' : (raw as 'plains');
  return sharedMenuScene(app.atlas, biome);
}

const MODIFIER_KEYS = new Set([
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
  'CapsLock',
  'Tab',
]);

/** Darkens the top of the screen so the logo reads over any terrain. */
function topShade(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, h * 0.62);
  g.addColorStop(0, 'rgba(4,4,14,0.62)');
  g.addColorStop(1, 'rgba(4,4,14,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h * 0.62);
}

export function titleScreen(app: App, hub: () => Screen): Screen {
  const { router } = app;
  app.audio.setTheme('hub');
  const scene = sceneFor(app);
  const pad = new PadNav();
  const splash = pickSplash(Date.now() & 0x7fffffff);
  let time = 0;
  const go = (): void => router.replace(hub());
  return {
    update(dt) {
      time += dt;
      scene.update(dt);
      if (pad.poll(dt).some((e) => e === 'ok')) go();
    },
    render(view) {
      const { ctx, width: w, height: h } = view;
      const tier = layoutTier(w, h);
      scene.walkerCount = tier === 'compact' ? 3 : tier === 'normal' ? 4 : 6;
      scene.drift = 90;
      const frame = scene.render(ctx, w, h, Math.floor(w / 2), Math.floor(h * 0.74), {
        left: 5000,
        right: 5000,
        up: 10,
        down: 56,
      });
      scene.drawAtmosphere(ctx, w, h, frame.camX);
      scene.drawGrade(ctx, w, h, 0.9);
      topShade(ctx, w, h);

      // Logo, tagline and the splash.
      const block = logoBlock(w);
      const ly = Math.max(8, Math.floor(h * 0.09));
      const size = logoSize(block);
      const bottom = drawLogo(ctx, w / 2, ly, block, time);
      drawText(ctx, t('game.tagline'), Math.floor(w / 2), bottom + 11, '#f0e4d0', 'center');
      // Splash: yellow, tilted, pulsing, tucked into the logo's lower right corner.
      const fit = Math.min(1, (w * 0.38) / Math.max(1, textWidth(splash)));
      const pulse = (1 + Math.abs(Math.sin(time * 4.2)) * 0.1) * fit;
      const half = (textWidth(splash) * pulse * Math.cos(0.3)) / 2 + 5;
      const sx = Math.max(half, Math.min(w - half, w / 2 + size.w / 2 - 16));
      ctx.save();
      ctx.translate(Math.round(sx), Math.round(bottom - 4));
      ctx.rotate(-0.3);
      ctx.scale(pulse, pulse);
      drawText(ctx, splash, 0, 0, '#ffff55', 'center');
      ctx.restore();

      // Press to start.
      const big = tier === 'large';
      const msg = 'PRESS TO START';
      const sy = Math.floor(h * 0.86);
      const a = 0.55 + 0.45 * Math.abs(Math.sin(time * 2.4));
      ctx.globalAlpha = a;
      if (big) drawTextScaled(ctx, msg, Math.floor(w / 2), sy, UI.gold, 'center', 2);
      else drawText(ctx, msg, Math.floor(w / 2), sy, UI.gold, 'center');
      ctx.globalAlpha = 1;
      drawText(
        ctx,
        'Click, Enter or any button',
        Math.floor(w / 2),
        sy + (big ? 14 : 10),
        '#c8c0d8',
        'center',
      );
      drawText(ctx, `v${GAME_VERSION}`, 5, h - 5, '#9a96a8');
      drawText(ctx, 'Fan project. Not affiliated with Mojang.', w - 5, h - 5, '#9a96a8', 'right');
    },
    onClick() {
      go();
    },
    onKey(code) {
      if (!MODIFIER_KEYS.has(code)) go();
    },
  };
}

interface Tile {
  label: string;
  /** Shorter label used when the full one does not fit the button. */
  short: string;
  icon: IconName;
  tip: string;
  go: () => void;
}

/** "+120 emeralds, +1 egg" for a mission / daily reward. */
export function rewardText(r: MissionReward): string {
  const parts: string[] = [];
  if (r.emeralds) parts.push(`${r.emeralds} emeralds`);
  if (r.spawnEggs) parts.push(`${r.spawnEggs} egg${r.spawnEggs > 1 ? 's' : ''}`);
  if (r.rareSpawnEggs) parts.push(`${r.rareSpawnEggs} rare egg${r.rareSpawnEggs > 1 ? 's' : ''}`);
  return parts.join(', ') || 'a surprise';
}

function rectOf(r: UiRect): UiRect {
  return { x: r.x, y: r.y, w: r.w, h: r.h };
}

/** Main menu: the equipped hero idling at dusk plus the entry points to every meta screen. */
export function hubScreen(app: App): Screen {
  app.audio.setTheme('hub');
  const { router } = app;
  const buttons = new Buttons();
  const pad = new PadNav();
  const scene = sceneFor(app);
  const troupe = new Troupe((app.data().createdAt ^ 0x9e37) | 0, 34, 3);
  let time = 0;
  const back = (): void => router.pop();
  const claimDaily = (): void => {
    const data = app.data();
    const res = claimDailyReward(data, Date.now());
    if (!res.ok) return;
    app.store.save(data);
    app.audio.play('emerald');
    pushToast({ text: `Daily reward: ${rewardText(res.reward)}`, icon: 'gift', color: UI.gold });
  };
  const play = (): void => {
    const data = app.data();
    if (data.records.runs === 0 && !data.flags.tutorialDone) app.startRun();
    else router.push(runSetupScreen(app, (l) => app.startRun(l), back));
  };
  const tiles: Tile[] = [
    {
      label: 'COLLECTION',
      short: 'HEROES',
      icon: 'book',
      tip: 'Heroes, pets and allies you own.',
      go: () => router.push(collectionScreen(app, back)),
    },
    {
      label: 'SPAWNER',
      short: 'SPAWNER',
      icon: 'egg',
      tip: 'Spend Spawn Eggs to find new companions.',
      go: () => router.push(spawnerScreen(app, back)),
    },
    {
      label: 'UPGRADES',
      short: 'UPGRADES',
      icon: 'anvil',
      tip: 'Permanent boosts paid in Emeralds.',
      go: () => router.push(upgradesScreen(app, back)),
    },
    {
      label: 'MISSIONS',
      short: 'MISSIONS',
      icon: 'scroll',
      tip: 'Daily and weekly missions.',
      go: () => router.push(missionsScreen(app, back)),
    },
    {
      label: 'ACHIEVEMENTS',
      short: 'MEDALS',
      icon: 'trophy',
      tip: 'Achievement medals.',
      go: () => router.push(achievementsScreen(app, back)),
    },
    {
      label: 'RANKING',
      short: 'RANKING',
      icon: 'crown',
      tip: 'The leaderboard.',
      go: () => router.push(rankingScreen(app, back)),
    },
    {
      label: 'SETTINGS',
      short: 'SETTINGS',
      icon: 'gear',
      tip: 'Audio, graphics, controls and data.',
      go: () => router.push(settingsScreen(app, back)),
    },
    {
      label: 'ABOUT',
      short: 'ABOUT',
      icon: 'info',
      tip: 'Credits and legal.',
      go: () => router.push(aboutScreen(app, back)),
    },
  ];

  /** Equipped pet and allies in slot order. */
  const followers = (): CompanionDef[] => {
    const lo = loadoutFromSave(app.data());
    const out: CompanionDef[] = [];
    const pet = lo.pet ? petById(lo.pet.id) : undefined;
    if (pet) out.push(pet);
    for (const a of lo.allies) {
      const d = allyById(a.id);
      if (d) out.push(d);
    }
    return out;
  };

  const drawChip = (
    ctx: CanvasRenderingContext2D,
    r: UiRect,
    hover: boolean,
    focused: boolean,
  ): void => {
    const data = app.data();
    drawPanel(ctx, r, hover || focused, null, 'stone');
    const av = r.h - 6;
    drawAvatar(
      ctx,
      app.atlas,
      heroById(data.profile.avatar).id,
      { x: r.x + 3, y: r.y + 3, w: av, h: av },
      time,
      cb(RARITY_COLOR[heroById(data.profile.avatar).rarity]),
    );
    const info = levelInfo(playerXp(data.stats));
    const rank = rankOf(info.level);
    const user = app.auth.user();
    const name = user?.name || data.profile.name || 'Player';
    const tx = r.x + av + 8;
    const badgeIcon: IconName = app.auth.state === 'cloud' ? 'cloud' : 'user';
    drawIcon(ctx, badgeIcon, r.x + r.w - 14, r.y + 2);
    drawText(ctx, fitText(name, r.w - (tx - r.x) - 16), tx, r.y + 11, '#fff');
    drawText(ctx, `Lv ${info.level}`, tx, r.y + 21, UI.soft);
    drawText(ctx, rank.name, tx + textWidth(`Lv ${info.level}`) + 5, r.y + 21, rank.color);
    if (r.h >= 28)
      drawBar(
        ctx,
        { x: tx, y: r.y + r.h - 5, w: r.w - (tx - r.x) - 5, h: 3 },
        info.frac,
        '#7dff9a',
      );
  };

  const chipTip = (): string => {
    const data = app.data();
    const info = levelInfo(playerXp(data.stats));
    const badge = accountBadge(app.auth.user(), app.auth.state, app.auth.backend !== null);
    return `${badge.label}. Level ${info.level} ${rankOf(info.level).name}. Open profile.`;
  };

  const drawCard = (
    ctx: CanvasRenderingContext2D,
    r: UiRect,
    tier: ReturnType<typeof layoutTier>,
  ): void => {
    const data = app.data();
    const lo = loadoutFromSave(data);
    const hero = heroById(lo.hero);
    const ab = abilityById(hero.ability);
    const rank = abilityRank(lo.heroShards ?? 0);
    const txt = abilityText(hero.id, rank);
    drawPanel(ctx, r, false, cb(RARITY_COLOR[hero.rarity]));
    const x = r.x + 5;
    const w = r.w - 10;
    drawSlot(ctx, { x: r.x + 4, y: r.y + 4, w: 14, h: 14 });
    if (ab) drawIcon(ctx, ab.icon, r.x + 5, r.y + 5);
    const cd = `${txt.cooldown}s`;
    drawText(ctx, cd, r.x + r.w - 5, r.y + 14, UI.dim, 'right');
    drawText(
      ctx,
      fitText(txt.name || 'Ability', w - 24 - textWidth(cd)),
      r.x + 22,
      r.y + 14,
      UI.gold,
    );
    const descLines = tier === 'compact' ? 2 : tier === 'normal' ? 3 : 4;
    let y = r.y + 25;
    for (const l of clipText(txt.blurb, w, descLines)) {
      drawText(ctx, l, x, y, UI.soft);
      y += 9;
    }
    y += 2;
    drawText(ctx, fitText(`Passive: ${hero.passiveName}`, w), x, y, UI.green);
    if (tier !== 'compact') {
      y += 9;
      const room = Math.floor((r.y + r.h - 4 - y) / 9) + 1;
      for (const l of clipText(
        hero.passive,
        w,
        Math.max(0, Math.min(room, tier === 'normal' ? 2 : 4)),
      )) {
        drawText(ctx, l, x, y, UI.dim);
        y += 9;
      }
    }
  };

  return {
    update(dt) {
      time += dt;
      scene.update(dt);
      troupe.setFollowers(followers().length);
      troupe.update(dt);
      for (const ev of pad.poll(dt)) {
        if (ev === 'ok' && !buttons.keyboardActive) play();
        else buttons.handleNav(ev);
      }
    },
    render(view) {
      const { ctx, width: w, height: h } = view;
      const data = app.data();
      const L = hubLayout(w, h);
      scene.walkerCount = 0;
      scene.drift = 0;
      const frame = scene.render(ctx, w, h, L.stage.x, L.stage.y, {
        left: L.stage.halfW + 12,
        right: L.stage.halfW + 12,
        up: 92,
        down: 26,
      });
      scene.drawAtmosphere(ctx, w, h, frame.camX);
      scene.drawGrade(ctx, w, h, 0.9);
      // Darken the button side a little so the menu stays readable over bright terrain.
      const shade = ctx.createLinearGradient(L.play.x - 70, 0, L.play.x, 0);
      shade.addColorStop(0, 'rgba(4,4,16,0)');
      shade.addColorStop(1, 'rgba(4,4,16,0.42)');
      ctx.fillStyle = shade;
      ctx.fillRect(L.play.x - 70, 0, w - L.play.x + 70, h);

      // Hero, pet and allies, back to front.
      const hero = heroById(loadoutFromSave(data).hero);
      const spread = L.heroScale / 2;
      const cast: {
        def: CompanionDef;
        x: number;
        y: number;
        dir: 1 | -1;
        walking: boolean;
        k: number;
      }[] = [
        {
          def: hero,
          x: L.stage.x + troupe.hero.x * spread,
          y: L.stage.y,
          dir: troupe.hero.dir,
          walking: troupe.hero.walking,
          k: L.heroScale * (hero.kind === 'hero' ? (hero.scale ?? 1) : 1),
        },
      ];
      followers().forEach((def, i) => {
        const f = troupe.followers[i];
        if (!f) return;
        cast.push({
          def,
          x: L.stage.x + f.x * spread,
          y: L.stage.y + (i === 0 ? 3 : i === 1 ? -2 : 2),
          dir: f.dir,
          walking: f.walking,
          k:
            Math.max(1, Math.round(L.heroScale / 2)) *
            (def.kind === 'ally' || def.kind === 'pet' ? (def.scale ?? 1) : 1),
        });
      });
      cast.sort((a, b) => a.y - b.y);
      for (const c of cast) {
        scene.renderer.drawShadow(
          ctx,
          c.x + frame.camX,
          c.y + frame.camY,
          Math.max(1, c.k * 0.75),
          frame.camX,
          frame.camY,
        );
        drawActor(ctx, app.atlas, c.def, c.x, c.y, time, c.k, 1, 0, {
          walking: c.walking,
          dir: c.dir,
        });
      }
      // Name plate under the hero's feet.
      drawText(ctx, hero.name, L.stage.x, L.stage.y + 10, cb(RARITY_COLOR[hero.rarity]), 'center');
      drawCard(ctx, L.card, L.tier);

      // Small logo between the chip and the resources when there is room.
      if (L.logo) drawLogo(ctx, L.logo.cx, L.logo.y, L.logo.block, time);

      // Resources.
      let rx = L.pillsRight;
      const pill = (icon: IconName, text: string, color: string): void => {
        const pw = 12 + 4 + textWidth(text) + 5;
        rx -= pw;
        drawPill(ctx, rx, L.pillsY, icon, text, color);
        rx -= 3;
      };
      pill('egg_rare', String(data.currencies.rareSpawnEggs), UI.gold);
      pill('egg', String(data.currencies.spawnEggs), '#9ad978');
      pill('emerald', String(data.currencies.emeralds), UI.green);

      // Buttons: profile chip, daily banner, PLAY, tiles.
      buttons.begin();
      buttons.add(
        rectOf(L.profile),
        'Profile',
        () => router.push(profileScreen(app, back)),
        false,
        {
          key: 'profile',
          tooltip: chipTip(),
          custom: (c, r, st) => drawChip(c, r, st.hover || st.pressed, st.focused),
        },
      );
      const daily = dailyRewardState(data, Date.now());
      if (daily.canClaim) {
        buttons.add(rectOf(L.banner), 'Daily reward!', claimDaily, false, {
          key: 'daily',
          variant: 'gold',
          icon: 'gift',
          tooltip: `Day ${daily.day}: ${rewardText(daily.reward)}. Click to claim.`,
        });
      }
      buttons.add(rectOf(L.play), 'PLAY', play, false, {
        key: 'play',
        variant: 'primary',
        icon: 'sword',
      });
      const claimable = missionsClaimable(data, Date.now());
      tiles.forEach((tile, i) => {
        const r = L.tiles[i];
        if (!r) return;
        const room = r.w - 8 - 15;
        const label = textWidth(tile.label) <= room ? tile.label : tile.short;
        buttons.add(rectOf(r), label, tile.go, false, {
          key: tile.label,
          icon: tile.icon,
          align: 'left',
          tooltip:
            tile.label === 'MISSIONS' && claimable > 0
              ? `${claimable} mission${claimable > 1 ? 's' : ''} ready.`
              : tile.tip,
          badge: tile.label === 'MISSIONS' && claimable > 0 ? '!' : null,
        });
      });

      // Records under the buttons.
      if (L.footer) {
        const f = L.footer;
        drawPanel(ctx, f, false, null, 'slate');
        const r = data.records;
        const best =
          r.bestTimeSec > 0
            ? `${Math.floor(r.bestTimeSec / 60)}:${String(Math.floor(r.bestTimeSec % 60)).padStart(2, '0')}`
            : '-';
        const lines =
          r.runs === 0
            ? ['Your first run is a short', 'tutorial. Good luck!']
            : [`Best ${best}   Kills ${r.bestKills}`, `Runs ${r.runs}   Wins ${r.wins}`];
        lines.forEach((l, i) => {
          if (f.h >= 9 * (i + 1) + 5)
            drawText(
              ctx,
              fitText(l, f.w - 8),
              f.x + f.w / 2,
              f.y + 11 + i * 9,
              i === 0 ? UI.soft : UI.dim,
              'center',
            );
        });
      }
      buttons.draw(view);
    },
    onMove(x, y) {
      buttons.move(x, y);
    },
    onClick(x, y) {
      buttons.click(x, y);
    },
    onKey(code) {
      const ev = keyToNav(code);
      if (ev === 'ok' && !buttons.keyboardActive) play();
      else buttons.handleKey(code);
    },
  };
}
