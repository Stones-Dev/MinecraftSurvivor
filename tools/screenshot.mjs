// Headless screenshots of the dev/preview server with Playwright (visual self-check).
//
// Usage (from the repo root, with `npm run build` done):
//   NODE_PATH=<dir containing playwright-core> node tools/screenshot.mjs <shots.json>
// shots.json: { "base": "http://localhost:4174/", "shots": [
//   { "path": "?run&debug&t=0", "out": "docs/screenshots/run.png", "hold": "KeyD", "holdMs": 1500, "waitMs": 600, "fpsMs": 3000 } ] }
// Chromium is taken from CHROMIUM_PATH or the preinstalled /opt/pw-browsers build.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const exe =
  process.env.CHROMIUM_PATH ||
  execSync('find /opt/pw-browsers -name chrome -type f | head -1').toString().trim();
const cfg = JSON.parse(readFileSync(process.argv[2], 'utf8'));

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
for (const s of cfg.shots) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(cfg.base + (s.path || ''));
  await page.waitForTimeout(s.waitMs ?? 600);
  if (s.hold) {
    await page.keyboard.down(s.hold);
    await page.waitForTimeout(s.holdMs ?? 1000);
    await page.keyboard.up(s.hold);
  }
  let fps = '';
  if (s.fpsMs) {
    const n = await page.evaluate(
      (ms) =>
        new Promise((resolve) => {
          let frames = 0;
          const t0 = performance.now();
          const tick = () => {
            frames++;
            if (performance.now() - t0 < ms) requestAnimationFrame(tick);
            else resolve((frames * 1000) / (performance.now() - t0));
          };
          requestAnimationFrame(tick);
        }),
      s.fpsMs,
    );
    fps = ` fps=${n.toFixed(1)}`;
  }
  await page.screenshot({ path: s.out });
  console.log(`${s.out}${fps} errors=${JSON.stringify(errors)}`);
  await page.close();
}
await browser.close();
