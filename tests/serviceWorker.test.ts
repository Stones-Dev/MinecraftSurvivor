import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string): string =>
  readFileSync(new URL(`../public/${p}`, import.meta.url), 'utf8');

describe('service worker precache', () => {
  it('lists every atlas page so the first visit is enough to boot offline', () => {
    const sw = read('sw.js');
    const core = /const CORE = \[([\s\S]*?)\];/.exec(sw)?.[1] ?? '';
    const pages = (JSON.parse(read('atlas/atlas.json')) as { pages: string[] }).pages;
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) expect(core).toContain(`'./atlas/${page}'`);
  });
});
