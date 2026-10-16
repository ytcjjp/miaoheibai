package com.zixian.assistant;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

public final class AssistantWidget extends AppWidgetProvider {
    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        updateAll(context);
        WeatherJobService.schedule(context);
    }

    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        updateAll(context);
    }

    @Override public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        String action = intent.getAction();
        if (Intent.ACTION_DATE_CHANGED.equals(action) || Intent.ACTION_TIME_CHANGED.equals(action)
                || Intent.ACTION_TIMEZONE_CHANGED.equals(action) || Intent.ACTION_BOOT_COMPLETED.equals(action)) {
            updateAll(context);
            WeatherJobService.schedule(context);
        }
    }

    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, AssistantWidget.class));
        if (ids.length == 0) return;
        RemoteViews view = new RemoteViews(context.getPackageName(), R.layout.assistant_widget);
        Calendar now = Calendar.getInstance();
        String date = new SimpleDateFormat("M/d", Locale.CHINA).format(now.getTime())
                + " 周" + "日一二三四五六".charAt(now.get(Calendar.DAY_OF_WEEK) - 1);
        view.setTextViewText(R.id.widget_date, date);
        String weatherText = "选择城市，查看天气";
        String weatherTime = "天气来源 Open-Meteo";
        JSONObject weather = WeatherRepository.snapshot(context);
        JSONObject city = weather.optJSONObject("city");
        if (city != null) {
            weatherText = city.optString("name") + " · 待更新";
            if (weather.has("temperature")) {
                weatherText = city.optString("name") + "  " + Math.round(weather.optDouble("temperature"))
                        + "°  " + WeatherRepository.condition(weather.optInt("code", -1));
                long age = System.currentTimeMillis() - weather.optLong("fetchedAt", 0);
                weatherTime = (weather.has("error") || age > 2 * 60 * 60_000L ? "缓存 · " : "更新于 ")
                        + new SimpleDateFormat("M/d HH:mm", Locale.CHINA).format(new Date(weather.optLong("fetchedAt")));
            }
        }
        view.setTextViewText(R.id.widget_weather, weatherText);
        view.setTextViewText(R.id.widget_weather_time, weatherTime);
        view.setTextViewText(R.id.widget_task, "待办 · 今天想做什么？");
        view.setTextViewText(R.id.widget_event, "倒数日 · 记下重要日子");
        try {
            JSONObject data = new JSONObject(PlannerStore.load(context));
            JSONArray tasks = data.getJSONArray("tasks");
            JSONObject nextTask = null;
            int remaining = 0;
            for (int i = 0; i < tasks.length(); i++) {
                JSONObject task = tasks.getJSONObject(i);
                if (task.optBoolean("done")) continue;
                remaining++;
                long due = task.optLong("dueAt", 0);
                long chosen = nextTask == null ? Long.MAX_VALUE : nextTask.optLong("dueAt", 0);
                if (nextTask == null || (due > 0 && (chosen == 0 || due < chosen))) nextTask = task;
            }
            if (nextTask != null) view.setTextViewText(R.id.widget_task,
                    "待办 " + remaining + " · " + nextTask.optString("title"));
            JSONArray events = data.getJSONArray("events");
            JSONObject nextEvent = null;
            long epoch = System.currentTimeMillis();
            for (int i = 0; i < events.length(); i++) {
                JSONObject event = events.getJSONObject(i);
                long due = event.optLong("dueAt");
                if (due > epoch && (nextEvent == null || due < nextEvent.optLong("dueAt"))) nextEvent = event;
            }
            if (nextEvent != null) {
                long days = ChronoUnit.DAYS.between(LocalDate.now(), Instant.ofEpochMilli(nextEvent.getLong("dueAt"))
                        .atZone(ZoneId.systemDefault()).toLocalDate());
                view.setTextViewText(R.id.widget_event, nextEvent.optString("title")
                        + (days == 0 ? " · 今天" : " · 还有 " + days + " 天"));
            }
        } catch (Exception ignored) { }
        view.setOnClickPendingIntent(R.id.widget_clock_area, open(context, "home", 10));
        view.setOnClickPendingIntent(R.id.widget_weather_area, open(context, "weather", 11));
        view.setOnClickPendingIntent(R.id.widget_task, open(context, "tasks", 12));
        view.setOnClickPendingIntent(R.id.widget_event, open(context, "events", 13));
        view.setOnClickPendingIntent(R.id.widget_timer, open(context, "timer", 14));
        view.setOnClickPendingIntent(R.id.widget_notes, open(context, "notes", 15));
        manager.updateAppWidget(ids, view);
    }

    private static PendingIntent open(Context context, String page, int id) {
        return PendingIntent.getActivity(context, id, new Intent(context, MainActivity.class)
                .putExtra("page", page).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
