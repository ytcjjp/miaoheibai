(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const bridge = window.AndroidAssistant;
  const poses = ['idle', 'happy', 'eating', 'playing', 'sleeping', 'hungry', 'tired'];
  const collars = ['pink', 'mint', 'gold'];
  let state = { name: '小墨', collar: 'pink', theme: 'blush', animations: true, showStats: true,
    fullness: 80, happiness: 75, energy: 85, level: 1, days: 1, sleeping: false,
    pose: 'idle', mood: '想陪你玩', message: '我在呢，今天也陪着你。' };
  let previousFocus;
  const toast = (message) => window.showAppToast(message);

  function render() {
    const pose = poses.includes(state.pose) ? state.pose : 'idle';
    const collar = collars.includes(state.collar) ? state.collar : 'pink';
    const image = `cat/cat_${pose}_${collar}.png`;
    $('cat-name').textContent = state.name;
    $('cat-level').textContent = `亲密度 Lv.${state.level}`;
    $('cat-mood').textContent = state.mood;
    $('cat-message').textContent = state.message;
    $('cat-image').src = image;
    $('cat-image').alt = `${state.name}，${state.mood}`;
    $('cat-home-image').src = `cat/cat_${state.sleeping ? 'sleeping' : 'idle'}_${collar}.png`;
    $('cat-home-caption').textContent = `${state.name} · Lv.${state.level}`;
    $('pet-cat').setAttribute('aria-label', `摸摸${state.name}`);
    $('cat-stage').dataset.pose = pose;
    $('cat-page').classList.toggle('motion-off', state.animations === false);
    for (const key of ['fullness', 'happiness', 'energy']) {
      const value = Math.max(0, Math.min(100, Math.round(Number(state[key]) || 0)));
      $(`cat-${key}`).value = value;
      $(`cat-${key}-value`).textContent = String(value);
    }
    $('cat-rest-label').textContent = state.sleeping ? '叫醒' : '睡觉';
    $('cat-rest-icon').src = `icons/${state.sleeping ? 'sun' : 'moon'}.svg`;
    $('cat-days').textContent = `这是我们相伴的第 ${state.days} 天`;
  }
  function accept(raw) {
    try {
      const result = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (result.error) { toast(result.error); return false; }
      if (!result.name || !poses.includes(result.pose)) throw new Error('invalid state');
      state = result;
      render();
      return true;
    } catch (_) { toast('小黑猫的状态读取失败，请稍后重试'); return false; }
  }
  window.refreshCat = function () {
    if (!bridge || !bridge.catState) { render(); return; }
    try { accept(bridge.catState()); } catch (_) { toast('暂时没有联系上小黑猫，请重试'); }
  };
  function interact(action) {
    if (!bridge || !bridge.catAction) { toast('小黑猫互动在安卓安装版中可用'); return; }
    try {
      if (accept(bridge.catAction(action))) {
        $('pet-cat').classList.remove('cat-bounce');
        void $('pet-cat').offsetWidth;
        $('pet-cat').classList.add('cat-bounce');
      }
    } catch (_) { toast('互动未完成，请再试一次'); }
  }
  window.openCatSettings = function () {
    window.refreshCat();
    previousFocus = document.activeElement;
    $('cat-nickname').value = state.name;
    document.querySelectorAll('[name="cat-collar"]').forEach((node) => { node.checked = node.value === state.collar; });
    document.querySelectorAll('[name="cat-theme"]').forEach((node) => { node.checked = node.value === state.theme; });
    $('cat-animations').checked = state.animations !== false;
    $('cat-show-stats').checked = state.showStats !== false;
    $('cat-settings-error').hidden = true;
    $('cat-settings-overlay').hidden = false;
    document.body.classList.add('sheet-open');
    $('close-cat-settings').focus();
  };
  function closeSettings() {
    $('cat-settings-overlay').hidden = true;
    document.body.classList.remove('sheet-open');
    if (previousFocus && document.contains(previousFocus)) previousFocus.focus();
  }
  window.catBack = function () {
    if ($('cat-settings-overlay').hidden) return false;
    closeSettings();
    return true;
  };
  $('cat-settings-form').addEventListener('submit', (event) => {
    event.preventDefault();
    $('cat-settings-error').hidden = true;
    const name = $('cat-nickname').value.trim();
    if (!name || Array.from(name).length > 12) {
      $('cat-settings-error').textContent = '昵称请输入 1 到 12 个字';
      $('cat-settings-error').hidden = false;
      return;
    }
    if (!bridge || !bridge.saveCatSettings) { toast('小黑猫设置在安卓安装版中可用'); return; }
    const settings = { name, collar: document.querySelector('[name="cat-collar"]:checked').value,
      theme: document.querySelector('[name="cat-theme"]:checked').value,
      animations: $('cat-animations').checked, showStats: $('cat-show-stats').checked };
    try {
      const result = JSON.parse(bridge.saveCatSettings(JSON.stringify(settings)));
      if (result.error) { $('cat-settings-error').textContent = result.error; $('cat-settings-error').hidden = false; return; }
      if (accept(result)) { closeSettings(); toast('小黑猫的设置已保存'); }
    } catch (_) { toast('设置保存失败，请重试'); }
  });
  document.querySelectorAll('[data-cat-action]').forEach((button) => button.addEventListener('click', () => interact(button.dataset.catAction)));
  $('pet-cat').addEventListener('click', () => interact('pet'));
  $('pet-cat').addEventListener('animationend', () => $('pet-cat').classList.remove('cat-bounce'));
  $('open-cat-settings').addEventListener('click', window.openCatSettings);
  $('close-cat-settings').addEventListener('click', closeSettings);
  $('pin-cat-widget').addEventListener('click', () => {
    if (!bridge || !bridge.addCatWidget) { toast('请在安卓安装版中添加桌面小黑猫'); return; }
    try { bridge.addCatWidget(); } catch (_) { toast('添加未完成，请从桌面的小组件列表添加'); }
  });
  $('cat-focus').addEventListener('click', () => window.openAssistantPage('timer'));
  $('cat-tasks').addEventListener('click', () => window.openAssistantPage('tasks'));
  document.addEventListener('keydown', (event) => {
    if ($('cat-settings-overlay').hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); closeSettings(); }
    if (event.key === 'Tab') {
      const controls = Array.from($('cat-settings-overlay').querySelectorAll('button,input')).filter((node) => !node.disabled && node.getClientRects().length);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  window.refreshCat();
  setInterval(() => { if (!$('cat-page').hidden && !document.hidden) window.refreshCat(); }, 5000);
})();
