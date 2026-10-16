(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const core = window.LuckyCore;
  const key = 'miaohb-lucky-v1';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let record = null, pending = null, finishTimer, rollTimer;
  const slots = {};
  ['seven', 'double'].forEach(kind => {
    slots[kind] = [];
    for (let i = 0; i < 7; i++) {
      const ball = document.createElement('span');
      ball.className = 'lucky-ball' + (kind === 'double' && i === 6 ? ' blue' : '');
      ball.setAttribute('aria-hidden', 'true');
      const value = document.createElement('span'); value.textContent = '--';
      ball.appendChild(value); $(`lucky-${kind}`).appendChild(ball);
      slots[kind].push(value);
    }
  });
  function render(numbers) {
    numbers.seven.forEach((value, i) => { slots.seven[i].textContent = String(value); });
    numbers.red.concat(numbers.blue).forEach((value, i) => { slots.double[i].textContent = core.pair(value); });
  }
  function showRecord() {
    render(record.numbers);
    $('lucky-seven').setAttribute('aria-label', `体彩 7 位数：${record.numbers.seven.join('、')}`);
    $('lucky-double').setAttribute('aria-label', `双色球：红球 ${record.numbers.red.map(core.pair).join('、')}，蓝球 ${core.pair(record.numbers.blue)}`);
    $('lucky-updated').textContent = `${window.AssistantCore.shortTime(record.updatedAt)} 更新`;
  }
  function setBusy(busy) {
    $('lucky-results').setAttribute('aria-busy', String(busy));
    $('lucky-results').classList.toggle('drawing', busy);
    $('lucky-cat').classList.toggle('drawing', busy);
    $('refresh-lucky').disabled = busy;
    $('lucky-button-label').textContent = busy ? '正在抽取好运…' : '刷新幸运数字';
  }
  function finish() {
    if (!pending) return;
    clearTimeout(finishTimer); clearInterval(rollTimer);
    const now = new Date();
    if (pending.day !== core.dayKey(now)) {
      try { pending.numbers = core.generate(record && record.numbers); }
      catch (_) { fail(); return; }
    }
    record = { version: 1, day: core.dayKey(now), updatedAt: now.getTime(), numbers: pending.numbers };
    pending = null;
    setBusy(false); showRecord();
    $('lucky-date').textContent = window.AssistantCore.dateLabel(now);
    try {
      localStorage.setItem(key, JSON.stringify(record));
      $('lucky-status').textContent = '今天的好运，收好啦';
    } catch (_) { $('lucky-status').textContent = '好运已抽好，暂时无法保存到本机'; }
  }
  function fail() {
    pending = null;
    clearTimeout(finishTimer); clearInterval(rollTimer);
    setBusy(false);
    if (record) showRecord();
    $('lucky-status').textContent = '抽取未完成，请再试一次';
  }
  function start() {
    if (pending) return;
    try {
      pending = { day: core.dayKey(new Date()), numbers: core.generate(record && record.numbers) };
      setBusy(true);
      $('lucky-status').textContent = '小猫正在摇出你的好运…';
      if (!reducedMotion.matches) {
        render(core.draw());
        rollTimer = setInterval(() => { try { render(core.draw()); } catch (_) { fail(); } }, 85);
      }
      finishTimer = setTimeout(finish, 2000);
    } catch (_) { fail(); }
  }
  function checkDay() {
    const now = new Date();
    $('lucky-date').textContent = window.AssistantCore.dateLabel(now);
    if (pending) return;
    if (!core.valid(record, core.dayKey(now))) {
      try {
        const cached = JSON.parse(localStorage.getItem(key) || 'null');
        record = core.valid(cached, core.dayKey(now)) ? cached : null;
      } catch (_) { record = null; }
      if (!record) { start(); return; }
    }
    showRecord();
    $('lucky-status').textContent = '今天的好运，收好啦';
  }
  window.openLucky = checkDay;
  $('refresh-lucky').addEventListener('click', start);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) finish();
    else if (!$('lucky-page').hidden) checkDay();
  });
  setInterval(() => {
    if (!document.hidden && !$('lucky-page').hidden && !pending
        && (!record || record.day !== core.dayKey(new Date()))) checkDay();
  }, 1000);
})();
