const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const core = require('../app/src/main/assets/lucky-core.js');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const url = pathToFileURL(path.resolve(__dirname, '../app/src/main/assets/index.html')).href;
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('miaohb-lucky-v1')));
  const busy = () => page.locator('#lucky-results').getAttribute('aria-busy');
  const open = () => page.evaluate(() => window.openAssistantPage('lucky'));
  try {
    await page.clock.install({ time: new Date(2026, 9, 16, 10, 0) });
    await page.goto(url);
    await page.locator('[data-page=lucky]').click();
    assert.equal(await busy(), 'true');
    assert.equal(await page.locator('#refresh-lucky').isDisabled(), true);
    const firstFrame = await page.locator('#lucky-seven').textContent();
    await page.clock.runFor(510);
    assert.notEqual(await page.locator('#lucky-seven').textContent(), firstFrame);
    await page.screenshot({ path: path.resolve(__dirname, '../.toolchain/lucky-drawing-preview.png') });
    assert.equal(await stored(), null);
    await page.clock.runFor(1600);
    assert.equal(await busy(), 'false');
    let record = await stored();
    assert.ok(core.valid(record, '2026-10-16'));
    assert.equal(await page.locator('.lucky-ball').count(), 14);
    assert.equal(await page.locator('.lucky-ball.blue').count(), 1);
    assert.equal(await page.locator('#lucky-seven').textContent(), record.numbers.seven.join(''));
    assert.match(await page.locator('#lucky-double').getAttribute('aria-label'), /红球.*蓝球/);
    await page.locator('#lucky-page .page-back').click();
    assert.equal(await page.locator('#home').isVisible(), true);
    await open();
    assert.deepEqual(await stored(), record);
    await page.reload();
    await open();
    assert.equal(await busy(), 'false');
    assert.deepEqual(await stored(), record);

    await page.locator('#refresh-lucky').click();
    await page.evaluate(() => document.getElementById('refresh-lucky').click());
    await page.clock.runFor(1800);
    assert.equal(await busy(), 'true');
    assert.deepEqual(await stored(), record);
    await page.clock.runFor(250);
    const refreshed = await stored();
    assert.notDeepEqual(refreshed.numbers.seven, record.numbers.seven);
    assert.ok(refreshed.numbers.blue !== record.numbers.blue || refreshed.numbers.red.join() !== record.numbers.red.join());
    record = refreshed;

    await page.locator('#refresh-lucky').click();
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.equal(await busy(), 'false');
    assert.equal(await page.locator('#refresh-lucky').isDisabled(), false);
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    record = await stored();

    await page.clock.setSystemTime(new Date(2026, 9, 17, 0, 0, 1));
    await page.clock.runFor(1100);
    assert.equal(await busy(), 'true');
    await page.clock.runFor(2100);
    assert.ok(core.valid(await stored(), '2026-10-17'));
    assert.match(await page.locator('#lucky-date').textContent(), /10\/17/);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('#refresh-lucky').click();
    assert.equal(await page.locator('#lucky-cat').evaluate(node => getComputedStyle(node).animationName), 'none');
    await page.clock.runFor(2100);
    const saved = await stored();
    await page.evaluate(() => { window.__entropy = crypto.getRandomValues; crypto.getRandomValues = () => { throw new Error('unavailable'); }; });
    await page.locator('#refresh-lucky').click();
    assert.equal(await page.locator('#refresh-lucky').isDisabled(), false);
    assert.match(await page.locator('#lucky-status').textContent(), /未完成/);
    assert.deepEqual(await stored(), saved);
    await page.evaluate(() => { crypto.getRandomValues = window.__entropy; });
    await page.locator('#refresh-lucky').click(); await page.clock.runFor(2100);

    for (const width of [280, 320, 360, 412, 800]) {
      await page.setViewportSize({ width, height: 800 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.equal(await page.locator('.lucky-ball').evaluateAll(nodes => nodes.every(node => {
        const ball = node.getBoundingClientRect(), text = node.firstChild.getBoundingClientRect();
        return ball.width >= 23 && text.left >= ball.left && text.right <= ball.right;
      })), true);
      assert.equal(await page.locator('#refresh-lucky').evaluate(node => {
        const icon = node.querySelector('img').getBoundingClientRect();
        const text = node.querySelector('span').getBoundingClientRect();
        const button = node.getBoundingClientRect();
        return icon.right < text.left && text.right <= button.right && text.top >= button.top && text.bottom <= button.bottom;
      }), true);
    }
    await page.setViewportSize({ width: 360, height: 800 });
    assert.equal(await page.locator('#lucky-cat').evaluate(node => node.complete && node.naturalWidth > 0), true);
    await page.screenshot({ path: path.resolve(__dirname, '../.toolchain/lucky-preview.png'), fullPage: true });
    await page.evaluate(() => localStorage.setItem('miaohb-lucky-v1', '{bad json'));
    await page.reload(); await open(); await page.clock.runFor(2100);
    assert.ok(core.valid(await stored(), '2026-10-17'));
    assert.deepEqual(errors, []);
    console.log('PASS: 2-second draw, refresh, daily persistence, midnight, corruption/entropy recovery, visibility, reduced motion and 5 widths.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
