/** Follow camera; positions are rounded to whole art pixels so tiles never shimmer. */
export class Camera {
  x = 0;
  y = 0;

  follow(targetX: number, targetY: number, viewW: number, viewH: number): void {
    this.x = Math.round(targetX - viewW / 2);
    this.y = Math.round(targetY - viewH / 2 - 8);
  }
}
