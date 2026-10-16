package com.zixian.assistant;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.SystemClock;
import org.json.JSONException;
import org.json.JSONObject;

final class TimerStore {
    static final String ACTION_FINISH = "com.zixian.assistant.TIMER_FINISH";
    static final String EXTRA_DEADLINE = "deadline";
    private static final String PREFS = "countdown";
    private static final String STATUS = "status";
    private static final String DURATION = "duration";
    private static final String REMAINING = "remaining";
    private static final String DEADLINE = "deadline";
    private static final String ELAPSED_DEADLINE = "elapsedDeadline";
    private static final String ALERT_PENDING = "alertPending";
    private static final int MAX_SECONDS = 99 * 60 * 60 + 59 * 60 + 59;

    private TimerStore() {}

    static synchronized String state(Context context) {
        // Repair a missed alarm on return to the app, using the same once-only transition.
        finish(context, runningDeadline(context));
        if (prefs(context).getBoolean(ALERT_PENDING, false)) TimerService.start(context);
        SharedPreferences prefs = prefs(context);
        JSONObject json = new JSONObject();
        try {
            json.put("status", prefs.getString(STATUS, "idle"));
            json.put("duration", prefs.getLong(DURATION, 0));
            json.put("remaining", remaining(prefs));
            json.put("deadline", prefs.getLong(DEADLINE, 0));
            json.put("now", System.currentTimeMillis());
        } catch (JSONException ignored) { }
        return json.toString();
    }

    static synchronized String start(Context context, int seconds) {
        if (seconds <= 0 || seconds > MAX_SECONDS) return error("invalid_duration");
        if (!canSchedule(context)) return error("exact_alarm_permission");
        cancelAlarm(context);
        long duration = seconds * 1000L;
        long deadline = System.currentTimeMillis() + duration;
        prefs(context).edit().putString(STATUS, "running")
                .putBoolean(ALERT_PENDING, false)
                .putLong(DURATION, duration).putLong(REMAINING, duration)
                .putLong(DEADLINE, deadline)
                .putLong(ELAPSED_DEADLINE, SystemClock.elapsedRealtime() + duration).commit();
        schedule(context, deadline);
        return state(context);
    }

    static synchronized String pause(Context context) {
        SharedPreferences prefs = prefs(context);
        if (!"running".equals(prefs.getString(STATUS, "idle"))) return state(context);
        long left = remaining(prefs);
        if (left == 0) return state(context);
        cancelAlarm(context);
        prefs.edit().putString(STATUS, "paused").putLong(REMAINING, left)
                .remove(DEADLINE).remove(ELAPSED_DEADLINE).commit();
        return state(context);
    }

    static synchronized String resume(Context context) {
        SharedPreferences prefs = prefs(context);
        if (!"paused".equals(prefs.getString(STATUS, "idle"))) return state(context);
        if (!canSchedule(context)) return error("exact_alarm_permission");
        long left = prefs.getLong(REMAINING, 0);
        if (left <= 0) return cancel(context);
        long deadline = System.currentTimeMillis() + left;
        prefs.edit().putString(STATUS, "running").putLong(DEADLINE, deadline)
                .putLong(ELAPSED_DEADLINE, SystemClock.elapsedRealtime() + left).commit();
        schedule(context, deadline);
        return state(context);
    }

    static synchronized String cancel(Context context) {
        cancelAlarm(context);
        prefs(context).edit().clear().commit();
        return state(context);
    }

    static synchronized boolean finish(Context context, long deadline) {
        SharedPreferences prefs = prefs(context);
        if (deadline == 0 || !"running".equals(prefs.getString(STATUS, "idle"))
                || prefs.getLong(DEADLINE, 0) != deadline || remaining(prefs) > 0) return false;
        cancelAlarm(context);
        prefs.edit().putString(STATUS, "finished").putLong(REMAINING, 0)
                .putBoolean(ALERT_PENDING, true)
                .remove(DEADLINE).remove(ELAPSED_DEADLINE).commit();
        return true;
    }

    static synchronized boolean takePendingAlert(Context context) {
        SharedPreferences prefs = prefs(context);
        if (!"finished".equals(prefs.getString(STATUS, "idle"))
                || !prefs.getBoolean(ALERT_PENDING, false)) return false;
        prefs.edit().putBoolean(ALERT_PENDING, false).commit();
        return true;
    }

    static synchronized boolean isPaused(Context context) {
        return "paused".equals(prefs(context).getString(STATUS, "idle"));
    }

    static synchronized boolean isFinished(Context context) {
        return "finished".equals(prefs(context).getString(STATUS, "idle"));
    }

    static synchronized void dismissAlert(Context context) {
        prefs(context).edit().putBoolean(ALERT_PENDING, false).commit();
    }

    static synchronized long remaining(Context context) {
        return remaining(prefs(context));
    }

    static synchronized void rescheduleAfterClockChange(Context context) {
        long deadline = runningDeadline(context);
        if (deadline != 0 && canSchedule(context)) schedule(context, deadline);
    }

    static synchronized long runningDeadline(Context context) {
        SharedPreferences prefs = prefs(context);
        return "running".equals(prefs.getString(STATUS, "idle"))
                ? prefs.getLong(DEADLINE, 0) : 0;
    }

    static synchronized void restoreAfterBoot(Context context) {
        SharedPreferences prefs = prefs(context);
        if (!"running".equals(prefs.getString(STATUS, "idle"))) return;
        long deadline = prefs.getLong(DEADLINE, 0);
        if (deadline <= System.currentTimeMillis()) {
            prefs.edit().putString(STATUS, "finished").putLong(REMAINING, 0)
                    .remove(DEADLINE).remove(ELAPSED_DEADLINE).commit();
        } else if (canSchedule(context)) {
            long left = deadline - System.currentTimeMillis();
            prefs.edit().putLong(ELAPSED_DEADLINE, SystemClock.elapsedRealtime() + left).commit();
            schedule(context, deadline);
        } else {
            prefs.edit().putString(STATUS, "paused")
                    .putLong(REMAINING, deadline - System.currentTimeMillis())
                    .remove(DEADLINE).remove(ELAPSED_DEADLINE).commit();
        }
    }

    private static long remaining(SharedPreferences prefs) {
        if (!"running".equals(prefs.getString(STATUS, "idle")))
            return prefs.getLong(REMAINING, 0);
        long elapsedDeadline = prefs.getLong(ELAPSED_DEADLINE, 0);
        if (elapsedDeadline > 0) return Math.max(0, elapsedDeadline - SystemClock.elapsedRealtime());
        return Math.max(0, prefs.getLong(DEADLINE, 0) - System.currentTimeMillis());
    }

    static boolean canSchedule(Context context) {
        AlarmManager alarm = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarm.canScheduleExactAlarms();
    }

    private static void schedule(Context context, long deadline) {
        AlarmManager alarm = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        PendingIntent show = PendingIntent.getActivity(context, 0,
                new Intent(context, MainActivity.class),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        // A user-visible timer alarm must not share the idle-mode alarm rate limit.
        long triggerAt = System.currentTimeMillis() + remaining(prefs(context));
        alarm.setAlarmClock(new AlarmManager.AlarmClockInfo(triggerAt, show),
                pendingIntent(context, deadline));
    }

    private static void cancelAlarm(Context context) {
        long deadline = prefs(context).getLong(DEADLINE, 0);
        if (deadline == 0) return;
        AlarmManager alarm = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        alarm.cancel(pendingIntent(context, deadline));
    }

    private static PendingIntent pendingIntent(Context context, long deadline) {
        Intent intent = new Intent(context, TimerReceiver.class)
                .setAction(ACTION_FINISH).setData(android.net.Uri.parse("timer:" + deadline))
                .putExtra(EXTRA_DEADLINE, deadline);
        return PendingIntent.getBroadcast(context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static String error(String code) {
        return "{\"error\":\"" + code + "\"}";
    }
}
