/**
 * Follow camera. Everything is drawn relative to an integer camera position so tiles never shimmer; the hero is
 * rounded first and the look-ahead is added as an integer, which keeps the hero's on-screen position stable.
 */
const LEAD_TIME = 0.16; // seconds of travel the camera looks ahead
const LEAD_MAX = 14;
const LEAD_RATE = 5; // 1/s, how quickly the lead catches up

export class Camera {
  x = 0;
  y = 0;
  private leadX = 0;
  private leadY = 0;

  /**
   * `targetX/Y` is the (interpolated) hero position, `vx/vy` its velocity in px/s, `dt` the real frame time.
   * With no velocity the lead decays to zero and the hero sits at the view centre.
   */
  follow(
    targetX: number,
    targetY: number,
    viewW: number,
    viewH: number,
    vx = 0,
    vy = 0,
    dt = 1 / 60,
  ): void {
    const k = 1 - Math.exp(-LEAD_RATE * dt);
    const wantX = Math.max(-LEAD_MAX, Math.min(LEAD_MAX, vx * LEAD_TIME));
    const wantY = Math.max(-LEAD_MAX, Math.min(LEAD_MAX, vy * LEAD_TIME));
    this.leadX += (wantX - this.leadX) * k;
    this.leadY += (wantY - this.leadY) * k;
    this.x = Math.round(targetX) + Math.round(this.leadX) - Math.floor(viewW / 2);
    this.y = Math.round(targetY) + Math.round(this.leadY) - Math.floor(viewH / 2) - 8;
  }

  /** Jump without easing (new run, teleport). */
  reset(): void {
    this.leadX = 0;
    this.leadY = 0;
  }
}
