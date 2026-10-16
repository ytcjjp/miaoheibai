package com.zixian.assistant;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.MediaPlayer;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import java.util.Random;

public final class BgmService extends Service {
    private static final String CHANNEL = "soft_bgm";
    private static final int NOTIFICATION = 201;
    static volatile boolean alive;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final BgmQueue queue = new BgmQueue(BgmStore.TRACKS.length, new Random());
    private final Runnable idleStop = this::stopSelf;
    private AudioManager audio;
    private AudioFocusRequest focusRequest;
    private MediaPlayer player;
    private MediaSession session;
    private boolean prepared, wanted, focused, resumeOnFocus, foreground, destroyed;
    private int track = -1, savedPosition;
    private String status = "stopped", error = "";
    private float fadeLevel = 1;
    private final Runnable fade = new Runnable() {
        @Override public void run() {
            if (player == null || !prepared || !status.equals("playing")) return;
            fadeLevel = Math.min(1, fadeLevel + .125f);
            applyVolume();
            if (fadeLevel < 1) handler.postDelayed(this, 50);
        }
    };
    private final BroadcastReceiver noisy = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) { pause(false); }
    };

    static void command(Context context, String command) {
        if (!command.equals("launch") && !command.equals("play") && !command.equals("pause") && !command.equals("toggle")
                && !command.equals("next") && !command.equals("stop") && !command.equals("volume"))
            throw new IllegalArgumentException("Unknown music command");
        Intent intent = new Intent(context, BgmService.class).setAction(command);
        if (command.equals("launch") || command.equals("play") || command.equals("next") || command.equals("toggle")) context.startForegroundService(intent);
        else if (alive) context.startService(intent);
    }

    @Override public void onCreate() {
        super.onCreate();
        alive = true;
        track = BgmStore.track(this);
        savedPosition = BgmStore.position(this);
        status = track < 0 || BgmStore.status(this).equals("stopped") ? "stopped" : "paused";
        NotificationChannel channel = new NotificationChannel(CHANNEL, "小黑猫轻音乐", NotificationManager.IMPORTANCE_LOW);
        channel.setSound(null, null);
        channel.enableVibration(false);
        getSystemService(NotificationManager.class).createNotificationChannel(channel);
        audio = getSystemService(AudioManager.class);
        focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(attributes()).setWillPauseWhenDucked(true)
                .setOnAudioFocusChangeListener(this::focusChanged, handler).build();
        session = new MediaSession(this, "ZiXianBgm");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { play(false); }
            @Override public void onPause() { pause(false); }
            @Override public void onSkipToNext() { play(true); }
            @Override public void onStop() { stopMusic(); }
        }, handler);
        session.setSessionActivity(openApp());
        session.setActive(true);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(noisy, new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY), RECEIVER_NOT_EXPORTED);
        else registerReceiver(noisy, new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY));
    }

    @Override public int onStartCommand(Intent intent, int flags, int id) {
        String action = intent == null ? "stop" : intent.getAction();
        switch (action == null ? "stop" : action) {
            case "launch":
                // Opening the app must not restart a track or interrupt focus recovery.
                if (!wanted) play(true);
                else showForeground();
                break;
            case "play": play(false); break;
            case "next": play(true); break;
            case "toggle": if (status.equals("playing") || status.equals("loading")) pause(false); else play(false); break;
            case "pause": pause(false); break;
            case "volume": applyVolume(); break;
            default: stopMusic(); break;
        }
        return START_NOT_STICKY;
    }

    private AudioAttributes attributes() {
        return new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build();
    }

    private void play(boolean next) {
        if (destroyed) return;
        handler.removeCallbacks(idleStop);
        boolean wasStopped = status.equals("stopped");
        wanted = true;
        resumeOnFocus = false;
        error = "";
        // Enter the foreground before requesting audio focus or preparing the decoder.
        showForeground();
        if (!focused) {
            focused = audio.requestAudioFocus(focusRequest) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
            if (!focused) { fail("暂时无法获得音频播放权限，请稍后重试"); return; }
        }
        if (next || track < 0 || wasStopped) {
            track = queue.next(track);
            savedPosition = 0;
            loadTrack();
        } else if (player != null && prepared) startPrepared();
        else if (player == null) loadTrack();
        else { status = "loading"; publish(true); }
    }

    private void loadTrack() {
        releasePlayer();
        status = "loading";
        publish(true);
        try {
            MediaPlayer next = new MediaPlayer();
            player = next;
            next.setAudioAttributes(attributes());
            next.setWakeMode(this, PowerManager.PARTIAL_WAKE_LOCK);
            try (AssetFileDescriptor file = getResources().openRawResourceFd(BgmStore.TRACKS[track])) {
                next.setDataSource(file.getFileDescriptor(), file.getStartOffset(), file.getLength());
            }
            next.setOnPreparedListener(ready -> {
                if (player != ready) return;
                prepared = true;
                int position = savedPosition < ready.getDuration() - 500 ? savedPosition : 0;
                if (position > 0) ready.seekTo(position);
                session.setMetadata(new MediaMetadata.Builder().putString(MediaMetadata.METADATA_KEY_TITLE, BgmStore.title(track))
                        .putString(MediaMetadata.METADATA_KEY_ARTIST, "小黑猫轻音乐")
                        .putLong(MediaMetadata.METADATA_KEY_DURATION, ready.getDuration()).build());
                if (wanted && focused) startPrepared();
            });
            next.setOnCompletionListener(done -> {
                if (player == done && wanted && focused) {
                    track = queue.next(track);
                    savedPosition = 0;
                    loadTrack();
                }
            });
            next.setOnErrorListener((failed, what, extra) -> {
                if (player == failed) fail("音乐暂时无法播放，请重试或切换下一首");
                return true;
            });
            next.prepareAsync();
        } catch (Exception exception) { fail("音乐加载失败，请重新打开应用后重试"); }
    }

    private void startPrepared() {
        if (player == null || !prepared || !wanted || !focused) return;
        try {
            if (!player.isPlaying()) {
                handler.removeCallbacks(fade);
                fadeLevel = 0;
                applyVolume();
                player.start();
                status = "playing";
                fade.run();
            }
            status = "playing";
            publish(true);
        } catch (Exception exception) { fail("音乐播放中断，请重试"); }
    }

    private void pause(boolean transientFocus) {
        if (destroyed) return;
        handler.removeCallbacks(fade);
        handler.removeCallbacks(idleStop);
        try { if (player != null && prepared) { savedPosition = player.getCurrentPosition(); player.pause(); } }
        catch (IllegalStateException ignored) { releasePlayer(); }
        resumeOnFocus = transientFocus && wanted;
        if (!transientFocus) {
            wanted = false;
            focused = false;
            audio.abandonAudioFocusRequest(focusRequest);
        }
        status = "paused";
        publish(resumeOnFocus);
        if (!resumeOnFocus) handler.postDelayed(idleStop, 60_000);
    }

    private void focusChanged(int change) {
        if (destroyed) return;
        if (change == AudioManager.AUDIOFOCUS_GAIN) {
            if (!wanted) { focused = false; return; }
            focused = true;
            if (resumeOnFocus && wanted) {
                resumeOnFocus = false;
                if (player == null) loadTrack(); else if (prepared) startPrepared();
            }
        } else {
            focused = false;
            if (change == AudioManager.AUDIOFOCUS_LOSS) pause(false);
            else pause(true);
        }
    }

    private void applyVolume() {
        if (player == null || !prepared) return;
        float gain = BgmStore.volume(this) / 100f * fadeLevel;
        try { player.setVolume(gain, gain); } catch (IllegalStateException ignored) { }
    }

    private int position() {
        try { if (player != null && prepared) return player.getCurrentPosition(); }
        catch (IllegalStateException ignored) { }
        return savedPosition;
    }

    private void publish(boolean keepForeground) {
        BgmStore.playback(this, track, position(), status, error);
        int playback = status.equals("playing") ? PlaybackState.STATE_PLAYING : status.equals("loading")
                ? PlaybackState.STATE_BUFFERING : status.equals("stopped") ? PlaybackState.STATE_STOPPED : PlaybackState.STATE_PAUSED;
        session.setPlaybackState(new PlaybackState.Builder()
                .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE
                        | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_STOP)
                .setState(playback, position(), playback == PlaybackState.STATE_PLAYING ? 1 : 0).build());
        if (keepForeground) showForeground();
        else {
            if (foreground) { stopForeground(STOP_FOREGROUND_DETACH); foreground = false; }
            getSystemService(NotificationManager.class).notify(NOTIFICATION, notification());
        }
    }

    private Notification notification() {
        boolean active = wanted;
        return new Notification.Builder(this, CHANNEL).setSmallIcon(R.drawable.bgm_icon_music)
                .setContentTitle(BgmStore.title(track)).setContentText(status.equals("loading") ? "正在准备轻音乐" : status.equals("playing") ? "随机播放 · 小黑猫轻音乐" : "已暂停")
                .setContentIntent(openApp()).setCategory(Notification.CATEGORY_TRANSPORT)
                .setOnlyAlertOnce(true).setShowWhen(false).setOngoing(active)
                .addAction(active ? R.drawable.bgm_icon_pause : R.drawable.bgm_icon_play, active ? "暂停" : "播放", action(active ? "pause" : "play", 201))
                .addAction(R.drawable.bgm_icon_next, "随机下一首", action("next", 202))
                .addAction(R.drawable.bgm_icon_stop, "关闭音乐", action("stop", 203))
                .setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0, 1))
                .build();
    }

    private void showForeground() {
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        else startForeground(NOTIFICATION, notification());
        foreground = true;
    }

    private PendingIntent openApp() {
        return PendingIntent.getActivity(this, 40, new Intent(this, MainActivity.class).putExtra("page", "cat")
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private PendingIntent action(String command, int id) {
        Intent intent = new Intent(this, BgmService.class).setAction(command);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        return command.equals("play") || command.equals("next") ? PendingIntent.getForegroundService(this, id, intent, flags)
                : PendingIntent.getService(this, id, intent, flags);
    }

    private void fail(String message) {
        error = message;
        wanted = false;
        resumeOnFocus = false;
        status = "paused";
        releasePlayer();
        focused = false;
        audio.abandonAudioFocusRequest(focusRequest);
        publish(false);
        stopSelf();
    }

    private void stopMusic() {
        if (destroyed) return;
        wanted = false;
        resumeOnFocus = false;
        status = "stopped";
        error = "";
        savedPosition = 0;
        releasePlayer();
        BgmStore.playback(this, track, 0, status, "");
        stopSelf();
    }

    private void releasePlayer() {
        handler.removeCallbacks(fade);
        if (player != null) { player.release(); player = null; }
        prepared = false;
    }

    @Override public void onDestroy() {
        destroyed = true;
        wanted = false;
        resumeOnFocus = false;
        handler.removeCallbacksAndMessages(null);
        savedPosition = position();
        releasePlayer();
        audio.abandonAudioFocusRequest(focusRequest);
        unregisterReceiver(noisy);
        session.release();
        alive = false;
        if (!status.equals("stopped")) status = "paused";
        BgmStore.playback(this, track, savedPosition, status, error);
        stopForeground(STOP_FOREGROUND_REMOVE);
        getSystemService(NotificationManager.class).cancel(NOTIFICATION);
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
