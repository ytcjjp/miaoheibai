(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LuckyCore = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  const pair = value => String(value).padStart(2, '0');
  const dayKey = date => `${date.getFullYear()}-${pair(date.getMonth() + 1)}-${pair(date.getDate())}`;
  function systemUint32() {
    const values = new Uint32Array(1);
    globalThis.crypto.getRandomValues(values);
    return values[0];
  }
  function randomInt(bound, source = systemUint32) {
    if (!Number.isInteger(bound) || bound < 1 || bound > 0x100000000) throw new Error('Invalid random range');
    // Reject the incomplete tail so modulo does not favor some numbers.
    const limit = Math.floor(0x100000000 / bound) * bound;
    for (let attempt = 0; attempt < 128; attempt++) {
      const value = source();
      if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new Error('Invalid random source');
      if (value < limit) return value % bound;
    }
    throw new Error('Random source unavailable');
  }
  function draw(source) {
    const seven = Array.from({ length: 7 }, () => randomInt(10, source));
    const pool = Array.from({ length: 33 }, (_, i) => i + 1);
    for (let i = 0; i < 6; i++) {
      const j = i + randomInt(pool.length - i, source);
      const held = pool[i]; pool[i] = pool[j]; pool[j] = held;
    }
    return { seven, red: pool.slice(0, 6).sort((a, b) => a - b), blue: randomInt(16, source) + 1 };
  }
  function generate(previous, source) {
    for (let attempt = 0; attempt < 16; attempt++) {
      const next = draw(source);
      if (!previous || (next.seven.join('') !== previous.seven.join('')
          && (next.red.join(',') !== previous.red.join(',') || next.blue !== previous.blue))) return next;
    }
    throw new Error('Random source unavailable');
  }
  function valid(record, date) {
    if (!record || record.version !== 1 || record.day !== date || !Number.isFinite(record.updatedAt)
        || record.updatedAt <= 0 || dayKey(new Date(record.updatedAt)) !== date) return false;
    const numbers = record.numbers;
    return !!numbers && Array.isArray(numbers.seven) && numbers.seven.length === 7
      && numbers.seven.every(n => Number.isInteger(n) && n >= 0 && n <= 9)
      && Array.isArray(numbers.red) && numbers.red.length === 6
      && numbers.red.every((n, i) => Number.isInteger(n) && n >= 1 && n <= 33 && (!i || n > numbers.red[i - 1]))
      && Number.isInteger(numbers.blue) && numbers.blue >= 1 && numbers.blue <= 16;
  }
  return { pair, dayKey, randomInt, draw, generate, valid };
});
