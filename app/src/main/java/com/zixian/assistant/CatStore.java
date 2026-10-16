package com.zixian.assistant;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONObject;

final class CatStore {
    private CatStore() { }

    private static SharedPreferences prefs(Context context) { return context.getSharedPreferences("black_cat", 0); }

    private static JSONObject load(Context context) throws Exception {
        String raw = prefs(context).getString("state", null);
        if (raw != null) return new JSONObject(raw);
        JSONObject created = CatState.fresh(System.currentTimeMillis());
        if (!prefs(context).edit().putString("state", created.toString()).commit()) throw new IllegalStateException("保存失败");
        return created;
    }

    static synchronized JSONObject state(Context context) {
        try { return CatState.view(load(context), System.currentTimeMillis()); }
        catch (Exception error) { return error("小黑猫的记录读取失败，请稍后重试"); }
    }

    static synchronized JSONObject act(Context context, String action) {
        try {
            JSONObject updated = CatState.act(load(context), action, System.currentTimeMillis());
            return save(context, updated);
        } catch (Exception error) { return error(error.getMessage()); }
    }

    static synchronized JSONObject settings(Context context, String raw) {
        try {
            JSONObject updated = CatState.settings(load(context), new JSONObject(raw), System.currentTimeMillis());
            return save(context, updated);
        } catch (Exception error) { return error(error.getMessage()); }
    }

    private static JSONObject save(Context context, JSONObject updated) throws Exception {
        if (!prefs(context).edit().putString("state", updated.toString()).commit()) return error("保存失败，请检查可用空间");
        CatWidget.updateAll(context);
        return CatState.view(updated, System.currentTimeMillis());
    }

    private static JSONObject error(String text) {
        JSONObject result = new JSONObject();
        try { result.put("error", text == null ? "操作未完成，请重试" : text); } catch (Exception ignored) { }
        return result;
    }
}
