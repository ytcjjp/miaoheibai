(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const keys = ['hours', 'minutes', 'seconds'];
  const MAX_SECONDS = 359999;
  let timer = { status: 'idle', duration: 0, remaining: 0, deadline: 0, now: Date.now() };
  let sampledAt = performance.now();
  let pendingStart = null;
  let toastTimeout;

  // The browser implementation makes the UI previewable; Android owns real alarms and vibration.
  const browserBridge = {
    state() {
      const saved = JSON.parse(localStorage.getItem('preview-timer') || 'null') || timer;
      if (saved.status === 'running') {
        saved.remaining = Math.max(0, saved.deadline - Date.now());
        if (saved.remaining === 0) saved.status = 'finished';
        localStorage.setItem('preview-timer', JSON.stringify(saved));
      }
      return JSON.stringify({ ...saved, now: Date.now() });
    },
    start(seconds) {
      const duration = seconds * 1000;
      const value = { status: 'running', duration, remaining: duration, deadline: Date.now() + duration };
      localStorage.setItem('preview-timer', JSON.stringify(value));
      return this.state();
    },
    pause() {
      const value = JSON.parse(this.state());
      if (value.status === 'running') {
        value.status = 'paused';
        value.deadline = 0;
        localStorage.setItem('preview-timer', JSON.stringify(value));
      }
      return this.state();
    },
    resume() {
      const value = JSON.parse(this.state());
      if (value.status === 'paused') {
        value.status = 'running';
        value.deadline = Date.now() + value.remaining;
        localStorage.setItem('preview-timer', JSON.stringify(value));
      }
      return this.state();
    },
    cancel() {
      localStorage.removeItem('preview-timer');
      return JSON.stringify({ status: 'idle', duration: 0, remaining: 0, deadline: 0, now: Date.now() });
    }
  };
  const bridge = window.AndroidTimer || browserBridge;

  function read(method, ...args) {
    try { return JSON.parse(bridge[method](...args)); }
    catch (_) { showToast('操作失败，请重试。'); return { error: 'unknown' }; }
  }

  function applyState(next) {
    if (next.error) return false;
    if (timer.status !== 'finished' && next.status === 'finished') showToast('倒计时结束');
    timer = next;
    sampledAt = performance.now();
    render();
    return true;
  }

  function timeLeft() {
    return timer.status === 'running'
      ? Math.max(0, timer.remaining - (performance.now() - sampledAt))
      : timer.remaining;
  }

  function formatTime(ms) {
    const total = Math.ceil(Math.max(0, ms) / 1000);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor(total % 3600 / 60);
    const seconds = total % 60;
    const pair = (n) => String(n).padStart(2, '0');
    return hours ? `${pair(hours)}:${pair(minutes)}:${pair(seconds)}` : `${pair(minutes)}:${pair(seconds)}`;
  }

  function inputSeconds() {
    const values = keys.map((key) => $(key).value.trim());
    if (values.some((v) => v !== '' && !/^\d+$/.test(v))) return null;
    const [hours, minutes, seconds] = values.map((v) => Number(v || 0));
    if (hours > 99 || minutes > 59 || seconds > 59) return null;
    const total = hours * 3600 + minutes * 60 + seconds;
    return total > 0 && total <= MAX_SECONDS ? total : null;
  }

  function recent() {
    try { return JSON.parse(localStorage.getItem('recent-durations') || '[]'); }
    catch (_) { return []; }
  }

  function saveRecent(seconds) {
    localStorage.setItem('recent-durations', JSON.stringify(
      [seconds, ...recent().filter((n) => n !== seconds)].slice(0, 5)));
    renderRecent();
  }

  function renderRecent() {
    const list = $('recent-list');
    while (list.firstChild) list.removeChild(list.firstChild);
    const entries = recent();
    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = '还没有使用记录';
      list.appendChild(empty);
      return;
    }
    entries.forEach((seconds) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'recent-item';
      const icon = document.createElement('span');
      icon.className = 'mini-clock';
      icon.textContent = '◷';
      const name = document.createElement('strong');
      name.textContent = formatTime(seconds * 1000);
      const label = document.createElement('small');
      label.textContent = '再次计时';
      const arrow = document.createElement('span');
      arrow.className = 'chevron';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '›';
      row.append(icon, name, label, arrow);
      row.addEventListener('click', () => { showTimer(); begin(seconds); });
      list.appendChild(row);
    });
  }

  function showToast(message) {
    const toast = $('toast');
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => { toast.hidden = true; }, 3500);
  }

  function showTimer() {
    if (window.showAppPage) window.showAppPage('timer-page');
    $('home').hidden = true;
    $('timer-page').hidden = false;
    window.scrollTo(0, 0);
    render();
  }

  window.goHome = function () {
    if (window.assistantBack && window.assistantBack()) return true;
    if ($('timer-page').hidden) return false;
    $('timer-page').hidden = true;
    $('home').hidden = false;
    window.scrollTo(0, 0);
    render();
    return true;
  };

  function requestPermission() {
    $('input-error').hidden = false;
    $('input-error').textContent = '请允许“闹钟和提醒”权限，然后返回应用。';
    showToast('需要精确闹钟权限才能在锁屏后准时提醒');
    if (bridge.requestExactAlarmPermission) bridge.requestExactAlarmPermission();
  }

  function begin(seconds) {
    if (!Number.isInteger(seconds) || seconds <= 0 || seconds > MAX_SECONDS) {
      $('input-error').hidden = false;
      $('input-error').textContent = '请输入 1 秒到 99 小时 59 分 59 秒之间的时间。';
      return;
    }
    $('input-error').hidden = true;
    const next = read('start', seconds);
    if (next.error === 'exact_alarm_permission') { pendingStart = seconds; requestPermission(); return; }
    if (applyState(next)) { pendingStart = null; saveRecent(seconds); }
  }

  function render() {
    const isRunning = timer.status === 'running';
    const isPaused = timer.status === 'paused';
    const isFinished = timer.status === 'finished';
    const active = isRunning || isPaused;
    const left = timeLeft();
    const preview = inputSeconds() || 0;
    const shown = active ? left : isFinished ? 0 : preview * 1000;
    $('time-display').textContent = formatTime(shown);
    $('active-section').hidden = !active;
    $('active-description').textContent = isPaused ? '倒计时已暂停' : '倒计时进行中';
    $('active-time').textContent = formatTime(left);
    $('tool-subtitle').textContent = active ? (isPaused ? '已暂停 · 点击继续查看' : '正在计时 · 点击查看') : '专注每一分钟';
    $('status-tag').textContent = isRunning ? '进行中' : isPaused ? '已暂停' : isFinished ? '已完成' : '准备开始';
    $('status-tag').className = 'status-tag' + (isRunning ? ' running' : isPaused ? ' paused' : '');
    $('dial-caption').textContent = isRunning ? '剩余时间' : isPaused ? '暂停中' : isFinished ? '已完成' : '设定时间';
    $('dial-sub').textContent = isRunning ? '保持专注' : isPaused ? '点击继续计时' : isFinished ? '本次倒计时结束' : '准备好就开始';
    $('dial-progress').style.strokeDashoffset = String(747.7 * (1 - (active && timer.duration ? left / timer.duration : isFinished ? 0 : 1)));
    $('setup-controls').hidden = active || isFinished;
    $('running-controls').hidden = !active;
    $('finished-controls').hidden = !isFinished;
    $('pause-resume').textContent = isPaused ? '继续倒计时' : '暂停';
  }

  window.syncTimer = function () {
    if (pendingStart != null) {
      const next = read('start', pendingStart);
      if (!next.error) {
        const seconds = pendingStart;
        pendingStart = null;
        $('input-error').hidden = true;
        saveRecent(seconds);
        applyState(next);
        return;
      }
    }
    applyState(read('state'));
  };

  const today = new Date();
  $('today').textContent = `${today.getMonth() + 1}/${today.getDate()} 周${'日一二三四五六'[today.getDay()]}`;
  window.showAppToast = showToast;
  $('open-timer').addEventListener('click', showTimer);
  $('active-timer').addEventListener('click', showTimer);
  $('back').addEventListener('click', window.goHome);
  $('custom-start').addEventListener('click', () => begin(inputSeconds()));
  document.querySelectorAll('.quick-button').forEach((button) =>
    button.addEventListener('click', () => begin(Number(button.dataset.seconds))));
  keys.forEach((key) => $(key).addEventListener('input', () => {
    $('input-error').hidden = true;
    render();
  }));
  $('pause-resume').addEventListener('click', () => {
    const next = read(timer.status === 'paused' ? 'resume' : 'pause');
    if (next.error === 'exact_alarm_permission') { requestPermission(); return; }
    applyState(next);
  });
  $('cancel').addEventListener('click', () => { pendingStart = null; applyState(read('cancel')); });
  $('restart').addEventListener('click', () => begin(Math.round(timer.duration / 1000)));
  $('reset-timer').addEventListener('click', () => { pendingStart = null; applyState(read('cancel')); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) window.syncTimer(); });
  renderRecent();
  window.syncTimer();
  setInterval(() => {
    if (timer.status === 'running') window.syncTimer();
    else render();
  }, 250);
})();
