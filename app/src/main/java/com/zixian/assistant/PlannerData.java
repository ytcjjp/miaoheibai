package com.zixian.assistant;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.HashSet;

final class PlannerData {
    static final String EMPTY = "{\"notes\":[],\"tasks\":[],\"events\":[]}";

    private PlannerData() { }

    static JSONObject validate(String raw) throws JSONException {
        if (raw == null || raw.length() > 1_500_000) throw new JSONException("数据过大");
        JSONObject input = new JSONObject(raw);
        JSONObject output = new JSONObject();
        HashSet<String> ids = new HashSet<>();
        for (String type : new String[]{"notes", "tasks", "events"}) {
            JSONArray source = input.getJSONArray(type);
            if (source.length() > 500) throw new JSONException("每类最多保存 500 条记录");
            JSONArray items = new JSONArray();
            for (int i = 0; i < source.length(); i++) {
                JSONObject row = source.getJSONObject(i);
                String id = row.getString("id");
                String title = row.getString("title").trim();
                String body = row.optString("body", "");
                if (!id.matches("[A-Za-z0-9_-]{1,80}") || !ids.add(id)) throw new JSONException("记录标识无效");
                if (title.isEmpty() || title.length() > 80 || body.length() > 5000)
                    throw new JSONException("标题最多 80 字，内容最多 5000 字");
                long due = row.optLong("dueAt", 0);
                if (due < 0 || due > 4_102_444_800_000L || ("events".equals(type) && due == 0))
                    throw new JSONException("请选择 2100 年以前的有效日期");
                JSONObject item = new JSONObject().put("id", id).put("title", title).put("body", body)
                        .put("updatedAt", row.optLong("updatedAt", 0)).put("dueAt", due)
                        .put("done", "tasks".equals(type) && row.optBoolean("done", false));
                String sourceId = row.optString("sourceId", "");
                if (sourceId.length() > 100) throw new JSONException("日历标识无效");
                item.put("sourceId", sourceId);
                items.put(item);
            }
            output.put(type, items);
        }
        return output;
    }
}
