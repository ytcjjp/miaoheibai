package com.zixian.assistant;

import android.Manifest;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.ContentUris;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.provider.CalendarContract;
import android.webkit.JavascriptInterface;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

final class AssistantBridge {
    static final int CALENDAR_PERMISSION = 43;
    private final MainActivity activity;
    private final ExecutorService executor = Executors.newFixedThreadPool(2);

    AssistantBridge(MainActivity activity) { this.activity = activity; }

    @JavascriptInterface public String data() {
        return "{\"planner\":" + PlannerStore.load(activity) + ",\"weather\":"
                + WeatherRepository.snapshot(activity) + "}";
    }

    @JavascriptInterface public String savePlanner(String json) { return PlannerStore.save(activity, json); }

    @JavascriptInterface public void searchCity(String query) {
        submit("citySearch", () -> new JSONObject().put("query", query).put("cities", WeatherRepository.search(query)));
    }

    @JavascriptInterface public void selectCity(String city) {
        submit("weather", () -> WeatherRepository.select(activity, city));
    }

    @JavascriptInterface public void refreshWeather() {
        submit("weather", () -> WeatherRepository.refresh(activity, true));
    }

    @JavascriptInterface public void readCalendar() {
        if (activity.checkSelfPermission(Manifest.permission.READ_CALENDAR) != PackageManager.PERMISSION_GRANTED) {
            activity.runOnUiThread(() -> activity.requestPermissions(
                    new String[]{Manifest.permission.READ_CALENDAR}, CALENDAR_PERMISSION));
            return;
        }
        submit("calendar", () -> {
            long start = System.currentTimeMillis();
            Uri.Builder uri = CalendarContract.Instances.CONTENT_URI.buildUpon();
            ContentUris.appendId(uri, start - 24 * 60 * 60_000L);
            ContentUris.appendId(uri, start + 90 * 24 * 60 * 60_000L);
            JSONArray events = new JSONArray();
            String[] columns = {CalendarContract.Instances.EVENT_ID, CalendarContract.Instances.TITLE,
                    CalendarContract.Instances.BEGIN, CalendarContract.Instances.END,
                    CalendarContract.Instances.ALL_DAY, CalendarContract.Instances.DESCRIPTION};
            try (Cursor cursor = activity.getContentResolver().query(uri.build(), columns,
                    CalendarContract.Instances.VISIBLE + "=1 AND " + CalendarContract.Instances.END + ">=?",
                    new String[]{Long.toString(start)}, CalendarContract.Instances.BEGIN + " ASC")) {
                while (cursor != null && cursor.moveToNext() && events.length() < 100) {
                    long begin = cursor.getLong(2);
                    String key = cursor.getLong(0) + "_" + begin;
                    if (cursor.getInt(4) == 1) begin = Instant.ofEpochMilli(begin).atZone(ZoneOffset.UTC)
                            .toLocalDate().atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli();
                    events.put(new JSONObject().put("sourceId", key).put("title", cursor.getString(1))
                            .put("dueAt", begin).put("body", cursor.isNull(5) ? "" : cursor.getString(5)));
                }
            }
            return new JSONObject().put("events", events);
        });
    }

    @JavascriptInterface public void exportCalendar(String raw) {
        try {
            JSONObject item = new JSONObject(raw);
            String title = item.getString("title").trim();
            long start = item.getLong("dueAt");
            if (title.isEmpty() || title.length() > 80 || start <= 0 || start > 4_102_444_800_000L)
                throw new IllegalArgumentException("请先填写标题和日期");
            Intent intent = new Intent(Intent.ACTION_INSERT).setData(CalendarContract.Events.CONTENT_URI)
                    .putExtra(CalendarContract.Events.TITLE, title)
                    .putExtra(CalendarContract.Events.DESCRIPTION, item.optString("body", ""))
                    .putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, start)
                    .putExtra(CalendarContract.EXTRA_EVENT_END_TIME, start + 30 * 60_000L);
            launch(intent, "请在系统日历中确认保存与提醒", "没有可用的系统日历，请先安装或启用日历应用");
        } catch (Exception error) { error("message", "请先保存有效的标题和日期"); }
    }

    @JavascriptInterface public void openCalendar() {
        launch(new Intent(Intent.ACTION_VIEW, Uri.parse("content://com.android.calendar/time/" + System.currentTimeMillis())),
                "", "没有可用的系统日历");
    }

    @JavascriptInterface public void addWidget() {
        pinWidget(AssistantWidget.class);
    }

    @JavascriptInterface public void addCatWidget() { pinWidget(CatWidget.class); }

    @JavascriptInterface public String catState() { return CatStore.state(activity).toString(); }

    @JavascriptInterface public String catAction(String action) { return CatStore.act(activity, action).toString(); }

    @JavascriptInterface public String saveCatSettings(String raw) { return CatStore.settings(activity, raw).toString(); }

    @JavascriptInterface public String bgmState() { return BgmStore.state(activity).toString(); }

    @JavascriptInterface public void bgmControl(String action) {
        activity.runOnUiThread(() -> {
            try {
                String before = BgmStore.state(activity).optString("status");
                boolean starting = action.equals("play") || action.equals("next")
                        || (action.equals("toggle") && !before.equals("playing") && !before.equals("loading"));
                BgmService.command(activity, action);
                if (starting) activity.requestNotificationPermission();
            } catch (Exception ignored) {
                error("bgm", "音乐暂时无法开始，请稍后重试");
            }
        });
    }

    @JavascriptInterface public String bgmVolume(int value) {
        BgmStore.volume(activity, value);
        activity.runOnUiThread(() -> {
            try { BgmService.command(activity, "volume"); } catch (Exception ignored) { }
        });
        return BgmStore.state(activity).toString();
    }

    private void pinWidget(Class<?> provider) {
        activity.runOnUiThread(() -> {
            try {
                AppWidgetManager manager = AppWidgetManager.getInstance(activity);
                if (!manager.isRequestPinAppWidgetSupported()) {
                    String label = provider == CatWidget.class ? activity.getString(R.string.cat_widget_name) : activity.getString(R.string.app_name);
                    error("message", "桌面不支持直接添加，请长按桌面，在小组件中选择" + label);
                    return;
                }
                boolean requested = manager.requestPinAppWidget(new ComponentName(activity, provider), null, null);
                message(requested ? "请在桌面确认添加小组件" : "添加请求未完成，请从桌面的小组件列表添加");
            } catch (Exception ignored) { error("message", "添加请求未完成，请从桌面的小组件列表添加"); }
        });
    }

    @JavascriptInterface public void openWeatherSource() {
        launch(new Intent(Intent.ACTION_VIEW, Uri.parse("https://open-meteo.com/")), "", "没有可用的浏览器");
    }

    private interface Work { JSONObject run() throws Exception; }

    private void submit(String topic, Work task) {
        executor.submit(() -> {
            try { activity.reply(topic, task.run()); }
            catch (Exception error) { error(topic, "操作未完成，请检查网络或系统权限后重试"); }
        });
    }

    private void launch(Intent intent, String success, String failure) {
        activity.runOnUiThread(() -> {
            try { activity.startActivity(intent); if (!success.isEmpty()) message(success); }
            catch (Exception ignored) { error("message", failure); }
        });
    }

    void error(String topic, String text) {
        try { activity.reply(topic, new JSONObject().put("error", text)); }
        catch (Exception ignored) { }
    }

    private void message(String text) {
        try { activity.reply("message", new JSONObject().put("message", text)); }
        catch (Exception ignored) { }
    }

    void close() { executor.shutdownNow(); }
}
