// Focused local review of draft status/confirmation. No microphone or backend use.
const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/review/web-workspace/draft-coordination');
const BASE = 'http://127.0.0.1:4198';
const blocked = [];
const errors = [];
const captures = {};
const layouts = [];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === BASE) return route.continue();
    blocked.push(route.request().url());
    return route.abort();
  });
  async function open() {
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(BASE + '/try.html');
    const frame = page.frames().find(f => new URL(f.url()).pathname === '/workspace.html');
    await expect(frame.locator('#draft')).toBeEnabled();
    return { page, frame };
  }
  async function capture(name, { page, frame }) {
    const file = path.join(OUT, name + '.webp');
    await page.mouse.move(0, 0);
    execFileSync('python3', ['-c', "from PIL import Image; import sys; Image.open(sys.stdin.buffer).save(sys.argv[1], format='WEBP', lossless=True)", file], { input: await page.screenshot() });
    captures[name + '.webp'] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    for (const [surface, target] of [['page', page], ['workspace', frame]]) {
      const result = await target.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
      expect(result.scrollWidth).toBeLessThanOrEqual(result.width + 1);
      layouts.push({ state: name, surface, ...result });
    }
  }
  async function frameEditor({ page, frame }) {
    const card = await frame.locator('.writing-card').boundingBox();
    await page.evaluate(top => window.scrollTo(0, Math.max(0, scrollY + top - 70)), card.y);
  }
  const a = await open();
  await a.frame.locator('#draft').fill('Notes for our studio visit:\nBring the blue notebook.');
  await a.frame.locator('.workspace-settings summary').click();
  await a.frame.locator('#remember-draft').check();
  await expect(a.frame.locator('#save-status')).toHaveText('Saved in this browser.');
  await a.frame.locator('.workspace-settings summary').click();
  await frameEditor(a);
  await capture('saved-status-390', a);

  const b = await open();
  await expect(b.frame.locator('#remember-draft')).toBeChecked();
  await a.frame.locator('#draft').fill('The updated plan saved in the first tab.');
  await expect(b.frame.locator('#remember-draft')).not.toBeChecked();
  await b.frame.locator('#draft').fill('Keep my separate notes in this tab.\nThey are not saved over the other draft.');
  await expect(b.frame.locator('#save-status')).toContainText('Saving paused');
  await frameEditor(b);
  await capture('conflict-paused-390', b);

  await b.page.setViewportSize({ width: 1440, height: 1000 });
  await b.page.evaluate(() => window.scrollTo(0, 0));
  await b.frame.locator('.workspace-settings summary').click();
  await b.frame.locator('#remember-draft').click();
  await expect(b.frame.locator('#replace-draft-dialog')).toBeVisible();
  await expect(b.frame.locator('#keep-saved-draft')).toBeFocused();
  await b.page.evaluate(() => window.scrollTo(0, 0));
  await capture('replace-confirmation-1440', b);
  await b.frame.locator('#keep-saved-draft').press('Escape');
  await expect(b.frame.locator('#replace-draft-dialog')).not.toBeVisible();
  await expect(b.frame.locator('#remember-draft')).toBeFocused();
  await expect(b.frame.locator('#draft')).toHaveValue('Keep my separate notes in this tab.\nThey are not saved over the other draft.');
  expect(blocked).toEqual([]);
  expect(errors).toEqual([]);

  const sources = ['site/workspace.js', 'site/workspace.html', 'site/workspace.css'];
  fs.writeFileSync(path.join(OUT, 'provenance.json'), JSON.stringify({
    source_commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    method: 'Native Chromium localStorage and Web Locks, two pages in one context; no recording, backend or provider requests.',
    browser: browser.version(), captures_sha256: captures,
    sources_sha256: Object.fromEntries(sources.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex')])),
    layouts, keyboard: 'Escape closed the nonblocking replacement dialog, restored Remember focus and preserved unsaved text.',
    blocked_external: blocked, page_errors: errors,
  }, null, 2) + '\n');
  await browser.close();
  console.log(JSON.stringify({ captures: Object.keys(captures), blocked, errors }));
})().catch(error => { console.error(error); process.exit(1); });
