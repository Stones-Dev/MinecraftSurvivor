import { describe, expect, it } from 'vitest';
import {
  FALLBACK_ADVANCE,
  LINE_HEIGHT,
  alignedX,
  measureWith,
  textWidth,
  thresholdAlpha,
} from '../src/ui/font';
import { fitText, wrapText } from '../src/ui/panel';

/** Fake monospace font: every character is 4 px wide. */
const mono = (s: string): number => s.length * 4;

describe('wrapText', () => {
  it('returns no lines for an empty string', () => {
    expect(wrapText('', 100, mono)).toEqual([]);
  });

  it('keeps a short string on one line', () => {
    expect(wrapText('hello world', 100, mono)).toEqual(['hello world']);
  });

  it('breaks greedily at spaces', () => {
    // 10 chars = 40 px per line.
    expect(wrapText('aaa bbb ccc ddd', 40, mono)).toEqual(['aaa bbb', 'ccc ddd']);
    expect(wrapText('aaa bbb ccc ddd', 28, mono)).toEqual(['aaa bbb', 'ccc ddd']);
    expect(wrapText('aaa bbb ccc ddd', 27, mono)).toEqual(['aaa', 'bbb', 'ccc', 'ddd']);
  });

  it('splits a word that is wider than a whole line', () => {
    const lines = wrapText('ab abcdefghij cd', 16, mono);
    expect(lines).toEqual(['ab', 'abcd', 'efgh', 'ij', 'cd']);
    for (const l of lines) expect(mono(l)).toBeLessThanOrEqual(16);
  });

  it('never loops on a line narrower than one character', () => {
    expect(wrapText('abc', 2, mono)).toEqual(['a', 'b', 'c']);
  });

  it('honours explicit newlines, including blank lines', () => {
    expect(wrapText('one\n\ntwo', 100, mono)).toEqual(['one', '', 'two']);
  });

  it('uses the given measure (proportional widths)', () => {
    const narrowI = (s: string): number => [...s].reduce((w, c) => w + (c === 'i' ? 2 : 6), 0);
    expect(wrapText('iiii mmmm', 30, narrowI)).toEqual(['iiii', 'mmmm']);
    expect(wrapText('iiii ii', 30, narrowI)).toEqual(['iiii ii']);
  });
});

describe('fitText', () => {
  it('leaves fitting strings alone and cuts the rest with ".."', () => {
    expect(fitText('short', 40, mono)).toBe('short');
    const cut = fitText('a much longer label', 40, mono);
    expect(cut.endsWith('..')).toBe(true);
    expect(mono(cut)).toBeLessThanOrEqual(40);
  });

  it('does not leave a space before the ellipsis', () => {
    expect(fitText('abcd efgh', 28, mono)).toBe('abcd..');
  });
});

describe('glyph metrics', () => {
  it('sums integer advances and scales by whole numbers', () => {
    const adv = (code: number): number => (code === 0x69 ? 2 : 5); // 'i' is narrow
    expect(measureWith('hi', adv)).toBe(7);
    expect(measureWith('hi', adv, 3)).toBe(21);
    expect(measureWith('hi', adv, 2.4)).toBe(14);
    expect(measureWith('', adv)).toBe(0);
  });

  it('rounds fractional advances to a whole pixel width', () => {
    expect(Number.isInteger(measureWith('abc', () => 4.4))).toBe(true);
  });

  it('counts a surrogate pair as one character', () => {
    expect(measureWith('a\u{1F600}b', () => 5)).toBe(15);
  });

  it('textWidth is an integer even without a DOM (fallback advance)', () => {
    const w = textWidth('Lv 12  3:45  +25% XP, 1/2');
    expect(Number.isInteger(w)).toBe(true);
    expect(w).toBe(25 * FALLBACK_ADVANCE);
    expect(textWidth('ab', 2)).toBe(4 * FALLBACK_ADVANCE);
  });

  it('exposes a whole-pixel line height', () => {
    expect(Number.isInteger(LINE_HEIGHT)).toBe(true);
    expect(LINE_HEIGHT).toBeGreaterThanOrEqual(8);
  });

  it('aligns to whole pixels', () => {
    expect(alignedX(10.6, 7, 'left')).toBe(11);
    expect(alignedX(10, 7, 'right')).toBe(3);
    expect(alignedX(10, 7, 'center')).toBe(7);
    expect(Number.isInteger(alignedX(10.5, 9, 'center'))).toBe(true);
  });
});

describe('thresholdAlpha', () => {
  it('turns antialiased alpha into a hard white 1-bit mask', () => {
    const px = new Uint8ClampedArray([10, 20, 30, 0, 0, 0, 0, 127, 0, 0, 0, 128, 99, 99, 99, 255]);
    thresholdAlpha(px);
    expect([...px]).toEqual([
      255, 255, 255, 0, 255, 255, 255, 0, 255, 255, 255, 255, 255, 255, 255, 255,
    ]);
  });
});
