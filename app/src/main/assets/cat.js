(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const bridge = window.AndroidAssistant;
  const poses = ['idle', 'happy', 'eating', 'playing', 'sleeping', 'hungry', 'tired'];
  const collars = ['pink', 'mint', 'gold'];
  let state = { name: '小墨', collar: 'pink', whiteName: '小银', whiteCollar: 'mint', theme: 'blush', animations: true, showStats: true,
    fullness: 80, happiness: 75, energy: 85, level: 1, days: 1, sleeping: false,
    pose: 'idle', mood: '想陪你玩', message: '小银靠过来啦，我们一起陪着你。' };
  let previousFocus;
  const toast = (message) => window.showAppToast(message);

  function render() {
    const pose = poses.includes(state.pose) ? state.pose : 'idle';
    const collar = collars.includes(state.collar) ? state.collar : 'pink';
    const whiteName = state.whiteName || '小银';
    const whiteCollar = collars.includes(state.whiteCollar) ? state.whiteCollar : 'mint';
    const suffix = whiteCollar === 'mint' ? '' : `_${whiteCollar}`;
    const image = `cat/cat_${pose}_${collar}${suffix}.svg`;
    const pairName = `${state.name}和${whiteName}`;
    $('cat-name').textContent = pairName;
    $('cat-level').textContent = `亲密度 Lv.${state.level}`;
    $('cat-mood').textContent = state.mood;
    $('cat-message').textContent = state.message;
    $('cat-image').src = image;
    $('cat-image').alt = `纯黑猫${state.name}和银渐层白猫${whiteName}贴在一起，${state.mood}`;
    $('cat-home-image').src = `cat/cat_${state.sleeping ? 'sleeping' : 'idle'}_${collar}${suffix}.svg`;
    $('lucky-cat').src = `cat/cat_happy_${collar}${suffix}.svg`;
    $('lucky-cat').alt = `一起送来好运的${pairName}`;
    $('cat-home-caption').textContent = `${pairName} · Lv.${state.level}`;
    $('pet-cat').setAttribute('aria-label', `摸摸${pairName}`);
    $('pet-cat').title = `摸摸${pairName}`;
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
    } catch (_) { toast('猫咪伙伴的状态读取失败，请稍后重试'); return false; }
  }
  window.refreshCat = function () {
    if (!bridge || !bridge.catState) { render(); return; }
    try { accept(bridge.catState()); } catch (_) { toast('暂时没有联系上猫咪伙伴，请重试'); }
  };
  function interact(action) {
    if (!bridge || !bridge.catAction) { toast('猫咪互动在安卓安装版中可用'); return; }
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
    $('cat-white-nickname').value = state.whiteName || '小银';
    document.querySelectorAll('[name="cat-collar"]').forEach((node) => { node.checked = node.value === state.collar; });
    document.querySelectorAll('[name="cat-white-collar"]').forEach((node) => { node.checked = node.value === (state.whiteCollar || 'mint'); });
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
    const whiteName = $('cat-white-nickname').value.trim();
    for (const [label, value] of [['小黑', name], ['小白', whiteName]]) {
      if (!value || Array.from(value).length > 12 || /[\u0000-\u001f\u007f-\u009f]/.test(value)) {
        $('cat-settings-error').textContent = `${label}昵称请输入 1 到 12 个字`;
        $('cat-settings-error').hidden = false;
        return;
      }
    }
    if (!bridge || !bridge.saveCatSettings) { toast('猫咪设置在安卓安装版中可用'); return; }
    const settings = { name, collar: document.querySelector('[name="cat-collar"]:checked').value,
      whiteName, whiteCollar: document.querySelector('[name="cat-white-collar"]:checked').value,
      theme: document.querySelector('[name="cat-theme"]:checked').value,
      animations: $('cat-animations').checked, showStats: $('cat-show-stats').checked };
    try {
      const result = JSON.parse(bridge.saveCatSettings(JSON.stringify(settings)));
      if (result.error) { $('cat-settings-error').textContent = result.error; $('cat-settings-error').hidden = false; return; }
      if (accept(result)) { closeSettings(); toast('猫咪伙伴的设置已保存'); }
    } catch (_) { toast('设置保存失败，请重试'); }
  });
  document.querySelectorAll('[data-cat-action]').forEach((button) => button.addEventListener('click', () => interact(button.dataset.catAction)));
  $('pet-cat').addEventListener('click', () => interact('pet'));
  $('pet-cat').addEventListener('animationend', () => $('pet-cat').classList.remove('cat-bounce'));
  $('open-cat-settings').addEventListener('click', window.openCatSettings);
  $('close-cat-settings').addEventListener('click', closeSettings);
  $('pin-cat-widget').addEventListener('click', () => {
    if (!bridge || !bridge.addCatWidget) { toast('请在安卓安装版中添加桌面猫咪伙伴'); return; }
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
