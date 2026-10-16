package com.zixian.assistant;

import android.content.Context;
import org.json.JSONObject;

final class PlannerStore {
    private PlannerStore() { }

    static synchronized String load(Context context) {
        return context.getSharedPreferences("planner", 0).getString("data", PlannerData.EMPTY);
    }

    static synchronized String save(Context context, String raw) {
        try {
            JSONObject data = PlannerData.validate(raw);
            boolean saved = context.getSharedPreferences("planner", 0).edit().putString("data", data.toString()).commit();
            if (!saved) return "{\"error\":\"保存失败，请检查手机存储空间\"}";
            AssistantWidget.updateAll(context);
            return "{\"ok\":true}";
        } catch (Exception error) {
            return "{\"error\":" + JSONObject.quote(error.getMessage()) + "}";
        }
    }
}
