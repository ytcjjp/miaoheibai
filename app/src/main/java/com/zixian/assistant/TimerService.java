package com.zixian.assistant;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationAttributes;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.util.Log;
import java.util.Locale;

public final class TimerService extends Service {
    private static final String CHANNEL_ID = "countdown";
    private static final String ACTION_START = "com.zixian.assistant.START_TIMER";
    private static final int NOTIFICATION_ID = 100;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable tick = this::syncTimer;
    private final Runnable stopAlert = () -> {
        synchronized (TimerStore.class) {
            if (TimerStore.runningDeadline(this) != 0) syncTimer();
            else stopSelf();
        }
    };
    private Vibrator vibrator;
    private PowerManager.WakeLock alertWakeLock;
    private boolean alerting;

    static void start(Context context) {
        context.startForegroundService(new Intent(context, TimerService.class).setAction(ACTION_START));
    }

    static void stop(Context context) {
        context.stopService(new Intent(context, TimerService.class));
    }

    @Override public void onCreate() {
        super.onCreate();
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "倒计时",
                NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("运行中的倒计时与结束提醒");
        ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(channel);
        vibrator = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                ? ((VibratorManager) getSystemService(VIBRATOR_MANAGER_SERVICE)).getDefaultVibrator()
                : (Vibrator) getSystemService(VIBRATOR_SERVICE);
        alertWakeLock = ((PowerManager) getSystemService(POWER_SERVICE)).newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK, "zixian:timer-alert");
        alertWakeLock.setReferenceCounted(false);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        syncTimer();
        return TimerStore.runningDeadline(this) != 0 ? START_STICKY : START_NOT_STICKY;
    }

    private void syncTimer() {
        handler.removeCallbacks(tick);
        // Alarm broadcasts, UI reads and service ticks share one persisted completion gate.
        synchronized (TimerStore.class) {
            long deadline = TimerStore.runningDeadline(this);
            if (deadline != 0 && !TimerStore.finish(this, deadline)) {
                if (alerting) endAlert();
                long left = TimerStore.remaining(this);
                showForeground(runningNotification(left));
                handler.postDelayed(tick, Math.max(1, Math.min(left, 1000)));
                return;
            }
            if (TimerStore.takePendingAlert(this)) beginAlert();
            else if (!alerting || !TimerStore.isFinished(this)) stopSelf();
        }
    }

    private void beginAlert() {
        endAlert();
        alerting = true;
        showForeground(finishedNotification());
        alertWakeLock.acquire(20_000);
        if (vibrator != null && vibrator.hasVibrator()) {
            VibrationEffect effect = VibrationEffect.createWaveform(
                    new long[]{0, 5000, 1000, 5000, 1000, 5000}, -1);
            if (Build.VERSION.SDK_INT >= 33) {
                vibrator.vibrate(effect, new VibrationAttributes.Builder()
                        .setUsage(VibrationAttributes.USAGE_ALARM).build());
            } else {
                vibrator.vibrate(effect, new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            }
            Log.i("ZiXianTimer", "Alarm vibration requested: 3 x 5000ms, 1000ms gaps");
        }
        handler.postDelayed(stopAlert, 17_500);
    }

    private void endAlert() {
        handler.removeCallbacks(stopAlert);
        if (vibrator != null) vibrator.cancel();
        if (alertWakeLock != null && alertWakeLock.isHeld()) alertWakeLock.release();
        alerting = false;
    }

    private void showForeground(Notification notification) {
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIFICATION_ID, notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SYSTEM_EXEMPTED);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private Notification.Builder notification() {
        Intent open = new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openIntent = PendingIntent.getActivity(this, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_timer_notification)
                .setContentTitle(getString(R.string.app_name))
                .setContentIntent(openIntent)
                .setOnlyAlertOnce(true)
                .setVisibility(Notification.VISIBILITY_PUBLIC);
    }

    private Notification runningNotification(long remaining) {
        long seconds = (Math.max(0, remaining) + 999) / 1000;
        String time = seconds >= 3600
                ? String.format(Locale.ROOT, "%02d:%02d:%02d", seconds / 3600, seconds / 60 % 60, seconds % 60)
                : String.format(Locale.ROOT, "%02d:%02d", seconds / 60, seconds % 60);
        return notification().setContentText("剩余 " + time)
                .setShowWhen(false).setUsesChronometer(false)
                .setOngoing(true)
                .addAction(R.drawable.ic_timer_notification, "暂停",
                        actionIntent(TimerActionReceiver.ACTION_PAUSE, 1))
                .addAction(R.drawable.ic_timer_notification, "取消",
                        actionIntent(TimerActionReceiver.ACTION_CANCEL, 2))
                .build();
    }

    private Notification finishedNotification() {
        return notification().setContentText("时间到了")
                .setCategory(Notification.CATEGORY_ALARM)
                .setShowWhen(false).setUsesChronometer(false)
                .setOngoing(true)
                .addAction(R.drawable.ic_timer_notification, "停止提醒",
                        actionIntent(TimerActionReceiver.ACTION_STOP_ALERT, 3))
                .build();
    }

    private PendingIntent actionIntent(String action, int requestCode) {
        return PendingIntent.getBroadcast(this, requestCode,
                new Intent(this, TimerActionReceiver.class).setAction(action),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @Override public void onDestroy() {
        handler.removeCallbacks(tick);
        endAlert();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
