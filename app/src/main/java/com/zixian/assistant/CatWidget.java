package com.zixian.assistant;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.appwidget.AppWidgetProviderInfo;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.util.SizeF;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.Toast;
import org.json.JSONObject;
import java.util.LinkedHashMap;
import java.util.Map;

public final class CatWidget extends AppWidgetProvider {
    private static final String INTERACT = "com.zixian.assistant.CAT_INTERACT";
    private static final int[][] ART = {
            {R.drawable.cat_idle_pink, R.drawable.cat_happy_pink, R.drawable.cat_sleeping_pink, R.drawable.cat_hungry_pink, R.drawable.cat_tired_pink, R.drawable.cat_eating_pink, R.drawable.cat_playing_pink},
            {R.drawable.cat_idle_mint, R.drawable.cat_happy_mint, R.drawable.cat_sleeping_mint, R.drawable.cat_hungry_mint, R.drawable.cat_tired_mint, R.drawable.cat_eating_mint, R.drawable.cat_playing_mint},
            {R.drawable.cat_idle_gold, R.drawable.cat_happy_gold, R.drawable.cat_sleeping_gold, R.drawable.cat_hungry_gold, R.drawable.cat_tired_gold, R.drawable.cat_eating_gold, R.drawable.cat_playing_gold}
    };

    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) { updateAll(context); }

    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) { updateAll(context); }

    @Override public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (INTERACT.equals(intent.getAction())) {
            int id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
            AppWidgetProviderInfo info = AppWidgetManager.getInstance(context).getAppWidgetInfo(id);
            if (info == null || !new ComponentName(context, CatWidget.class).equals(info.provider)) return;
            String action = intent.getStringExtra("catAction");
            if (!"pet".equals(action) && !"feed".equals(action) && !"play".equals(action) && !"rest".equals(action)) return;
            JSONObject result = CatStore.act(context, action);
            if (result.has("error")) Toast.makeText(context, result.optString("error"), Toast.LENGTH_SHORT).show();
        } else if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())
                || Intent.ACTION_TIME_CHANGED.equals(intent.getAction()) || Intent.ACTION_TIMEZONE_CHANGED.equals(intent.getAction())) updateAll(context);
    }

    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, CatWidget.class));
        if (ids.length == 0) return;
        JSONObject state = CatStore.state(context);
        for (int id : ids) {
            RemoteViews view;
            if (Build.VERSION.SDK_INT >= 31) {
                Map<SizeF, RemoteViews> layouts = new LinkedHashMap<>();
                layouts.put(new SizeF(220, 340), build(context, id, state, false));
                layouts.put(new SizeF(220, 480), build(context, id, state, true));
                view = new RemoteViews(layouts);
            } else {
                Bundle options = manager.getAppWidgetOptions(id);
                boolean portraitLarge = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 520) >= 480;
                boolean landscapeLarge = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 340) >= 480;
                view = new RemoteViews(build(context, id, state, landscapeLarge), build(context, id, state, portraitLarge));
            }
            manager.updateAppWidget(id, view);
        }
    }

    private static RemoteViews build(Context context, int id, JSONObject state, boolean large) {
            RemoteViews view = new RemoteViews(context.getPackageName(), R.layout.cat_widget);
            int padding = Math.round((large ? 16 : 12) * context.getResources().getDisplayMetrics().density);
            view.setViewPadding(R.id.cat_widget_root, padding, padding, padding, padding);
            view.setTextViewTextSize(R.id.cat_widget_name, TypedValue.COMPLEX_UNIT_SP, large ? 20 : 15);
            view.setTextViewTextSize(R.id.cat_widget_message, TypedValue.COMPLEX_UNIT_SP, large ? 15 : 12);
            view.setTextViewTextSize(R.id.cat_widget_stats, TypedValue.COMPLEX_UNIT_SP, large ? 12 : 11);
            view.setTextViewTextSize(R.id.cat_widget_music_title, TypedValue.COMPLEX_UNIT_SP, large ? 14 : 12);
            if (state.has("error")) {
                view.setTextViewText(R.id.cat_widget_message, state.optString("error"));
            } else {
                String name = state.optString("name", "小墨");
                String theme = state.optString("theme", "blush");
                int background = theme.equals("mint") ? R.drawable.cat_widget_mint
                        : theme.equals("clear") ? R.drawable.cat_widget_clear : R.drawable.cat_widget_blush;
                view.setInt(R.id.cat_widget_root, "setBackgroundResource", background);
                view.setTextViewText(R.id.cat_widget_name, name);
                view.setTextViewText(R.id.cat_widget_level, "Lv." + state.optInt("level", 1));
                view.setTextViewText(R.id.cat_widget_message, state.optString("message"));
                view.setTextViewText(R.id.cat_widget_stats, "饱食 " + Math.round(state.optDouble("fullness"))
                        + " · 心情 " + Math.round(state.optDouble("happiness")) + " · 精力 " + Math.round(state.optDouble("energy")));
                view.setViewVisibility(R.id.cat_widget_stats, state.optBoolean("showStats", true) ? View.VISIBLE : View.GONE);
                view.setImageViewResource(R.id.cat_widget_image, resource(state));
                view.setContentDescription(R.id.cat_widget_image, name + "，" + state.optString("mood") + "，点我摸摸");
                boolean sleeping = state.optBoolean("sleeping");
                view.setTextViewText(R.id.cat_widget_rest_label, sleeping ? "叫醒" : "睡觉");
                view.setImageViewResource(R.id.cat_widget_rest_icon, sleeping ? R.drawable.cat_icon_wake : R.drawable.cat_icon_sleep);
            }
            view.setOnClickPendingIntent(R.id.cat_widget_image, action(context, id, "pet"));
            view.setOnClickPendingIntent(R.id.cat_widget_pet, action(context, id, "pet"));
            view.setOnClickPendingIntent(R.id.cat_widget_feed, action(context, id, "feed"));
            view.setOnClickPendingIntent(R.id.cat_widget_play, action(context, id, "play"));
            view.setOnClickPendingIntent(R.id.cat_widget_rest, action(context, id, "rest"));
            view.setOnClickPendingIntent(R.id.cat_widget_name, open(context, "cat", 31));
            view.setOnClickPendingIntent(R.id.cat_widget_message, open(context, "cat", 31));
            view.setOnClickPendingIntent(R.id.cat_widget_settings, open(context, "cat-settings", 32));
            view.setTextViewText(R.id.cat_widget_music_title, context.getString(R.string.system_music_title));
            view.setTextViewText(R.id.cat_widget_music_status, context.getString(R.string.system_music_ready));
            view.setImageViewResource(R.id.cat_widget_music_toggle, R.drawable.bgm_icon_play);
            view.setContentDescription(R.id.cat_widget_music_toggle, context.getString(R.string.system_music_play));
            view.setOnClickPendingIntent(R.id.cat_widget_music_toggle, systemMusic(context, id, true));
            view.setOnClickPendingIntent(R.id.cat_widget_music_open, systemMusic(context, id, false));
            view.setOnClickPendingIntent(R.id.cat_widget_music_title, systemMusic(context, id, false));
            view.setOnClickPendingIntent(R.id.cat_widget_music_status, systemMusic(context, id, false));
            return view;
    }

    private static int resource(JSONObject state) {
        String collar = state.optString("collar");
        int color = collar.equals("mint") ? 1 : collar.equals("gold") ? 2 : 0;
        String pose = state.optString("widgetPose");
        int index = pose.equals("happy") ? 1 : pose.equals("sleeping") ? 2 : pose.equals("hungry") ? 3 : pose.equals("tired") ? 4
                : pose.equals("eating") ? 5 : pose.equals("playing") ? 6 : 0;
        return ART[color][index];
    }

    private static PendingIntent action(Context context, int id, String action) {
        Intent intent = new Intent(context, CatWidget.class).setAction(INTERACT)
                .setData(Uri.parse("zixian-cat://widget/" + id + "/" + action))
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id).putExtra("catAction", action);
        return PendingIntent.getBroadcast(context, id, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent open(Context context, String page, int id) {
        return PendingIntent.getActivity(context, id, new Intent(context, MainActivity.class).putExtra("page", page)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent systemMusic(Context context, int id, boolean play) {
        Intent intent = new Intent(context, SystemMusicActivity.class).setAction(play ? "play" : "open")
                .setData(Uri.parse("zixian-cat://widget/" + id + "/system-music/" + (play ? "play" : "open")));
        return PendingIntent.getActivity(context, id, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
