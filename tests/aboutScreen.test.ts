import { describe, expect, it } from 'vitest';
import { GENERAL, paginateSections } from '../src/ui/aboutScreen';
import { textWidth } from '../src/ui/font';
import { wrapText } from '../src/ui/panel';

/** Rows of 9 px a page needs (head + wrapped body per section, 4 px between sections), plus the 12 px top. */
function pageHeight(page: readonly { body: string }[], boxW: number): number {
  let y = 12;
  for (const s of page) y += (1 + wrapText(s.body, boxW - 16, (t) => textWidth(t)).length) * 9 + 4;
  return y - 4;
}

describe('About screen credits pages', () => {
  it('lists every section once and fits each page in the 320x180 panel', () => {
    const boxW = 320 - 24;
    const boxH = 180 - 58;
    const pages = paginateSections(GENERAL, boxW, boxH);
    expect(pages.flat()).toEqual(GENERAL);
    expect(pages.length).toBeGreaterThan(1);
    for (const p of pages) {
      expect(p.length).toBeGreaterThan(0);
      expect(pageHeight(p, boxW)).toBeLessThanOrEqual(boxH - 4);
    }
  });

  it('keeps one page on a tall view', () => {
    expect(paginateSections(GENERAL, 640 - 24, 360 - 58)).toHaveLength(1);
  });

  it('says that the End, the dragon and the structures are code-drawn and nothing is AI-generated', () => {
    const art = GENERAL.find((s) => s.head === 'Art');
    expect(art?.body).toContain('Ender Dragon');
    expect(art?.body).toContain('structures');
    expect(art?.body).toContain('No AI-generated art');
  });
});
