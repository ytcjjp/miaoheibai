const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/index.html'), 'utf8');

function mount(nativeBridge) {
  let now = 1_000_000;
  let tick;
  const saved = new Map();
  const nodes = new Map();
  class Element {
    constructor(id = '') {
      this.id = id;
      this.value = '';
      this.hidden = false;
      this.style = {};
      this.dataset = {};
      this.children = [];
      this.events = {};
    }
    addEventListener(event, callback) { this.events[event] = callback; }
    click() { this.events.click?.(); }
    append(...children) { this.children.push(...children); }
    appendChild(child) { this.children.push(child); }
    get firstChild() { return this.children[0] || null; }
    removeChild(child) { this.children.splice(this.children.indexOf(child), 1); }
    setAttribute() {}
  }
  for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) nodes.set(id, new Element(id));
  nodes.get('hours').value = '0';
  nodes.get('minutes').value = '3';
  nodes.get('seconds').value = '0';
  nodes.get('timer-page').hidden = true;
  const quick = [new Element(), new Element()];
  quick[0].dataset.seconds = '180';
  quick[1].dataset.seconds = '90';
  class FakeDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const document = {
    hidden: false,
    getElementById(id) { assert.ok(nodes.has(id), `missing ${id}`); return nodes.get(id); },
    querySelectorAll(selector) { assert.equal(selector, '.quick-button'); return quick; },
    createElement() { return new Element(); },
    addEventListener() {}
  };
  const window = { scrollTo() {}, ...(nativeBridge ? { AndroidTimer: nativeBridge } : {}) };
  const localStorage = {
    getItem(key) { return saved.get(key) ?? null; },
    setItem(key, value) { saved.set(key, value); },
    removeItem(key) { saved.delete(key); }
  };
  vm.runInNewContext(source, { window, document, localStorage, Date: FakeDate,
    performance: { now: () => now }, Intl, setInterval: (cb) => { tick = cb; },
    setTimeout: () => 1, clearTimeout() {} });
  return {
    get: (id) => nodes.get(id), quick, window,
    advance(ms) { now += ms; tick(); },
    recent: () => JSON.parse(saved.get('recent-durations') || '[]')
  };
}

test('quick countdown, pause, resume and finish', () => {
  const app = mount();
  app.get('open-timer').click();
  assert.equal(app.get('timer-page').hidden, false);
  app.quick[1].click();
  assert.equal(app.get('time-display').textContent, '01:30');
  assert.equal(app.get('running-controls').hidden, false);
  assert.deepEqual(app.recent(), [90]);
  app.advance(10_000);
  assert.equal(app.get('time-display').textContent, '01:20');
  app.get('pause-resume').click();
  app.advance(20_000);
  assert.equal(app.get('time-display').textContent, '01:20');
  app.get('pause-resume').click();
  app.advance(80_000);
  assert.equal(app.get('time-display').textContent, '00:00');
  assert.equal(app.get('finished-controls').hidden, false);
  app.get('restart').click();
  assert.equal(app.get('time-display').textContent, '01:30');
  app.get('cancel').click();
  assert.equal(app.get('running-controls').hidden, true);
});

test('custom input validation and home active status', () => {
  const app = mount();
  app.get('open-timer').click();
  app.get('minutes').value = '60';
  app.get('custom-start').click();
  assert.equal(app.get('input-error').hidden, false);
  app.get('minutes').value = '0';
  app.get('seconds').value = '5';
  app.get('custom-start').click();
  assert.equal(app.get('input-error').hidden, true);
  assert.equal(app.get('time-display').textContent, '00:05');
  app.get('back').click();
  assert.equal(app.get('active-section').hidden, false);
  app.get('active-timer').click();
  assert.equal(app.get('timer-page').hidden, false);
  app.advance(5_000);
  assert.equal(app.get('status-tag').textContent, '已完成');
  app.get('reset-timer').click();
  assert.equal(app.get('setup-controls').hidden, false);
  assert.equal(app.get('finished-controls').hidden, true);
});

test('returning from a finished native timer shows completion and allows restart', () => {
  let status = 'finished';
  const bridge = {
    state: () => JSON.stringify({ status, duration: 3000, remaining: 0, deadline: 0 }),
    start(seconds) {
      assert.equal(seconds, 3);
      status = 'running';
      return JSON.stringify({ status, duration: 3000, remaining: 3000, deadline: 1003000 });
    }
  };
  const app = mount(bridge);
  app.get('open-timer').click();
  assert.equal(app.get('status-tag').textContent, '已完成');
  assert.equal(app.get('time-display').textContent, '00:00');
  assert.equal(app.get('running-controls').hidden, true);
  assert.equal(app.get('finished-controls').hidden, false);
  app.window.syncTimer();
  app.get('restart').click();
  assert.equal(app.get('time-display').textContent, '00:03');
  assert.equal(app.get('finished-controls').hidden, true);
});

test('exact alarm permission returns to the pending countdown', () => {
  let allowed = false;
  let requested = 0;
  let started = 0;
  const idle = JSON.stringify({ status: 'idle', duration: 0, remaining: 0, deadline: 0, now: 0 });
  const bridge = {
    state: () => idle,
    start(seconds) {
      if (!allowed) return JSON.stringify({ error: 'exact_alarm_permission' });
      started = seconds;
      return JSON.stringify({ status: 'running', duration: seconds * 1000,
        remaining: seconds * 1000, deadline: 1_000_000 + seconds * 1000, now: 1_000_000 });
    },
    requestExactAlarmPermission() { requested++; }
  };
  const app = mount(bridge);
  app.get('open-timer').click();
  app.quick[0].click();
  assert.equal(requested, 1);
  assert.equal(app.get('input-error').hidden, false);
  allowed = true;
  app.window.syncTimer();
  assert.equal(started, 180);
  assert.equal(app.get('input-error').hidden, true);
  assert.equal(app.get('time-display').textContent, '03:00');
  assert.deepEqual(app.recent(), [180]);
});
