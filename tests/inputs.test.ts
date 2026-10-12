import { describe, expect, it } from 'vitest';
import { padMove } from '../src/core/gamepad';
import { type InputSource, MergedInput } from '../src/core/input';
import { TouchInput } from '../src/core/touch';

const W = 426;
const H = 240;

describe('touch controls', () => {
  it('moves with a floating stick, applies a deadzone and follows the finger past the radius', () => {
    const t = new TouchInput();
    expect(t.moveVector()).toEqual({ x: 0, y: 0 });
    expect(t.pointerDown(1, 100, 150, W, H)).toBe(true);
    expect(t.active).toBe(true);
    t.pointerMove(1, 103, 150);
    expect(t.moveVector()).toEqual({ x: 0, y: 0 }); // inside the deadzone
    t.pointerMove(1, 100 + 40, 150);
    const v = t.moveVector();
    expect(v.x).toBeCloseTo(1, 5);
    expect(Math.abs(v.y)).toBeLessThan(1e-9);
    // Dragging far moves the origin, so reversing is immediate.
    t.pointerMove(1, 400, 150);
    t.pointerMove(1, 330, 150);
    expect(t.moveVector().x).toBeLessThan(0); // reversed without crossing the whole screen
    t.pointerUp(1);
    expect(t.moveVector()).toEqual({ x: 0, y: 0 });
  });

  it('ignores the stick on the right side but presses the buttons one-shot', () => {
    const t = new TouchInput();
    expect(t.pointerDown(2, 380, 100, W, H)).toBe(false);
    const ability = t.buttons(W, H).find((b) => b.id === 'ability');
    if (!ability) throw new Error('no ability button');
    expect(t.pointerDown(3, ability.x, ability.y, W, H)).toBe(true);
    expect(t.abilityPressed()).toBe(true);
    expect(t.isHeld('ability')).toBe(true);
    t.endStep();
    expect(t.abilityPressed()).toBe(false);
    t.pointerUp(3);
    expect(t.isHeld('ability')).toBe(false);
  });

  it("respects the 'off' mode and only shows after a touch in auto mode", () => {
    const t = new TouchInput();
    expect(t.enabled).toBe(false);
    t.pointerDown(1, 50, 50, W, H);
    expect(t.enabled).toBe(true);
    const off = new TouchInput();
    off.mode = 'off';
    expect(off.pointerDown(1, 50, 50, W, H)).toBe(false);
    expect(off.enabled).toBe(false);
    const on = new TouchInput();
    on.mode = 'on';
    expect(on.enabled).toBe(true);
  });
});

describe('gamepad mapping and merged input', () => {
  const pad = (axes: number[], pressed: number[] = []) => ({
    axes,
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) })),
  });

  it('applies a stick deadzone, d-pad movement and a clamped diagonal', () => {
    expect(padMove(pad([0.1, 0.1]))).toEqual({ x: 0, y: 0 });
    const full = padMove(pad([1, 0]));
    expect(full.x).toBeCloseTo(1, 5);
    const dpad = padMove(pad([0, 0], [14, 12]));
    expect(Math.hypot(dpad.x, dpad.y)).toBeCloseTo(1, 5);
    expect(dpad.x).toBeLessThan(0);
    expect(dpad.y).toBeLessThan(0);
  });

  it('sums movement from several sources and ORs the presses', () => {
    const mk = (x: number, y: number, ability = false): InputSource => ({
      moveVector: () => ({ x, y }),
      pausePressed: () => false,
      confirmPressed: () => false,
      cancelPressed: () => false,
      activePressed: () => false,
      abilityPressed: () => ability,
      endStep() {},
    });
    const m = new MergedInput([mk(1, 0), mk(1, 0), mk(0, 0, true)]);
    const v = m.moveVector();
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 5); // clamped
    expect(m.abilityPressed()).toBe(true);
    expect(m.pausePressed()).toBe(false);
  });
});
