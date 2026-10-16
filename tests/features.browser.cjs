const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const core = require('../app/src/main/assets/assistant-core.js');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const url = pathToFileURL(path.resolve(__dirname, '../app/src/main/assets/index.html')).href;
  const open = async kind => page.evaluate(kind => window.openAssistantPage(kind), kind);
  const add = async (kind, title, body = '', date = '') => {
    await open(kind);
    await page.locator('#add-item').click();
    await page.locator('#item-title').fill(title);
    await page.locator('#item-body').fill(body);
    if (date) await page.locator('#item-date').fill(date);
    await page.locator('#item-form button[type=submit]').click();
    assert.equal(await page.locator('#editor-overlay').isVisible(), false);
  };
  try {
    await page.goto(url);
    assert.match(await page.locator('#today').textContent(), /^\d{1,2}\/\d{1,2} 周[日一二三四五六]$/);
    assert.match(await page.locator('#home-time').textContent(), /^\d{2}:\d{2}:\d{2}$/);
    const payload = '<img src=x onerror=alert(1)> 猫猫';
    await add('notes', '给猫咪的小记', payload);
    assert.equal(await page.locator('.record-body').textContent(), payload);
    assert.equal(await page.locator('.record-body img').count(), 0);
    await page.reload();
    await open('notes');
    assert.equal(await page.locator('.record').count(), 1);
    await page.locator('.record-open').click();
    await page.locator('#item-title').fill('没有保存的修改');
    await page.locator('#close-editor').click();
    assert.equal(await page.locator('#delete-confirm').isVisible(), true);
    await page.locator('#confirm-delete').click();
    assert.equal(await page.locator('.record-title strong').textContent(), '给猫咪的小记');
    await add('tasks', '买猫粮');
    await page.locator('.task-check').click();
    assert.equal(await page.locator('.record').count(), 0);
    await page.locator('[data-filter=done]').click();
    assert.equal(await page.locator('.record.done').count(), 1);
    await page.locator('.task-check').click();
    await page.locator('[data-filter=pending]').click();
    assert.equal(await page.locator('.record').count(), 1);
    await add('events', '周末的约定', '带上相机', core.inputDate(Date.now() + 86400000));
    assert.match(await page.locator('.record-countdown').textContent(), /\d{2}:\d{2}:\d{2}/);

    // Model Android callbacks locally; no device, permissions, or actual calendar changes.
    await page.addInitScript(() => {
      window.__nativeCalls = [];
      const respond = (topic, data) => setTimeout(() => window.onAssistantResult(topic, data), 10);
      window.AndroidAssistant = {
        data: () => JSON.stringify({ planner: JSON.parse(localStorage.getItem('assistant-planner') || '{"notes":[],"tasks":[],"events":[]}'), weather: JSON.parse(localStorage.getItem('test-weather') || '{}') }),
        savePlanner(raw) { localStorage.setItem('assistant-planner', raw); return '{"ok":true}'; },
        searchCity(query) { respond('citySearch', { query, cities: [{ name: '上海', admin1: '上海市', country: '中国', latitude: 31.23, longitude: 121.47 }] }); },
        selectCity(raw) {
          const data = { city: JSON.parse(raw), temperature: 21, code: 3, feelsLike: 21, humidity: 65, wind: 8.9, high: 25, low: 16.8, fetchedAt: Date.now() };
          localStorage.setItem('test-weather', JSON.stringify(data)); respond('weather', data);
        },
        refreshWeather() { respond('weather', { error: '天气更新失败，请检查网络后重试' }); },
        readCalendar() { respond('calendar', { events: [{ sourceId: '1_12345', title: '日历中的约定', body: '日程备注', dueAt: Date.now() + 7200000 }] }); },
        exportCalendar(raw) { window.__nativeCalls.push(['calendar', JSON.parse(raw)]); respond('message', { message: '请在系统日历中确认保存与提醒' }); },
        openCalendar() { window.__nativeCalls.push(['openCalendar']); },
        addWidget() { window.__nativeCalls.push(['widget']); respond('message', { message: '请在桌面确认添加小组件' }); },
        openWeatherSource() { window.__nativeCalls.push(['weatherSource']); }
      };
    });
    await page.reload();
    await open('weather');
    await page.locator('#city-query').fill('上海');
    await page.locator('#city-search').click();
    await page.locator('.city-result').click();
    await page.waitForFunction(() => document.getElementById('weather-temperature').textContent === '21°');
    await page.locator('#refresh-weather').click();
    await page.waitForFunction(() => document.getElementById('weather-status').textContent.includes('失败'));
    assert.equal(await page.locator('#weather-temperature').textContent(), '21°');
    assert.equal(await page.locator('#refresh-weather').isEnabled(), true);
    await open('tasks');
    await page.locator('#import-calendar').click();
    await page.locator('#calendar-list .city-result').click();
    assert.equal(await page.locator('.record').count(), 2);
    await page.locator('#import-calendar').click();
    await page.waitForFunction(() => !!document.querySelector('#calendar-list .city-result'));
    assert.equal(await page.locator('#calendar-list .city-result').isDisabled(), true);
    await page.locator('#close-calendar').click();
    await page.locator('#planner-list').getByText('日历中的约定', { exact: true }).click();
    await page.locator('#item-calendar').click();
    assert.equal(await page.evaluate(() => window.__nativeCalls.filter(x => x[0] === 'calendar').length), 1);
    assert.equal(await page.locator('[data-page="memory"], #memory-page').count(), 0);
    await open('notes');
    assert.equal(await page.locator('.record').count(), 1);
    await open('home');
    await page.locator('#pin-widget').click();
    assert.equal(await page.evaluate(() => window.__nativeCalls.filter(x => x[0] === 'widget').length), 1);
    await page.locator('#open-timer').click();
    assert.equal(await page.locator('.page:visible').count(), 1);
    await page.locator('.quick-button[data-seconds="90"]').click();
    assert.equal(await page.locator('#time-display').textContent(), '01:30');
    await page.locator('#cancel').click();
    await open('notes');
    await page.locator('.record-open').click();
    await page.locator('#delete-item').click();
    await page.locator('#confirm-delete').click();
    assert.equal(await page.locator('.record').count(), 0);

    for (const width of [320, 360, 412, 800]) {
      await page.setViewportSize({ width, height: 850 });
      for (const name of ['home', 'weather', 'tasks', 'events', 'cat', 'timer']) {
        await open(name);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
        assert.equal(overflow, false, `${name} overflows at width ${width}`);
        const broken = await page.locator('img:visible').evaluateAll(nodes => nodes.filter(img => img.complete && !img.naturalWidth).map(img => img.src));
        assert.deepEqual(broken, [], `${name} has broken images`);
      }
    }
    await page.setViewportSize({ width: 360, height: 800 });
    await open('home');
    await page.locator('#toast').waitFor({ state: 'hidden' });
    await page.screenshot({ path: path.resolve(__dirname, '../.toolchain/assistant-home-preview.png'), fullPage: true });
    await open('tasks');
    await page.screenshot({ path: path.resolve(__dirname, '../.toolchain/assistant-tasks-preview.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS: local CRUD, persistence, calendar/weather/widget bridge states, timer, and 4 responsive widths.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
