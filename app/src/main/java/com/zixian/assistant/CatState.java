package com.zixian.assistant;

import org.json.JSONException;
import org.json.JSONObject;

final class CatState {
    private static final long HOUR = 3_600_000L;

    private CatState() { }

    static JSONObject fresh(long now) throws JSONException {
        return new JSONObject().put("name", "小墨").put("collar", "pink").put("theme", "blush")
                .put("animations", true).put("showStats", true).put("fullness", 80).put("happiness", 75)
                .put("energy", 85).put("bond", 0).put("sleeping", false).put("adoptedAt", now)
                .put("updatedAt", now).put("lastAction", "idle").put("actionAt", 0)
                .put("message", "").put("messageAt", 0).put("interactions", 0);
    }

    private static double bounded(double value) {
        return Double.isFinite(value) ? Math.max(0, Math.min(100, value)) : 50;
    }

    static JSONObject advance(JSONObject saved, long now) throws JSONException {
        JSONObject result = new JSONObject(saved.toString());
        long last = saved.optLong("updatedAt", now);
        double hours = Math.min(168, Math.max(0, now - last) / (double) HOUR);
        boolean sleeping = saved.optBoolean("sleeping", false);
        result.put("fullness", bounded(saved.optDouble("fullness", 80) - hours * (sleeping ? 2 : 4)))
                .put("happiness", bounded(saved.optDouble("happiness", 75) - hours * (sleeping ? 1 : 2)))
                .put("energy", bounded(saved.optDouble("energy", 85) + hours * (sleeping ? 12 : -3)))
                .put("updatedAt", Math.max(now, last));
        return result;
    }

    static JSONObject view(JSONObject saved, long now) throws JSONException {
        JSONObject result = advance(saved, now);
        boolean sleeping = result.optBoolean("sleeping");
        String pose = sleeping ? "sleeping" : result.getDouble("fullness") <= 25 ? "hungry"
                : result.getDouble("energy") <= 20 ? "tired" : result.getDouble("happiness") >= 85 ? "happy" : "idle";
        String mood = sleeping ? "睡觉中" : pose.equals("hungry") ? "有点饿" : pose.equals("tired") ? "想休息"
                : pose.equals("happy") ? "超开心" : "想陪你玩";
        String message = sleeping ? "呼噜呼噜…梦里也有你。" : pose.equals("hungry") ? "肚子咕噜咕噜，想吃小鱼干。"
                : pose.equals("tired") ? "玩累啦，可以陪我睡一会儿吗？" : pose.equals("happy") ? "今天的快乐，是你给的呀！" : "我在呢，今天也陪着你。";
        long age = Math.max(0, now - result.optLong("messageAt", 0));
        if (result.optLong("messageAt", 0) > 0 && age < 60_000) message = result.optString("message", message);
        if (!sleeping && result.optLong("actionAt", 0) > 0 && Math.max(0, now - result.optLong("actionAt")) < 4500) {
            String action = result.optString("lastAction");
            if (action.equals("pet")) pose = "happy";
            if (action.equals("feed")) pose = "eating";
            if (action.equals("play")) pose = "playing";
        }
        return result.put("pose", pose).put("widgetPose", pose).put("mood", mood).put("message", message)
                .put("level", 1 + Math.max(0, result.optInt("bond")) / 20)
                .put("days", 1 + Math.max(0, now - result.optLong("adoptedAt", now)) / (24 * HOUR));
    }

    static JSONObject act(JSONObject saved, String action, long now) throws JSONException {
        if (!action.equals("pet") && !action.equals("feed") && !action.equals("play") && !action.equals("rest"))
            throw new JSONException("不认识这个互动动作");
        JSONObject state = advance(saved, now);
        long cooldown = action.equals("feed") ? 10_000 : action.equals("play") ? 6000 : action.equals("pet") ? 3000 : 2000;
        long last = state.optLong("last_" + action, 0);
        if (last > 0 && now - last < cooldown) return say(state, "慢慢来，让我缓一小会儿。", now);
        boolean asleep = state.optBoolean("sleeping");
        if (asleep && (action.equals("feed") || action.equals("play"))) return say(state, "先叫醒我，再一起吃饭和玩耍吧。", now);
        int bond = 0;
        String message;
        if (action.equals("pet")) {
            state.put("happiness", bounded(state.getDouble("happiness") + (asleep ? 3 : 8)));
            bond = 2;
            message = asleep ? "睡梦里也认得你的手，呼噜…" : "蹭蹭你的手，最喜欢你啦。";
        } else if (action.equals("feed")) {
            if (state.getDouble("fullness") >= 95) return say(state, "肚肚饱饱的，陪我玩一会儿吧。", now);
            state.put("fullness", bounded(state.getDouble("fullness") + 18))
                    .put("happiness", bounded(state.getDouble("happiness") + 3));
            bond = 3;
            message = "小鱼干真香，给你留一口！";
        } else if (action.equals("play")) {
            if (state.getDouble("energy") < 10) return say(state, "有点困啦，先让我睡一会儿。", now);
            if (state.getDouble("fullness") < 10) return say(state, "想先吃点东西，再陪你追球球。", now);
            state.put("energy", bounded(state.getDouble("energy") - 8))
                    .put("fullness", bounded(state.getDouble("fullness") - 4))
                    .put("happiness", bounded(state.getDouble("happiness") + 12));
            bond = 4;
            message = "抓到球球啦！再蹦一下！";
        } else {
            state.put("sleeping", !asleep);
            message = asleep ? "伸个懒腰，又能陪着你啦。" : "晚安，醒来还想看到你。";
        }
        state.put("last_" + action, now).put("lastAction", action).put("actionAt", now)
                .put("bond", Math.min(1_000_000, Math.max(0, state.optInt("bond")) + bond))
                .put("interactions", Math.min(1_000_000, Math.max(0, state.optInt("interactions")) + 1));
        return say(state, message, now);
    }

    private static JSONObject say(JSONObject state, String message, long now) throws JSONException {
        return state.put("message", message).put("messageAt", now);
    }

    static JSONObject settings(JSONObject saved, JSONObject input, long now) throws JSONException {
        String name = input.getString("name").trim();
        String collar = input.getString("collar"), theme = input.getString("theme");
        if (name.isEmpty() || name.codePointCount(0, name.length()) > 12 || name.codePoints().anyMatch(Character::isISOControl))
            throw new JSONException("昵称请输入 1 到 12 个字");
        if (!collar.equals("pink") && !collar.equals("mint") && !collar.equals("gold")) throw new JSONException("请选择项圈颜色");
        if (!theme.equals("blush") && !theme.equals("mint") && !theme.equals("clear")) throw new JSONException("请选择组件背景");
        return advance(saved, now).put("name", name).put("collar", collar).put("theme", theme)
                .put("animations", input.getBoolean("animations")).put("showStats", input.getBoolean("showStats"));
    }
}
