(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const core = window.AssistantCore;
  const native = window.AndroidAssistant;
  const labels = { notes: '备忘录', tasks: '待办事项', events: '日期倒计时' };
  const icons = { notes: 'notebook-pen', tasks: 'list-todo', events: 'calendar-days' };
  let planner = core.empty();
  let weather = {};
  let type = 'notes';
  let filter = 'pending';
  let editing = null;
  let originalForm = '';
  let confirmMode = 'delete';
  let focusBeforeSheet;
  let calendarType = 'tasks';
  let lastMinute = -1;
  let loaded = false;
  let lastWeatherAttempt = 0;
  const toast = (message) => window.showAppToast(message);

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function el(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }
  function icon(name) {
    const img = el('img');
    img.src = `icons/${name}.svg`;
    img.alt = '';
    return img;
  }
  function call(method, args, topic) {
    if (!native) {
      window.onAssistantResult(topic || 'message', { error: '这个功能需要在安卓安装版中使用' });
      return;
    }
    try { native[method](...(args || [])); }
    catch (_) { window.onAssistantResult(topic || 'message', { error: '操作未完成，请重试' }); }
  }
  function load() {
    try {
      const data = native ? JSON.parse(native.data())
        : { planner: JSON.parse(localStorage.getItem('assistant-planner') || 'null') || core.empty(), weather: {} };
      if (!data.planner || !['notes', 'tasks', 'events'].every((key) => Array.isArray(data.planner[key])))
        throw new Error('invalid data');
      planner = data.planner;
      weather = data.weather || {};
      loaded = true;
    } catch (_) { loaded = false; toast('记录读取失败，请重新打开应用后重试'); }
  }
  function persist(next) {
    if (!loaded) { toast('记录尚未读取成功，请重新打开应用后再保存'); return false; }
    try {
      if (native) {
        const result = JSON.parse(native.savePlanner(JSON.stringify(next)));
        if (!result.ok) throw new Error(result.error || '保存失败');
      } else localStorage.setItem('assistant-planner', JSON.stringify(next));
      planner = next;
      renderHome();
      renderPlanner();
      return true;
    } catch (error) { toast(error.message || '保存失败，请检查可用空间'); return false; }
  }

  window.showAppPage = function (id) {
    document.querySelectorAll('.page').forEach((page) => { page.hidden = page.id !== id; });
    window.scrollTo(0, 0);
  };
  window.openAssistantPage = function (page) {
    if (labels[page]) {
      type = page;
      $('planner-title').textContent = labels[type];
      $('planner-search').value = '';
      $('planner-search').placeholder = `搜索${labels[type]}`;
      $('calendar-actions').hidden = type === 'notes';
      $('task-filters').hidden = type !== 'tasks';
      $('add-item').setAttribute('aria-label', `新增${labels[type]}`);
      $('add-item').title = `新增${labels[type]}`;
      window.showAppPage('planner-page');
      renderPlanner();
    } else if (page === 'timer') {
      window.showAppPage('timer-page');
      window.syncTimer();
    } else if (page === 'weather') {
      window.showAppPage('weather-page');
      renderWeather();
    } else if (page === 'lucky') {
      window.showAppPage('lucky-page');
      if (window.openLucky) window.openLucky();
    } else if (page === 'cat' || page === 'cat-settings') {
      window.showAppPage('cat-page');
      if (window.refreshCat) window.refreshCat();
      if (window.refreshBgm) window.refreshBgm();
      if (page === 'cat-settings' && window.openCatSettings) window.openCatSettings();
    } else window.showAppPage('home');
  };
  window.assistantBack = function () {
    if (window.catBack && window.catBack()) return true;
    if (!$('editor-overlay').hidden) { closeEditor(); return true; }
    if (!$('calendar-overlay').hidden) { closeCalendar(); return true; }
    if (!$('home').hidden) return false;
    window.showAppPage('home');
    renderHome();
    return true;
  };
  window.refreshAssistant = function () {
    load(); renderHome(); renderWeather(); renderPlanner(); updateClock();
    if (window.refreshCat) window.refreshCat();
    if (native && weather.city && Date.now() - (weather.fetchedAt || 0) > 30 * 60000
        && Date.now() - lastWeatherAttempt > 5 * 60000) refreshWeather();
  };

  function renderHome() {
    $('notes-count').textContent = planner.notes.length ? `${planner.notes.length} 条小记` : '随手记一笔';
    const pending = planner.tasks.filter((row) => !row.done).length;
    $('tasks-count').textContent = pending ? `${pending} 件事待完成` : '今天想做什么';
    $('events-count').textContent = planner.events.length ? `${planner.events.length} 个重要日子` : '记住重要日子';
    const next = core.rows(planner, 'events', '', 'all', Date.now()).find((row) => row.dueAt > Date.now());
    $('home-agenda').hidden = !next;
    if (next) {
      $('next-event-title').textContent = next.title;
      $('next-event-time').textContent = core.countdown(next.dueAt, Date.now());
      $('next-event-time').dataset.due = String(next.dueAt);
    }
  }

  function renderPlanner() {
    const list = $('planner-list');
    clear(list);
    const rows = core.rows(planner, type, $('planner-search').value, filter, Date.now());
    const pending = planner.tasks.filter((row) => !row.done).length;
    $('planner-summary').textContent = type === 'tasks' ? `${pending} 件未完成 · ${planner.tasks.length - pending} 件已完成`
      : `${planner[type].length} 条记录`;
    if (!rows.length) {
      const empty = el('div', 'list-empty');
      empty.append(icon(icons[type]), el('p', '', $('planner-search').value ? '没有找到匹配的记录' : type === 'tasks' && filter === 'done' ? '还没有完成的事项' : '还没有记录，记下第一件吧'));
      list.appendChild(empty);
      return;
    }
    rows.forEach((row) => {
      const record = el('article', 'record');
      if (type === 'tasks' && row.done) record.classList.add('done');
      if (type === 'tasks' && !row.done && row.dueAt && row.dueAt < Date.now()) record.classList.add('overdue');
      if (type === 'tasks') {
        const checkbox = el('input', 'task-check');
        checkbox.type = 'checkbox'; checkbox.checked = row.done;
        checkbox.setAttribute('aria-label', `${row.done ? '恢复待办' : '完成'}：${row.title}`);
        checkbox.addEventListener('change', () => {
          const item = { ...row, done: checkbox.checked, updatedAt: Date.now() };
          if (!persist(core.upsert(planner, 'tasks', item))) checkbox.checked = row.done;
        });
        record.appendChild(checkbox);
      }
      const button = el('button', 'record-open'); button.type = 'button';
      const heading = el('span', 'record-title'); heading.append(el('strong', '', row.title), icon('pencil'));
      button.appendChild(heading);
      if (row.body) button.appendChild(el('p', 'record-body', row.body));
      if (type === 'events') {
        const remaining = el('span', 'record-countdown', core.countdown(row.dueAt, Date.now()));
        remaining.dataset.countdown = String(row.dueAt);
        button.appendChild(remaining);
      }
      const metadata = type === 'notes' ? core.shortTime(row.updatedAt)
        : row.dueAt ? `${type === 'tasks' && !row.done && row.dueAt < Date.now() ? '已逾期 · ' : ''}${core.shortTime(row.dueAt)}` : '未设置截止时间';
      button.appendChild(el('span', 'record-meta', metadata + (row.sourceId ? ' · 来自日历' : '')));
      button.addEventListener('click', () => openEditor(row));
      record.appendChild(button);
      list.appendChild(record);
    });
  }

  function formValue() { return JSON.stringify([$('item-title').value, $('item-body').value, $('item-date').value]); }
  function openSheet(id) {
    focusBeforeSheet = document.activeElement;
    $(id).hidden = false;
    document.body.classList.add('sheet-open');
  }
  function closeSheet(id) {
    $(id).hidden = true;
    if ($('editor-overlay').hidden && $('calendar-overlay').hidden) document.body.classList.remove('sheet-open');
    if (focusBeforeSheet && document.contains(focusBeforeSheet)) focusBeforeSheet.focus();
  }
  function openEditor(row) {
    editing = row || null;
    $('editor-heading').textContent = `${row ? '编辑' : '新增'}${labels[type]}`;
    $('item-title').value = row ? row.title : '';
    $('item-body').value = row ? row.body : '';
    $('item-date').value = row ? core.inputDate(row.dueAt) : '';
    $('item-date-field').hidden = type === 'notes';
    $('item-date-label').textContent = type === 'events' ? '目标日期与时间' : '截止时间（可选）';
    $('item-date').required = type === 'events';
    $('item-calendar').hidden = type === 'notes';
    $('calendar-save-note').hidden = type === 'notes';
    $('delete-item').hidden = !row;
    $('delete-confirm').hidden = true;
    $('item-error').hidden = true;
    originalForm = formValue();
    openSheet('editor-overlay');
    $('close-editor').focus();
  }
  function closeEditor(force) {
    if (!force && originalForm !== formValue()) { confirmAction('discard'); return; }
    closeSheet('editor-overlay');
    editing = null;
  }
  function confirmAction(mode) {
    confirmMode = mode;
    $('delete-confirm').querySelector('p').textContent = mode === 'discard' ? '修改还没保存，要放弃吗？' : '删除这条记录？';
    $('confirm-delete').textContent = mode === 'discard' ? '放弃修改' : '确认删除';
    $('cancel-delete').textContent = mode === 'discard' ? '继续编辑' : '保留';
    $('delete-confirm').hidden = false;
  }
  function saveEditor(toCalendar) {
    try {
      const item = core.makeItem(type, { title: $('item-title').value, body: $('item-body').value,
        dueAt: core.parseDate($('item-date').value) }, editing, Date.now());
      if (toCalendar && !item.dueAt) throw new Error('加入日历需要先设置日期和时间');
      if (!persist(core.upsert(planner, type, item))) return;
      closeEditor(true);
      if (toCalendar) call('exportCalendar', [JSON.stringify(item)]);
      else toast('已保存');
    } catch (error) { $('item-error').textContent = error.message; $('item-error').hidden = false; }
  }
  function closeCalendar() { closeSheet('calendar-overlay'); }
  function renderCalendar(result) {
    clear($('calendar-list'));
    if (result.error) { $('calendar-status').textContent = result.error; return; }
    const events = result.events || [];
    $('calendar-status').textContent = events.length ? `未来 90 天 · ${events.length} 条日程（最多显示 100 条）` : '未来 90 天没有可导入的日程';
    events.forEach((event) => {
      const exists = planner[calendarType].some((row) => row.sourceId === event.sourceId);
      const button = el('button', 'city-result'); button.type = 'button'; button.disabled = exists;
      const text = el('span'); text.append(el('strong', '', event.title || '未命名日程'), el('small', '', core.shortTime(event.dueAt)));
      button.append(text, el('b', '', exists ? '已导入' : '导入'));
      button.addEventListener('click', () => {
        try {
          if (persist(core.imported(planner, calendarType, event, Date.now()))) { closeCalendar(); toast('已导入'); }
        } catch (error) { toast(error.message); }
      });
      $('calendar-list').appendChild(button);
    });
  }

  function renderWeather() {
    const city = weather.city;
    const available = Number.isFinite(weather.temperature);
    const condition = core.weather(weather.code);
    const stamp = weather.fetchedAt ? core.shortTime(weather.fetchedAt) : '';
    const stale = weather.fetchedAt && Date.now() - weather.fetchedAt > 2 * 3600000;
    $('home-weather').textContent = available ? `${city.name} ${Math.round(weather.temperature)}° · ${condition.label}` : city ? `${city.name} · 待更新` : '选择城市';
    $('home-weather-status').textContent = weather.error ? '更新失败，点此重试' : available ? `${stale ? '缓存 · ' : ''}${stamp} 更新` : '查看当前天气';
    $('home-weather-icon').src = `icons/${available ? condition.icon : 'sun'}.svg`;
    $('weather-detail-icon').src = `icons/${available ? condition.icon : 'sun'}.svg`;
    $('weather-city').textContent = city ? city.name : '还没有选择城市';
    $('weather-temperature').textContent = available ? `${Math.round(weather.temperature)}°` : '--°';
    $('weather-condition').textContent = available ? condition.label : '选择你的城市，看看今天的天气';
    $('weather-range').textContent = available ? `${Math.round(weather.low)}° / ${Math.round(weather.high)}°` : '';
    $('weather-facts').hidden = !available;
    $('weather-feels').textContent = available ? `${Math.round(weather.feelsLike)}°` : '--';
    $('weather-humidity').textContent = available ? `${weather.humidity}%` : '--';
    $('weather-wind').textContent = available ? `${weather.wind} km/h` : '--';
    $('weather-status').textContent = weather.error || (available ? `${stamp} 更新${stale ? ' · 显示缓存天气，请刷新' : ''}` : '未选择城市，不会获取天气数据');
  }
  function renderCities(result) {
    $('city-search').disabled = false;
    if (result.query && result.query !== $('city-query').value.trim()) return;
    clear($('city-results'));
    if (result.error) { $('city-results').appendChild(el('p', 'status-copy', result.error)); return; }
    if (!result.cities.length) { $('city-results').appendChild(el('p', 'status-copy', '没有找到城市，试试完整名称或拼音')); return; }
    result.cities.forEach((city) => {
      const button = el('button', 'city-result'); button.type = 'button';
      const text = el('span');
      text.append(el('strong', '', city.name), el('small', '', [city.admin1, city.country].filter(Boolean).join(' · ')));
      button.append(text, el('b', '', '选择'));
      button.addEventListener('click', () => {
        clear($('city-results'));
        $('weather-status').textContent = `正在获取${city.name}的天气…`;
        $('refresh-weather').disabled = true;
        call('selectCity', [JSON.stringify(city)], 'weather');
      });
      $('city-results').appendChild(button);
    });
  }
  function refreshWeather() {
    if (!weather.city) { window.openAssistantPage('weather'); $('city-query').focus(); return; }
    $('refresh-weather').disabled = true;
    lastWeatherAttempt = Date.now();
    $('weather-status').textContent = '正在更新天气…';
    call('refreshWeather', [], 'weather');
  }
  window.onAssistantResult = function (topic, result) {
    if (topic === 'citySearch') renderCities(result);
    else if (topic === 'weather') {
      $('refresh-weather').disabled = false;
      if (result.city) weather = result;
      renderWeather();
      if (result.error) $('weather-status').textContent = result.error;
    } else if (topic === 'calendar') renderCalendar(result);
    else if (topic === 'bgm' && window.applyBgmState) window.applyBgmState(result);
    else toast(result.error || result.message || '已完成');
  };
  function updateClock() {
    const now = new Date();
    $('today').textContent = core.dateLabel(now);
    $('home-time').textContent = core.timeLabel(now);
    document.querySelectorAll('[data-countdown]').forEach((node) => {
      node.textContent = core.countdown(Number(node.dataset.countdown), now.getTime());
    });
    const next = $('next-event-time');
    if (next.dataset.due) next.textContent = core.countdown(Number(next.dataset.due), now.getTime());
    const minute = Math.floor(now.getTime() / 60000);
    if (minute !== lastMinute) { lastMinute = minute; renderHome(); if (!$('planner-page').hidden) renderPlanner(); }
  }

  document.querySelectorAll('[data-page]').forEach((button) => button.addEventListener('click', () => window.openAssistantPage(button.dataset.page)));
  document.querySelectorAll('.page-back').forEach((button) => button.addEventListener('click', window.assistantBack));
  document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => {
    filter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach((tab) => tab.setAttribute('aria-pressed', String(tab === button)));
    renderPlanner();
  }));
  $('open-weather').addEventListener('click', () => window.openAssistantPage('weather'));
  $('pin-widget').addEventListener('click', () => call('addWidget'));
  $('next-event-button').addEventListener('click', () => window.openAssistantPage('events'));
  $('add-item').addEventListener('click', () => openEditor(null));
  $('planner-search').addEventListener('input', renderPlanner);
  $('close-editor').addEventListener('click', () => closeEditor());
  $('item-form').addEventListener('submit', (event) => { event.preventDefault(); saveEditor(false); });
  $('item-calendar').addEventListener('click', () => saveEditor(true));
  $('delete-item').addEventListener('click', () => confirmAction('delete'));
  $('cancel-delete').addEventListener('click', () => { $('delete-confirm').hidden = true; });
  $('confirm-delete').addEventListener('click', () => {
    if (confirmMode === 'discard') closeEditor(true);
    else if (editing && persist({ ...planner, [type]: planner[type].filter((row) => row.id !== editing.id) })) { closeEditor(true); toast('已删除'); }
  });
  $('import-calendar').addEventListener('click', () => {
    calendarType = type; clear($('calendar-list'));
    $('calendar-status').textContent = '正在读取未来 90 天的日程…';
    openSheet('calendar-overlay');
    $('close-calendar').focus();
    call('readCalendar', [], 'calendar');
  });
  $('close-calendar').addEventListener('click', closeCalendar);
  $('open-calendar').addEventListener('click', () => call('openCalendar'));
  $('city-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const query = $('city-query').value.trim();
    if (query.length < 2) { toast('请输入至少两个字的城市名'); return; }
    $('city-search').disabled = true;
    clear($('city-results'));
    $('city-results').appendChild(el('p', 'status-copy', '正在搜索城市…'));
    call('searchCity', [query], 'citySearch');
  });
  $('refresh-weather').addEventListener('click', refreshWeather);
  $('weather-source').addEventListener('click', () => call('openWeatherSource'));
  document.addEventListener('keydown', (event) => {
    const overlay = !$('editor-overlay').hidden ? $('editor-overlay') : !$('calendar-overlay').hidden ? $('calendar-overlay') : null;
    if (!overlay) return;
    if (event.key === 'Escape') { event.preventDefault(); window.assistantBack(); }
    if (event.key === 'Tab') {
      const controls = Array.from(overlay.querySelectorAll('button,input,textarea')).filter((node) => !node.disabled && node.getClientRects().length);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) window.refreshAssistant(); });
  window.refreshAssistant();
  setInterval(updateClock, 1000);
})();
