const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const core = require('../app/src/main/assets/lucky-core.js');
const source = () => randomBytes(4).readUInt32LE();

test('seven digits retain zeros and may repeat; double-color bounds, uniqueness and order', () => {
  const zeros = core.draw(() => 0);
  assert.equal(zeros.seven.join(''), '0000000');
  assert.deepEqual(zeros.red, [1, 2, 3, 4, 5, 6]);
  assert.equal(zeros.blue, 1);
  const nines = core.draw(() => 9);
  assert.equal(nines.seven.join(''), '9999999');
  for (let i = 0; i < 3000; i++) {
    const numbers = core.draw(source);
    const date = new Date(2026, 9, 16, 10);
    assert.ok(core.valid({ version: 1, day: '2026-10-16', updatedAt: date.getTime(), numbers }, '2026-10-16'));
  }
});

test('uniform integer rejects the modulo tail and detects broken entropy', () => {
  const values = [0xffffffff, 0xfffffffe, 9];
  assert.equal(core.randomInt(10, () => values.shift()), 9);
  assert.equal(core.randomInt(16, () => 0xffffffff), 15);
  assert.throws(() => core.randomInt(10, () => 0xffffffff));
  assert.throws(() => core.randomInt(10, () => -1));
  assert.throws(() => core.randomInt(0, source));
});

test('refresh changes both games and does not loop forever on a broken source', () => {
  let previous = core.draw(source);
  for (let i = 0; i < 100; i++) {
    const next = core.generate(previous, source);
    assert.notDeepEqual(next.seven, previous.seven);
    assert.ok(next.blue !== previous.blue || next.red.join(',') !== previous.red.join(','));
    previous = next;
  }
  assert.throws(() => core.generate(core.draw(() => 0), () => 0));
});

test('daily records validate local date, timestamp and every number before reuse', () => {
  const record = { version: 1, day: '2026-10-16', updatedAt: new Date(2026, 9, 16, 23, 59).getTime(), numbers: core.draw(source) };
  assert.ok(core.valid(record, '2026-10-16'));
  assert.equal(core.valid(record, '2026-10-17'), false);
  assert.equal(core.dayKey(new Date(2026, 9, 17, 0, 0)), '2026-10-17');
  for (const mutate of [
    value => { value.numbers.red = [1, 1, 2, 3, 4, 5]; },
    value => { value.numbers.red = [1, 2, 3, 4, 5, 34]; },
    value => { value.numbers.blue = 17; },
    value => { value.numbers.seven[0] = 10; },
    value => { value.numbers.seven.pop(); },
    value => { value.updatedAt = 1; },
    value => { value.version = 2; }
  ]) {
    const invalid = JSON.parse(JSON.stringify(record)); mutate(invalid);
    assert.equal(core.valid(invalid, record.day), false);
  }
});
