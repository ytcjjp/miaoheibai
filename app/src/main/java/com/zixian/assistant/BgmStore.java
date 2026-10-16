package com.zixian.assistant;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONObject;

final class BgmStore {
    static final int[] TRACKS = {R.raw.bgm_window, R.raw.bgm_moon, R.raw.bgm_sun};
    private static final String[] TITLES = {"窗边小憩", "月光绒毯", "慢慢晴天"};

    private BgmStore() { }

    private static SharedPreferences prefs(Context context) { return context.getSharedPreferences("bgm", 0); }

    static String title(int index) { return index >= 0 && index < TITLES.length ? TITLES[index] : "轻柔 BGM"; }

    static int track(Context context) {
        int index = prefs(context).getInt("track", -1);
        return index >= 0 && index < TRACKS.length ? index : -1;
    }

    static int position(Context context) { return Math.max(0, prefs(context).getInt("position", 0)); }
    static String status(Context context) { return prefs(context).getString("status", "stopped"); }
    static int volume(Context context) { return Math.max(0, Math.min(100, prefs(context).getInt("volume", 35))); }

    static void volume(Context context, int value) {
        prefs(context).edit().putInt("volume", Math.max(0, Math.min(100, value))).apply();
    }

    static void playback(Context context, int track, int position, String status, String error) {
        prefs(context).edit().putInt("track", track).putInt("position", Math.max(0, position))
                .putString("status", status).putString("error", error).apply();
        CatWidget.updateAll(context);
    }

    static JSONObject state(Context context) {
        JSONObject result = new JSONObject();
        try {
            int track = track(context);
            String status = status(context);
            // A killed process must not leave the widget claiming audio is still playing.
            if (!BgmService.alive && (status.equals("playing") || status.equals("loading"))) status = "paused";
            result.put("track", track).put("title", title(track)).put("status", status)
                    .put("volume", volume(context)).put("error", prefs(context).getString("error", ""));
        } catch (Exception ignored) { }
        return result;
    }
}
