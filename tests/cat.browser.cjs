const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const sharp = require('sharp');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    // Only the browser-side bridge is mocked; native care rules have separate Java tests.
    window.__catCalls = [];
    const initial = { name: '小墨', collar: 'pink', theme: 'blush', animations: true, showStats: true,
      fullness: 80, happiness: 75, energy: 85, level: 1, days: 1, sleeping: false,
      pose: 'idle', mood: '想陪你玩', message: '我在呢，今天也陪着你。', bond: 0 };
    const load = () => JSON.parse(localStorage.getItem('cat-test-state') || 'null') || initial;
    const save = state => { localStorage.setItem('cat-test-state', JSON.stringify(state)); return JSON.stringify(state); };
    window.AndroidAssistant = {
      data: () => '{"planner":{"notes":[],"tasks":[],"events":[]},"weather":{}}',
      catState: () => JSON.stringify(load()),
      catAction(action) {
        window.__catCalls.push(action);
        const state = { ...load() };
        if (action === 'rest') { state.sleeping = !state.sleeping; state.pose = state.sleeping ? 'sleeping' : 'idle'; state.mood = state.sleeping ? '睡觉中' : '想陪你玩'; }
        if (action === 'pet') { state.happiness = Math.min(100, state.happiness + 8); state.bond += 2; state.pose = 'happy'; }
        if (action === 'feed') { state.fullness = Math.min(100, state.fullness + 18); state.pose = 'eating'; }
        if (action === 'play') { state.energy -= 8; state.pose = 'playing'; }
        state.message = '收到你的陪伴啦。';
        return save(state);
      },
      saveCatSettings(raw) { return save({ ...load(), ...JSON.parse(raw) }); },
      addCatWidget() { window.__catCalls.push('pin'); window.onAssistantResult('message', { message: '请在桌面确认添加小组件' }); }
    };
  });
  try {
    await page.goto(pathToFileURL(path.resolve(__dirname, '../app/src/main/assets/index.html')).href);
    assert.equal(await page.locator('#memory-page,[data-page=memory]').count(), 0);
    await page.locator('[data-page=cat]').click();
    assert.equal(await page.locator('#cat-name').textContent(), '小墨和小银');
    assert.match(await page.locator('#cat-image').getAttribute('alt'), /纯黑猫.*银渐层白猫/);
    await page.locator('#pet-cat').click();
    assert.equal(await page.locator('#cat-happiness-value').textContent(), '83');
    assert.match(await page.locator('#cat-image').getAttribute('src'), /happy_pink/);
    await page.locator('[data-cat-action=feed]').click();
    assert.equal(await page.locator('#cat-fullness-value').textContent(), '98');
    assert.match(await page.locator('#cat-image').getAttribute('src'), /eating_pink/);
    await page.locator('[data-cat-action=play]').click();
    assert.equal(await page.locator('#cat-energy-value').textContent(), '77');
    await page.locator('[data-cat-action=rest]').click();
    assert.equal(await page.locator('#cat-rest-label').textContent(), '叫醒');
    assert.match(await page.locator('#cat-image').getAttribute('src'), /sleeping_pink/);
    await page.locator('[data-cat-action=rest]').click();
    assert.equal(await page.locator('#cat-rest-label').textContent(), '睡觉');
    await page.locator('#open-cat-settings').click();
    await page.locator('#cat-nickname').fill('   ');
    await page.locator('#save-cat-settings').click();
    assert.equal(await page.locator('#cat-settings-error').isVisible(), true);
    await page.locator('#cat-nickname').fill('煤球');
    await page.locator('[name=cat-collar][value=mint]').check();
    await page.locator('[name=cat-theme][value=clear]').check();
    await page.locator('#cat-animations').uncheck();
    await page.locator('#cat-show-stats').uncheck();
    await page.locator('#save-cat-settings').click();
    assert.equal(await page.locator('#cat-settings-overlay').isVisible(), false);
    assert.equal(await page.locator('#cat-name').textContent(), '煤球和小银');
    assert.match(await page.locator('#cat-image').getAttribute('src'), /_mint\.svg$/);
    assert.equal(await page.locator('#cat-page').evaluate(node => node.classList.contains('motion-off')), true);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('cat-test-state')));
    assert.equal(saved.bond, 2);
    assert.equal(saved.theme, 'clear');
    assert.equal(saved.showStats, false);
    await page.reload();
    await page.evaluate(() => window.openAssistantPage('cat-settings'));
    assert.equal(await page.locator('#cat-nickname').inputValue(), '煤球');
    await page.evaluate(() => window.goHome());
    assert.equal(await page.locator('#cat-settings-overlay').isVisible(), false);
    assert.equal(await page.locator('#cat-page').isVisible(), true);
    await page.locator('#pin-cat-widget').click();
    assert.deepEqual(await page.evaluate(() => window.__catCalls), ['pin']);
    await page.locator('#cat-focus').click();
    assert.equal(await page.locator('#timer-page').isVisible(), true);

    for (const width of [320, 360, 412, 800]) {
      await page.setViewportSize({ width, height: 800 });
      await page.evaluate(() => window.openAssistantPage('cat'));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.locator('#cat-image').evaluate(img => img.decode());
      assert.equal(await page.locator('#cat-image').evaluate(img => img.naturalWidth), 512);
      await page.locator('#open-cat-settings').click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.equal(await page.locator('#save-cat-settings').isEnabled(), true);
      await page.locator('#close-cat-settings').click();
      await page.evaluate(() => {
        const state = JSON.parse(localStorage.getItem('cat-test-state'));
        state.name = '一二三四五六七八九十一二';
        localStorage.setItem('cat-test-state', JSON.stringify(state));
        window.refreshCat();
      });
      assert.equal(await page.locator('#cat-name').evaluate(node => node.scrollWidth <= node.clientWidth), true);
      const headingFits = await page.evaluate(() => {
        const name = document.getElementById('cat-name').getBoundingClientRect();
        const mood = document.getElementById('cat-mood').getBoundingClientRect();
        return name.right <= mood.left;
      });
      assert.equal(headingFits, true, 'long nickname must not overlap the mood');
      await page.evaluate(() => window.goHome());
      const homeFits = await page.evaluate(() => {
        const card = document.querySelector('.cat-tool');
        const image = document.getElementById('cat-home-image').getBoundingClientRect();
        const title = card.querySelector('strong').getBoundingClientRect();
        return image.bottom <= title.top && card.scrollWidth <= card.clientWidth;
      });
      assert.equal(homeFits, true, 'home pair thumbnail must not overlap the title');
    }
    await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('cat-test-state'));
      state.name = '煤球';
      localStorage.setItem('cat-test-state', JSON.stringify(state));
      window.refreshCat();
    });
    await page.setViewportSize({ width: 360, height: 800 });
    await page.evaluate(() => window.openAssistantPage('cat'));
    await page.locator('#toast').waitFor({ state: 'hidden' });
    await page.screenshot({ path: path.resolve(__dirname, '../.toolchain/cat-preview.png'), fullPage: true });
    await page.locator('#open-cat-settings').click();
    await page.screenshot({ path: path.resolve(__dirname, '../.toolchain/cat-settings-preview.png') });
    assert.deepEqual(errors, []);
    const checksums = new Set();
    for (const pose of ['idle', 'happy', 'eating', 'playing', 'sleeping', 'hungry', 'tired']) {
      const file = path.resolve(__dirname, `../app/src/main/assets/cat/cat_${pose}_pink.png`);
      const stats = await sharp(file).stats();
      assert.ok(stats.channels[3].max > 200 && stats.channels[3].min === 0, `${pose} must have visible pixels and transparency`);
      const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let blackPixels = 0, whitePixels = 0;
      for (let y = 145; y < 430; y++) {
        for (let x = 50; x < 465; x++) {
          const i = (y * info.width + x) * info.channels;
          if (data[i + 3] < 240) continue;
          if (x < 240 && data[i] < 45 && data[i + 1] < 45 && data[i + 2] < 45) blackPixels++;
          if (x > 270 && data[i] > 220 && data[i + 1] > 220 && data[i + 2] > 220) whitePixels++;
        }
      }
      assert.ok(blackPixels > 20000, `${pose} must contain the pure-black cat on the left`);
      assert.ok(whitePixels > 18000, `${pose} must contain the silver-white companion on the right`);
      checksums.add(require('node:crypto').createHash('sha256').update(require('node:fs').readFileSync(file)).digest('hex'));
    }
    assert.equal(checksums.size, 7, 'all seven poses must have distinct artwork');
    for (const collar of ['pink', 'mint', 'gold']) {
      for (const pose of ['idle', 'happy', 'eating', 'playing', 'sleeping', 'hungry', 'tired']) {
        const file = `cat_${pose}_${collar}.png`;
        const web = await sharp(path.resolve(__dirname, '../app/src/main/assets/cat', file)).metadata();
        const widget = await sharp(path.resolve(__dirname, '../app/src/main/res/drawable-nodpi', file)).metadata();
        assert.deepEqual([web.width, web.height, widget.width, widget.height], [512, 512, 1024, 1024]);
      }
    }
    console.log('PASS: cat actions, preserved settings, widget bridge, long-name layout at four widths and both cats in seven distinct poses.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
