const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__musicCalls = [];
    const titles = ['窗边小憩', '月光绒毯', '慢慢晴天'];
    const state = () => JSON.parse(localStorage.getItem('test-music') || 'null') || { status: 'stopped', volume: 35, track: -1, title: '轻柔 BGM', error: '' };
    const save = value => localStorage.setItem('test-music', JSON.stringify(value));
    window.AndroidAssistant = {
      data: () => '{"planner":{"notes":[],"tasks":[],"events":[]},"weather":{}}',
      bgmState: () => JSON.stringify(state()),
      bgmControl(action) {
        window.__musicCalls.push(action);
        const value = state();
        if (action === 'toggle') {
          value.status = ['playing', 'loading'].includes(value.status) ? 'paused' : 'playing';
          if (value.track < 0) value.track = 0;
        }
        if (action === 'next') { value.track = (value.track + 1) % 3; value.status = 'playing'; }
        value.title = titles[value.track]; value.error = ''; save(value);
      },
      bgmVolume(volume) { const value = { ...state(), volume }; save(value); return JSON.stringify(value); }
    };
  });
  try {
    await page.goto(pathToFileURL(path.resolve(__dirname, '../app/src/main/assets/index.html')).href);
    await page.locator('[data-page=cat]').click();
    assert.equal(await page.locator('#bgm-volume').inputValue(), '35');
    await page.locator('#bgm-toggle').click();
    await page.waitForFunction(() => document.getElementById('bgm-status').textContent === '随机播放');
    assert.equal(await page.locator('#bgm-title').textContent(), '窗边小憩');
    assert.equal(await page.locator('#bgm-toggle').getAttribute('aria-label'), '暂停背景音乐');
    await page.locator('#bgm-next').click();
    await page.waitForFunction(() => document.getElementById('bgm-title').textContent === '月光绒毯');
    await page.locator('#bgm-volume').evaluate(node => { node.value = '58'; node.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('test-music')).volume === 58);
    await page.reload();
    await page.evaluate(() => window.openAssistantPage('cat'));
    assert.equal(await page.locator('#bgm-volume').inputValue(), '58');
    assert.equal(await page.locator('#bgm-title').textContent(), '月光绒毯');
    await page.locator('#bgm-toggle').click();
    await page.waitForFunction(() => document.getElementById('bgm-status').textContent.includes('已暂停'));
    assert.equal(await page.locator('#bgm-toggle').getAttribute('aria-label'), '播放背景音乐');
    await page.evaluate(() => {
      const value = JSON.parse(localStorage.getItem('test-music'));
      value.status = 'loading'; localStorage.setItem('test-music', JSON.stringify(value)); window.refreshBgm();
    });
    assert.equal(await page.locator('#bgm-next').isDisabled(), true);
    await page.locator('#bgm-toggle').click();
    await page.waitForFunction(() => document.getElementById('bgm-status').textContent.includes('已暂停'));
    await page.locator('#bgm-volume').evaluate(node => { node.value = '0'; node.dispatchEvent(new Event('change', { bubbles: true })); });
    assert.equal(await page.locator('#bgm-volume-value').textContent(), '0%');
    await page.evaluate(() => {
      const value = JSON.parse(localStorage.getItem('test-music'));
      value.error = '音乐加载失败，请重试'; localStorage.setItem('test-music', JSON.stringify(value)); window.refreshBgm();
    });
    assert.match(await page.locator('#bgm-status').textContent(), /失败/);
    await page.locator('#bgm-next').click();
    await page.waitForFunction(() => document.getElementById('bgm-status').textContent === '随机播放');
    await page.locator('#cat-focus').click();
    assert.equal(await page.locator('#timer-page').isVisible(), true);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('test-music')).status), 'playing');
    for (const width of [320, 360, 412, 800]) {
      await page.setViewportSize({ width, height: 800 });
      await page.evaluate(() => window.openAssistantPage('cat'));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const broken = await page.locator('.bgm-player img').evaluateAll(nodes => nodes.filter(node => node.complete && !node.naturalWidth).length);
      assert.equal(broken, 0);
    }
    await page.setViewportSize({ width: 360, height: 800 });
    await page.screenshot({ path: path.resolve(__dirname, '../.toolchain/cat-bgm-preview.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS: BGM play/pause/next/loading/error/volume persistence and four screen widths.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
