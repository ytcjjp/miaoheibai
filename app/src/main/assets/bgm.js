(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const bridge = window.AndroidAssistant;
  let state = { title: '轻柔 BGM', status: 'stopped', volume: 35, error: '' };
  let volumeTimer;
  let refreshTimer;

  function render() {
    const active = state.status === 'playing' || state.status === 'loading';
    $('bgm-title').textContent = state.title || '轻柔 BGM';
    $('bgm-status').textContent = state.error || (state.status === 'playing' ? '随机播放'
      : state.status === 'loading' ? '正在准备音乐…' : state.status === 'paused' ? '已暂停 · 随机轮播' : '点击播放 · 随机轮播');
    $('bgm-toggle-icon').src = `icons/${active ? 'pause' : 'play'}.svg`;
    $('bgm-toggle').setAttribute('aria-label', active ? '暂停背景音乐' : '播放背景音乐');
    $('bgm-toggle').title = active ? '暂停背景音乐' : '播放背景音乐';
    $('bgm-next').disabled = state.status === 'loading';
    if (document.activeElement !== $('bgm-volume')) {
      const volume = Math.max(0, Math.min(100, Number(state.volume) || 0));
      $('bgm-volume').value = String(volume);
      $('bgm-volume-value').textContent = `${volume}%`;
    }
  }
  window.applyBgmState = function (value) {
    try {
      const result = typeof value === 'string' ? JSON.parse(value) : value;
      if (result.error && !result.status) {
        state.error = result.error;
        window.showAppToast(result.error);
      } else if (['playing', 'paused', 'loading', 'stopped'].includes(result.status)) state = result;
      render();
    } catch (_) { window.showAppToast('音乐状态读取失败，请重试'); }
  };
  window.refreshBgm = function () {
    if (!bridge || !bridge.bgmState) { render(); return; }
    try { window.applyBgmState(bridge.bgmState()); } catch (_) { $('bgm-status').textContent = '音乐状态暂时不可用'; }
  };
  function command(action) {
    if (!bridge || !bridge.bgmControl) { window.showAppToast('请在安卓安装版中播放背景音乐'); return; }
    try {
      bridge.bgmControl(action);
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(window.refreshBgm, 200);
    } catch (_) { window.showAppToast('音乐操作未完成，请重试'); }
  }
  $('bgm-toggle').addEventListener('click', () => command('toggle'));
  $('bgm-next').addEventListener('click', () => command('next'));
  function saveVolume() {
    if (!bridge || !bridge.bgmVolume) return;
    try { window.applyBgmState(bridge.bgmVolume(Number($('bgm-volume').value))); }
    catch (_) { window.showAppToast('音量设置未保存，请重试'); }
  }
  $('bgm-volume').addEventListener('input', () => {
    $('bgm-volume-value').textContent = `${$('bgm-volume').value}%`;
    clearTimeout(volumeTimer);
    volumeTimer = setTimeout(saveVolume, 80);
  });
  $('bgm-volume').addEventListener('change', () => { clearTimeout(volumeTimer); saveVolume(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) window.refreshBgm(); });
  window.refreshBgm();
  setInterval(() => { if (!$('cat-page').hidden && !document.hidden) window.refreshBgm(); }, 1000);
})();
