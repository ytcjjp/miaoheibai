package com.zixian.assistant;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

final class WeatherRepository {
    private WeatherRepository() { }

    static JSONObject snapshot(Context context) {
        try { return new JSONObject(prefs(context).getString("data", "{}")); }
        catch (Exception error) { return new JSONObject(); }
    }

    static JSONArray search(String query) throws Exception {
        if (query == null || query.trim().length() < 2 || query.length() > 80)
            throw new IllegalArgumentException("请输入至少两个字的城市名，也可以使用拼音");
        JSONObject result = get("https://geocoding-api.open-meteo.com/v1/search?count=8&language=zh&format=json&name="
                + URLEncoder.encode(query.trim(), "UTF-8"));
        JSONArray rows = result.optJSONArray("results");
        return rows == null ? new JSONArray() : rows;
    }

    static JSONObject select(Context context, String raw) throws Exception {
        JSONObject city = new JSONObject(raw);
        double lat = city.getDouble("latitude"), lon = city.getDouble("longitude");
        String name = city.getString("name").trim();
        if (!Double.isFinite(lat) || !Double.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180
                || name.isEmpty() || name.length() > 100) throw new IllegalArgumentException("城市信息无效");
        JSONObject selected = new JSONObject().put("name", name).put("latitude", lat).put("longitude", lon)
                .put("region", city.optString("admin1", "")).put("country", city.optString("country", ""));
        synchronized (WeatherRepository.class) {
            prefs(context).edit().putString("data", new JSONObject().put("city", selected).toString()).commit();
        }
        AssistantWidget.updateAll(context);
        WeatherJobService.schedule(context);
        return refresh(context, true);
    }

    static JSONObject refresh(Context context, boolean force) throws Exception {
        JSONObject saved = snapshot(context);
        JSONObject city = saved.optJSONObject("city");
        if (city == null) return saved;
        if (!force && System.currentTimeMillis() - saved.optLong("fetchedAt", 0) < 30 * 60_000L) return saved;
        try {
            String url = String.format(Locale.ROOT,
                    "https://api.open-meteo.com/v1/forecast?latitude=%.5f&longitude=%.5f&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto",
                    city.getDouble("latitude"), city.getDouble("longitude"));
            JSONObject response = get(url);
            JSONObject current = response.getJSONObject("current");
            JSONObject daily = response.getJSONObject("daily");
            JSONObject weather = new JSONObject().put("city", city)
                    .put("temperature", current.getDouble("temperature_2m"))
                    .put("feelsLike", current.getDouble("apparent_temperature"))
                    .put("humidity", current.getInt("relative_humidity_2m"))
                    .put("wind", current.getDouble("wind_speed_10m"))
                    .put("code", current.getInt("weather_code"))
                    .put("high", daily.getJSONArray("temperature_2m_max").getDouble(0))
                    .put("low", daily.getJSONArray("temperature_2m_min").getDouble(0))
                    .put("observedAt", current.getString("time"))
                    .put("fetchedAt", System.currentTimeMillis());
            saveIfSameCity(context, city, weather);
        } catch (Exception error) {
            saved.put("error", "天气更新失败，请检查网络后重试");
            saveIfSameCity(context, city, saved);
        }
        AssistantWidget.updateAll(context);
        return snapshot(context);
    }

    private static synchronized void saveIfSameCity(Context context, JSONObject city, JSONObject data) {
        JSONObject current = snapshot(context).optJSONObject("city");
        if (current != null && current.optDouble("latitude") == city.optDouble("latitude")
                && current.optDouble("longitude") == city.optDouble("longitude"))
            prefs(context).edit().putString("data", data.toString()).commit();
    }

    static String condition(int code) {
        if (code == 0) return "晴";
        if (code == 1 || code == 2) return "多云";
        if (code == 3) return "阴";
        if (code == 45 || code == 48) return "雾";
        if (code >= 95) return "雷雨";
        if ((code >= 71 && code <= 77) || code == 85 || code == 86) return "雪";
        if (code >= 51 && code <= 82) return "雨";
        return "天气未知";
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences("weather", Context.MODE_PRIVATE);
    }

    private static JSONObject get(String address) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(address).openConnection();
        connection.setConnectTimeout(12000);
        connection.setReadTimeout(12000);
        connection.setRequestProperty("Accept", "application/json");
        try {
            if (connection.getResponseCode() != 200) throw new IllegalStateException("天气服务暂时不可用");
            try (InputStream stream = connection.getInputStream(); ByteArrayOutputStream buffer = new ByteArrayOutputStream()) {
                byte[] chunk = new byte[4096];
                int count;
                while ((count = stream.read(chunk)) != -1) {
                    buffer.write(chunk, 0, count);
                    if (buffer.size() > 1_000_000) throw new IllegalStateException("天气响应过大");
                }
                return new JSONObject(new String(buffer.toByteArray(), StandardCharsets.UTF_8));
            }
        } finally { connection.disconnect(); }
    }
}
