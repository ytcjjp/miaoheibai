const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const sharp = require('sharp');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const output = path.resolve(__dirname, '../.toolchain/tablet-4k');
  fs.mkdirSync(output, { recursive: true });
  try {
    for (const density of [1, 2, 3]) {
      const context = await browser.newContext({
        viewport: { width: 3840 / density, height: 2160 / density },
        deviceScaleFactor: density, isMobile: true, hasTouch: true,
        reducedMotion: 'reduce'
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => {
        const cat = { name: '小墨', collar: 'pink', theme: 'blush', animations: false,
          showStats: true, fullness: 80, happiness: 75, energy: 85, level: 1,
          days: 1, sleeping: false, pose: 'idle', mood: '想陪你玩',
          message: '小银靠过来啦，我们一起陪着你。' };
        let planner = { notes: [], tasks: [], events: [] };
        window.AndroidAssistant = {
          data: () => JSON.stringify({ planner, weather: {} }),
          savePlanner: raw => { planner = JSON.parse(raw); return '{"ok":true}'; },
          catState: () => JSON.stringify(cat),
          catAction: () => { cat.pose = 'happy'; return JSON.stringify(cat); },
          saveCatSettings: raw => { Object.assign(cat, JSON.parse(raw)); return JSON.stringify(cat); }
        };
      });
      await page.goto(pathToFileURL(path.resolve(__dirname, '../app/src/main/assets/index.html')).href);
      const checkLayout = async () => {
        await page.waitForFunction(() => Array.from(document.querySelectorAll('main:not([hidden]) img'))
          .every(img => img.complete && img.naturalWidth > 0));
        const problems = await page.evaluate(() => {
          const failures = [];
          if (document.documentElement.scrollWidth > innerWidth) failures.push('horizontal overflow');
          for (const node of document.querySelectorAll('main:not([hidden]) button,.sheet-backdrop:not([hidden]) button')) {
            if (!node.getClientRects().length) continue;
            const box = node.getBoundingClientRect();
            if (box.left < -1 || box.right > innerWidth + 1) failures.push(`off-screen button: ${node.id || node.textContent}`);
            if (node.scrollWidth > node.clientWidth + 1) failures.push(`clipped button: ${node.id || node.textContent}`);
          }
          for (const node of document.querySelectorAll('main:not([hidden]) img')) {
            if (node.getClientRects().length && (!node.complete || !node.naturalWidth)) failures.push(`missing image: ${node.src}`);
          }
          return failures;
        });
        assert.deepEqual(problems, [], `DPR ${density}: ${problems.join(', ')}`);
      };
      for (const portrait of [false, true]) {
        const width = portrait ? 2160 : 3840, height = portrait ? 3840 : 2160;
        await page.setViewportSize({ width: width / density, height: height / density });
        const label = `${portrait ? 'portrait' : 'landscape'}-${density}x`;
        for (const name of ['home', 'cat', 'weather', 'notes', 'tasks', 'events', 'timer', 'lucky']) {
          await page.evaluate(name => name === 'home' ? window.goHome() : window.openAssistantPage(name), name);
          await page.waitForFunction(() => Array.from(document.querySelectorAll('main:not([hidden]) img')).every(img => img.complete));
          if (name === 'lucky') await page.waitForFunction(() => document.getElementById('lucky-results').getAttribute('aria-busy') === 'false');
          await checkLayout();
          if (['home', 'cat', 'lucky'].includes(name)) {
            const file = path.join(output, `${label}-${name}.png`);
            await page.screenshot({ path: file });
            const metadata = await sharp(file).metadata();
            assert.deepEqual([metadata.width, metadata.height], [width, height], 'screenshot must be physical 4K');
          }
        }
        await page.evaluate(() => window.openAssistantPage('cat'));
        await page.locator('#pet-cat').tap();
        assert.match(await page.locator('#cat-image').getAttribute('src'), /happy_pink(?:_gold)?\.svg$/);
        await page.locator('#open-cat-settings').tap();
        await page.locator('#cat-nickname').fill('一二三四五六七八九十一二');
        await page.locator('#cat-white-nickname').fill('一二三四五六七八九十一二');
        await page.locator('[name=cat-white-collar][value=gold]').check();
        await page.locator('#save-cat-settings').tap();
        assert.equal(await page.locator('#cat-settings-overlay').isVisible(), false);
        assert.match(await page.locator('#cat-image').getAttribute('src'), /_pink_gold\.svg$/);
        await checkLayout();
        assert.equal(await page.locator('#cat-name').evaluate(node => node.scrollWidth <= node.clientWidth), true);
        await page.locator('#open-cat-settings').tap();
        await page.screenshot({ path: path.join(output, `${label}-settings.png`) });
        await page.locator('#close-cat-settings').tap();
        await page.evaluate(() => window.openAssistantPage('notes'));
        await page.locator('#add-item').tap();
        await page.locator('#item-title').fill(`4K ${label}`);
        await page.locator('#item-body').fill('横竖屏切换后仍可编辑和保存。');
        await page.locator('#item-form button[type=submit]').tap();
        assert.equal(await page.locator('#editor-overlay').isVisible(), false);
        assert.ok((await page.locator('.record-title').allTextContents()).some(text => text.includes(label)));
        await page.evaluate(() => window.openAssistantPage('timer'));
        await page.locator('.quick-button[data-seconds="90"]').tap();
        await page.locator('#pause-resume').tap();
        assert.equal(await page.locator('#status-tag').textContent(), '已暂停');
        await page.locator('#cancel').tap();
        await checkLayout();
        console.log(`PASS: physical ${width}x${height}, DPR ${density}, eight pages, touch actions, settings, notes and timer.`);
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
