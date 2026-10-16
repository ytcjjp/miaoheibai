package com.zixian.assistant;

import android.app.Activity;
import android.app.AlarmManager;
import android.app.Instrumentation;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;
import android.service.notification.StatusBarNotification;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.FileInputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.FixMethodOrder;
import org.junit.Test;
import org.junit.runners.MethodSorters;
import static org.junit.Assert.*;

@FixMethodOrder(MethodSorters.NAME_ASCENDING)
public final class TimerRegressionTest {
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private final Context context = instrumentation.getTargetContext();
    private Activity activity;

    @Before public void reset() throws Exception {
        TimerStore.cancel(context);
        TimerService.stop(context);
        await(() -> notification() == null, 3000);
    }

    @After public void cleanup() throws Exception {
        if (activity != null) instrumentation.runOnMainSync(() -> activity.finish());
        TimerStore.cancel(context);
        TimerService.stop(context);
        shell("input keyevent KEYCODE_WAKEUP");
        await(() -> notification() == null, 3000);
    }

    @Test public void a_backgroundCompletionAndReturnToUi() throws Exception {
        openActivity();
        js("document.getElementById('open-timer').click();"
                + "document.getElementById('hours').value='0';"
                + "document.getElementById('minutes').value='0';"
                + "document.getElementById('seconds').value='4';"
                + "document.getElementById('custom-start').click()");
        await(() -> notification() != null, 2000);
        assertFalse(notification().extras.getBoolean(Notification.EXTRA_SHOW_CHRONOMETER));
        shell("input keyevent KEYCODE_HOME");
        shell("input keyevent KEYCODE_SLEEP");
        // Read persisted state directly: polling state() here would mask a failed background alarm.
        await(() -> "finished".equals(rawStatus()), 6000);
        await(() -> "时间到了".equals(notificationText()), 2000);
        assertEquals(0, context.getSharedPreferences("countdown", 0).getLong("remaining", -1));
        assertFalse(notification().extras.getBoolean(Notification.EXTRA_SHOW_CHRONOMETER));
        Thread.sleep(2000);
        TimerService.start(context);
        // Let all three five-second pulses run and verify the service releases its notification.
        await(() -> notification() == null, 17000);
        assertEquals("finished", rawStatus());
        shell("input keyevent KEYCODE_WAKEUP");
        instrumentation.runOnMainSync(() -> context.startActivity(new Intent(context, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)));
        js("window.syncTimer(); document.getElementById('open-timer').click()");
        assertEquals("\"已完成\"", js("document.getElementById('status-tag').textContent"));
        assertEquals("false", js("document.getElementById('finished-controls').hidden"));
        js("document.getElementById('restart').click()");
        assertEquals("running", rawStatus());
        js("document.getElementById('cancel').click()");
        assertEquals("idle", rawStatus());
    }

    @Test public void b_serviceFinishesEvenWhenAlarmIsMissing() throws Exception {
        TimerStore.start(context, 2);
        cancelScheduledAlarm(TimerStore.runningDeadline(context));
        TimerService.start(context);
        await(() -> "finished".equals(rawStatus()), 4000);
        await(() -> "时间到了".equals(notificationText()), 2000);
        assertFalse(notification().extras.getBoolean(Notification.EXTRA_SHOW_CHRONOMETER));
    }

    @Test public void c_stateReadRecoversMissedCompletion() throws Exception {
        TimerStore.start(context, 1);
        cancelScheduledAlarm(TimerStore.runningDeadline(context));
        Thread.sleep(1200);
        assertEquals("running", rawStatus());
        JSONObject state = new JSONObject(TimerStore.state(context));
        assertEquals("finished", state.getString("status"));
        assertEquals(0, state.getLong("remaining"));
        await(() -> "时间到了".equals(notificationText()), 2000);
        assertFalse(TimerStore.takePendingAlert(context));
    }

    @Test public void d_staleCallbacksCannotFinishPausedCancelledOrReplacedTimers() throws Exception {
        TimerStore.start(context, 1);
        long oldDeadline = TimerStore.runningDeadline(context);
        cancelScheduledAlarm(oldDeadline);
        TimerStore.start(context, 10);
        long replacement = TimerStore.runningDeadline(context);
        assertFalse(TimerStore.finish(context, replacement));
        Thread.sleep(1200);
        deliverAlarm(oldDeadline);
        assertEquals("running", rawStatus());
        TimerStore.pause(context);
        deliverAlarm(replacement);
        assertEquals("paused", rawStatus());
        long paused = TimerStore.remaining(context);
        Thread.sleep(100);
        assertEquals(paused, TimerStore.remaining(context));
        TimerStore.resume(context);
        long resumed = TimerStore.runningDeadline(context);
        deliverAlarm(replacement);
        assertEquals("running", rawStatus());
        TimerStore.cancel(context);
        deliverAlarm(resumed);
        assertEquals("idle", rawStatus());
        assertNull(notification());
    }

    @Test public void e_pauseAtZeroCompletesAndDoesNotStopAlert() throws Exception {
        TimerStore.start(context, 1);
        cancelScheduledAlarm(TimerStore.runningDeadline(context));
        Thread.sleep(1200);
        new TimerActionReceiver().onReceive(context,
                new Intent(TimerActionReceiver.ACTION_PAUSE));
        assertEquals("finished", rawStatus());
        await(() -> "时间到了".equals(notificationText()), 2000);
    }

    @Test public void f_alarmFinishesWithoutServiceAndRestartIgnoresOldAlarm() throws Exception {
        TimerStore.start(context, 2);
        long deadline = TimerStore.runningDeadline(context);
        await(() -> "finished".equals(rawStatus()), 5000);
        await(() -> "时间到了".equals(notificationText()), 2000);
        TimerStore.start(context, 8);
        TimerService.start(context);
        deliverAlarm(deadline);
        await(() -> notificationText().startsWith("剩余 "), 2000);
        assertEquals("running", rawStatus());
        new TimerActionReceiver().onReceive(context,
                new Intent(TimerActionReceiver.ACTION_CANCEL));
        await(() -> notification() == null, 2000);
        assertEquals("idle", rawStatus());
    }

    private void openActivity() throws Exception {
        activity = instrumentation.startActivitySync(new Intent(context, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        await(() -> "true".equals(js("Boolean(window.syncTimer)")), 5000);
    }

    private String js(String script) throws Exception {
        AtomicReference<String> result = new AtomicReference<>();
        CountDownLatch latch = new CountDownLatch(1);
        instrumentation.runOnMainSync(() -> {
            WebView web = (WebView) ((ViewGroup) activity.findViewById(android.R.id.content)).getChildAt(0);
            web.evaluateJavascript(script, value -> { result.set(value); latch.countDown(); });
        });
        assertTrue("WebView callback timed out", latch.await(5, TimeUnit.SECONDS));
        return result.get();
    }

    private String rawStatus() {
        return context.getSharedPreferences("countdown", 0).getString("status", "idle");
    }

    private Notification notification() {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        for (StatusBarNotification entry : manager.getActiveNotifications()) {
            if (entry.getId() == 100) return entry.getNotification();
        }
        return null;
    }

    private String notificationText() {
        Notification value = notification();
        return value == null ? "" : String.valueOf(value.extras.getCharSequence(Notification.EXTRA_TEXT));
    }

    private void cancelScheduledAlarm(long deadline) {
        Intent intent = new Intent(context, TimerReceiver.class).setAction(TimerStore.ACTION_FINISH)
                .setData(Uri.parse("timer:" + deadline)).putExtra(TimerStore.EXTRA_DEADLINE, deadline);
        PendingIntent pending = PendingIntent.getBroadcast(context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        ((AlarmManager) context.getSystemService(Context.ALARM_SERVICE)).cancel(pending);
    }

    private void deliverAlarm(long deadline) {
        new TimerReceiver().onReceive(context,
                new Intent(TimerStore.ACTION_FINISH).putExtra(TimerStore.EXTRA_DEADLINE, deadline));
    }

    private void shell(String command) throws Exception {
        try (ParcelFileDescriptor fd = instrumentation.getUiAutomation().executeShellCommand(command);
             FileInputStream stream = new FileInputStream(fd.getFileDescriptor())) {
            byte[] buffer = new byte[1024];
            while (stream.read(buffer) != -1) { }
        }
    }

    private interface Check { boolean get() throws Exception; }

    private void await(Check check, long timeoutMs) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + timeoutMs;
        while (!check.get()) {
            if (SystemClock.elapsedRealtime() >= deadline) fail("Condition timed out after " + timeoutMs + "ms");
            Thread.sleep(50);
        }
    }
}
