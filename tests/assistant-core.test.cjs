const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../app/src/main/assets/assistant-core.js');

test('24-hour clock, requested date format and midnight rollover', () => {
  const date = new Date(2026, 9, 15, 23, 59, 59);
  assert.equal(core.dateLabel(date), '10/15 周四');
  assert.equal(core.timeLabel(date), '23:59:59');
  date.setSeconds(date.getSeconds() + 1);
  assert.equal(core.dateLabel(date), '10/16 周五');
  assert.equal(core.timeLabel(date), '00:00:00');
});

test('date input roundtrips and countdown never goes negative', () => {
  const value = '2026-10-16T15:04';
  assert.equal(core.inputDate(core.parseDate(value)), value);
  assert.throws(() => core.parseDate('2026-02-31T12:00'));
  assert.equal(core.countdown(1000, 1000), '已到时间');
  assert.equal(core.countdown(0, 1000), '已到时间');
  assert.equal(core.countdown(86401000, 0), '1 天 00:00:01');
});

test('notes validate content and edits preserve identity', () => {
  const note = core.makeItem('notes', { title: '  小记  ', body: '内容' }, null, 1000);
  assert.equal(note.title, '小记');
  const edit = core.makeItem('notes', { title: '改过', body: '新内容' }, note, 2000);
  assert.equal(edit.id, note.id);
  assert.equal(core.upsert(core.upsert(core.empty(), 'notes', note), 'notes', edit).notes.length, 1);
  assert.throws(() => core.makeItem('notes', { title: ' ', body: '' }, null, 1000));
  assert.throws(() => core.makeItem('events', { title: '纪念日' }, null, 1000));
  assert.throws(() => core.makeItem('events', { title: '纪念日', dueAt: Infinity }, null, 1000));
});

test('task filters and deadline ordering do not mutate stored lists', () => {
  const data = core.empty();
  data.tasks = [
    { id: 'a', title: '未设置', body: '', dueAt: 0, done: false, updatedAt: 1 },
    { id: 'b', title: '已完成', body: '', dueAt: 10, done: true, updatedAt: 2 },
    { id: 'c', title: '买猫粮', body: '白猫', dueAt: 20, done: false, updatedAt: 3 }
  ];
  assert.deepEqual(core.rows(data, 'tasks', '', 'pending', 0).map(x => x.id), ['c', 'a']);
  assert.deepEqual(core.rows(data, 'tasks', '', 'done', 0).map(x => x.id), ['b']);
  assert.deepEqual(core.rows(data, 'tasks', '白猫', 'all', 0).map(x => x.id), ['c']);
  assert.deepEqual(data.tasks.map(x => x.id), ['a', 'b', 'c']);
});

test('calendar imports deduplicate recurring event occurrences separately', () => {
  const event = { sourceId: '1_100000', title: '约定', body: '', dueAt: 100000 };
  const first = core.imported(core.empty(), 'events', event, 1);
  assert.throws(() => core.imported(first, 'events', event, 2), /已经导入/);
  const second = core.imported(first, 'events', { ...event, sourceId: '1_200000', dueAt: 200000 }, 3);
  assert.equal(second.events.length, 2);
});

test('weather codes distinguish snow, rain, fog and unknown weather', () => {
  assert.equal(core.weather(0).label, '晴');
  assert.equal(core.weather(86).icon, 'cloud-snow');
  assert.equal(core.weather(67).icon, 'cloud-rain');
  assert.equal(core.weather(45).icon, 'cloud-fog');
  assert.equal(core.weather(99).label, '雷雨');
  assert.equal(core.weather(-1).label, '天气未知');
});
