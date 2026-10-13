/**
 * Optional manual aim (Settings > Controls > Aim). Pure logic, no DOM: which direction the directional weapons
 * (bow, crossbow, trident, snowball, fishing rod, potions) and the melee swings use when the player aims by hand.
 *
 * Sources, in the order they win: the right stick of a gamepad or the right-side aim stick of the touch controls
 * (a unit direction, held for AIM_IDLE_S after it is released), then the mouse (the pointer position relative to
 * the hero). When nothing has been used for AIM_IDLE_S the resolver returns null and the weapons fall back to
 * the usual auto-aim, so a gamepad player who never touches the right stick keeps playing exactly as before.
 */
import type { InputDevice } from './input';

export type AimMode = 'auto' | 'manual';

/** Radial dead zone of the right stick (a bit wider than the left one: aiming should not jitter at rest). */
export const AIM_DEADZONE = 0.3;
/** Seconds a stick direction or a still mouse (on a pad or touch device) stays in force after the last input. */
export const AIM_IDLE_S = 1.5;
/** A pointer closer than this to the hero (art px) gives no direction. */
export const AIM_MOUSE_MIN = 10;
/** Pointer travel (art px) that counts as the mouse being moved. */
const MOUSE_MOVE = 0.5;

export interface Vec2 {
  x: number;
  y: number;
}

/** A resolved manual aim: unit direction, distance to the aimed point in world px (0 for a stick), and its source. */
export interface ManualAim {
  x: number;
  y: number;
  dist: number;
  source: 'stick' | 'mouse';
}

/** The effective mode of a save's settings: anything but 'manual' (including a missing field) is 'auto'. */
export function aimModeOf(settings: { aim?: AimMode | undefined }): AimMode {
  return settings.aim === 'manual' ? 'manual' : 'auto';
}

/** Unit direction of a stick deflection, or null inside the dead zone. */
export function stickAim(x: number, y: number, deadzone = AIM_DEADZONE): Vec2 | null {
  const m = Math.hypot(x, y);
  if (!(m >= deadzone) || !Number.isFinite(m)) return null;
  return { x: x / m, y: y / m };
}

/** Direction and distance from the hero to a pointer (`rel` is already relative to the hero), or null if too close. */
export function mouseAim(
  rel: Vec2,
  min = AIM_MOUSE_MIN,
): { x: number; y: number; dist: number } | null {
  const d = Math.hypot(rel.x, rel.y);
  if (!(d >= min) || !Number.isFinite(d)) return null;
  return { x: rel.x / d, y: rel.y / d, dist: d };
}

export interface AimFrame {
  /** Seconds since the previous step. */
  dt: number;
  /** Right stick / touch aim stick as a unit direction (already dead-zoned), null when neutral. */
  stick: Vec2 | null;
  /** Pointer position in art px (screen space): used only to notice that the mouse moved. */
  pointer: Vec2;
  /** Pointer position relative to the hero in world px. */
  mouse: Vec2;
  /** The device the player used last. */
  device: InputDevice;
}

/** Tracks how recently each aim source was used and picks the one in force. One per run. */
export class AimResolver {
  private stickIdle = Infinity;
  private mouseIdle = Infinity;
  private mouseSeen = false;
  private lastStick: Vec2 | null = null;
  private px = Number.NaN;
  private py = Number.NaN;

  reset(): void {
    this.stickIdle = Infinity;
    this.mouseIdle = Infinity;
    this.mouseSeen = false;
    this.lastStick = null;
    this.px = Number.NaN;
    this.py = Number.NaN;
  }

  step(f: AimFrame): ManualAim | null {
    const dt = Math.max(0, f.dt);
    if (f.stick && (f.stick.x !== 0 || f.stick.y !== 0)) {
      this.lastStick = f.stick;
      this.stickIdle = 0;
    } else this.stickIdle += dt;

    if (Number.isNaN(this.px)) {
      // The first sample is only a baseline (the pointer may rest where the last menu click was).
      this.px = f.pointer.x;
      this.py = f.pointer.y;
    }
    if (Math.hypot(f.pointer.x - this.px, f.pointer.y - this.py) >= MOUSE_MOVE) {
      this.mouseSeen = true;
      this.mouseIdle = 0;
      this.px = f.pointer.x;
      this.py = f.pointer.y;
    } else this.mouseIdle += dt;

    const stickOn = this.lastStick !== null && this.stickIdle < AIM_IDLE_S;
    // On keyboard and mouse the pointer is the aim for as long as it exists; after a pad or touch input it only
    // counts for a moment after it moved (a mouse left on the desk must not steer a pad player). Touch drags also
    // move the pointer, but they are the aim stick's business.
    const mouseOn =
      this.mouseSeen &&
      f.device !== 'touch' &&
      (f.device === 'keyboard' || this.mouseIdle < AIM_IDLE_S);
    const m = mouseOn ? mouseAim(f.mouse) : null;

    if (stickOn && this.lastStick && (!m || this.stickIdle <= this.mouseIdle))
      return { x: this.lastStick.x, y: this.lastStick.y, dist: 0, source: 'stick' };
    if (m) return { ...m, source: 'mouse' };
    return null;
  }
}

/**
 * Where the reticle sits along the aim direction, in px from the hero: the aimed point for the mouse (kept
 * between 18 and 48 px so it stays next to the hero), a fixed 30 px for a stick.
 */
export function reticleDistance(a: ManualAim): number {
  return a.source === 'mouse' ? Math.min(48, Math.max(18, a.dist)) : 30;
}
