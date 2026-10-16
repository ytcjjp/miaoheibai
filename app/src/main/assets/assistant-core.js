(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AssistantCore = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  const pair = (value) => String(value).padStart(2, '0');
  const empty = () => ({ notes: [], tasks: [], events: [] });
  const dateLabel = (date) => `${date.getMonth() + 1}/${date.getDate()} 周${'日一二三四五六'[date.getDay()]}`;
  const timeLabel = (date) => `${pair(date.getHours())}:${pair(date.getMinutes())}:${pair(date.getSeconds())}`;
  const shortTime = (epoch) => {
    const date = new Date(epoch);
    return `${dateLabel(date)} ${pair(date.getHours())}:${pair(date.getMinutes())}`;
  };
  const inputDate = (epoch) => {
    if (!epoch) return '';
    const date = new Date(epoch);
    return `${date.getFullYear()}-${pair(date.getMonth() + 1)}-${pair(date.getDate())}T${pair(date.getHours())}:${pair(date.getMinutes())}`;
  };
  const parseDate = (value) => {
    if (!value) return 0;
    const epoch = new Date(value).getTime();
    if (!Number.isFinite(epoch) || inputDate(epoch) !== value) throw new Error('请选择有效的日期和时间');
    return epoch;
  };
  function countdown(due, now) {
    if (due <= now) return '已到时间';
    const seconds = Math.ceil((due - now) / 1000);
    const days = Math.floor(seconds / 86400);
    const clock = `${pair(Math.floor(seconds / 3600) % 24)}:${pair(Math.floor(seconds / 60) % 60)}:${pair(seconds % 60)}`;
    return days ? `${days} 天 ${clock}` : clock;
  }
  function rows(data, type, query, filter, now) {
    const search = query.trim().toLocaleLowerCase();
    return data[type].filter((row) => (!search || `${row.title}\n${row.body}`.toLocaleLowerCase().includes(search))
      && (type !== 'tasks' || filter === 'all' || (filter === 'done' ? row.done : !row.done)))
      .slice().sort((a, b) => {
        if (type === 'notes') return b.updatedAt - a.updatedAt;
        if (type === 'tasks') return Number(a.done) - Number(b.done)
          || (a.dueAt || Infinity) - (b.dueAt || Infinity) || b.updatedAt - a.updatedAt;
        const aPast = a.dueAt <= now, bPast = b.dueAt <= now;
        return Number(aPast) - Number(bPast) || (aPast ? b.dueAt - a.dueAt : a.dueAt - b.dueAt);
      });
  }
  function makeItem(type, values, existing, now) {
    const title = String(values.title || '').trim();
    const body = String(values.body || '').trim();
    const dueAt = type === 'notes' ? 0 : Number(values.dueAt || 0);
    if (!title || title.length > 80) throw new Error('请填写标题，最多 80 个字');
    if (body.length > 5000) throw new Error('内容最多 5000 个字');
    if (!Number.isFinite(dueAt) || dueAt < 0 || dueAt > 4102444800000 || (type === 'events' && !dueAt))
      throw new Error('请选择 2100 年以前的有效日期');
    return { id: existing ? existing.id : `${now.toString(36)}_${Math.random().toString(36).slice(2, 12)}`,
      title, body, dueAt, done: existing ? existing.done : false, updatedAt: now,
      sourceId: existing ? existing.sourceId || '' : '' };
  }
  function upsert(data, type, item) {
    const other = data[type].filter((row) => row.id !== item.id);
    if (other.length >= 500) throw new Error('每类最多保存 500 条记录');
    return { ...data, [type]: [item, ...other] };
  }
  function imported(data, type, event, now) {
    if (data[type].some((item) => item.sourceId === event.sourceId)) throw new Error('这条日程已经导入过了');
    const item = makeItem(type, { title: (event.title || '未命名日程').slice(0, 80),
      body: (event.body || '').slice(0, 5000), dueAt: event.dueAt }, null, now);
    item.sourceId = event.sourceId;
    return upsert(data, type, item);
  }
  function weather(code) {
    if (code === 0) return { label: '晴', icon: 'sun' };
    if (code === 1 || code === 2) return { label: '多云', icon: 'cloud' };
    if (code === 3) return { label: '阴', icon: 'cloud' };
    if (code === 45 || code === 48) return { label: '雾', icon: 'cloud-fog' };
    if (code >= 95) return { label: '雷雨', icon: 'cloud-lightning' };
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: '雪', icon: 'cloud-snow' };
    if (code >= 51 && code <= 82) return { label: '雨', icon: 'cloud-rain' };
    return { label: '天气未知', icon: 'cloud' };
  }
  return { empty, dateLabel, timeLabel, shortTime, inputDate, parseDate, countdown, rows, makeItem, upsert, imported, weather };
});
