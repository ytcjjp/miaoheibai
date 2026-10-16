package com.zixian.assistant;

import android.app.Activity;
import android.Manifest;
import android.content.pm.PackageManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.media.AudioManager;
import android.provider.Settings;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONObject;

public final class MainActivity extends Activity {
    private WebView webView;
    private AssistantBridge assistantBridge;
    private boolean pageReady;
    private boolean startLaunchMusic;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        startLaunchMusic = savedInstanceState == null;
        setVolumeControlStream(AudioManager.STREAM_MUSIC);
        Window window = getWindow();
        window.setStatusBarColor(0xFFFFF0EC);
        window.setNavigationBarColor(0xFFFFFAF8);
        window.getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);

        webView = new WebView(this);
        webView.setBackgroundColor(0xFFFFFAF8);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setAllowFileAccess(true);
        webView.getSettings().setAllowContentAccess(false);
        webView.addJavascriptInterface(new Bridge(), "AndroidTimer");
        assistantBridge = new AssistantBridge(this);
        webView.addJavascriptInterface(assistantBridge, "AndroidAssistant");
        webView.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String url) { pageReady = true; openRequestedPage(); }
            @Override public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest request) {
                return !"file:///android_asset/index.html".equals(request.getUrl().toString());
            }
        });
        setContentView(webView);
        webView.loadUrl("file:///android_asset/index.html");
        WeatherJobService.schedule(this);
    }

    @Override protected void onStart() {
        super.onStart();
        if (startLaunchMusic) {
            startLaunchMusic = false;
            try { BgmService.command(this, "launch"); }
            catch (RuntimeException exception) { assistantBridge.error("bgm", "背景音乐暂时无法启动，可在小黑猫页面点击播放"); }
        }
    }

    @Override protected void onResume() {
        super.onResume();
        if (webView != null) webView.evaluateJavascript("window.syncTimer && window.syncTimer()", null);
        if (webView != null) webView.evaluateJavascript("window.refreshAssistant && window.refreshAssistant()", null);
        if (webView != null) webView.evaluateJavascript("window.refreshBgm && window.refreshBgm()", null);
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        openRequestedPage();
    }

    private void openRequestedPage() {
        String page = getIntent().getStringExtra("page");
        if (page == null || webView == null || !pageReady) return;
        webView.evaluateJavascript("window.openAssistantPage && window.openAssistantPage(" + JSONObject.quote(page) + ")", null);
        getIntent().removeExtra("page");
    }

    void reply(String topic, JSONObject result) {
        runOnUiThread(() -> {
            if (!isDestroyed() && webView != null) webView.evaluateJavascript(
                    "window.onAssistantResult && window.onAssistantResult(" + JSONObject.quote(topic) + "," + result + ")", null);
        });
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == AssistantBridge.CALENDAR_PERMISSION) {
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) assistantBridge.readCalendar();
            else assistantBridge.error("calendar", "未获得日历读取权限，仍可手动添加事项");
        }
    }

    @Override public void onBackPressed() {
        if (webView != null) webView.evaluateJavascript("window.goHome && window.goHome()", result -> {
            if ("false".equals(result)) MainActivity.super.onBackPressed();
        });
        else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidTimer");
            webView.removeJavascriptInterface("AndroidAssistant");
            webView.destroy();
        }
        if (assistantBridge != null) assistantBridge.close();
        super.onDestroy();
    }

    private final class Bridge {
        @JavascriptInterface public String state() { return TimerStore.state(MainActivity.this); }
        @JavascriptInterface public String start(int seconds) {
            String result = TimerStore.start(MainActivity.this, seconds);
            if (TimerStore.runningDeadline(MainActivity.this) != 0) {
                TimerService.start(MainActivity.this);
                requestNotificationPermission();
            }
            return result;
        }
        @JavascriptInterface public String pause() {
            String result = TimerStore.pause(MainActivity.this);
            if (TimerStore.isPaused(MainActivity.this)) TimerService.stop(MainActivity.this);
            return result;
        }
        @JavascriptInterface public String resume() {
            String result = TimerStore.resume(MainActivity.this);
            if (TimerStore.runningDeadline(MainActivity.this) != 0) {
                TimerService.start(MainActivity.this);
                requestNotificationPermission();
            }
            return result;
        }
        @JavascriptInterface public String cancel() {
            String result = TimerStore.cancel(MainActivity.this);
            TimerService.stop(MainActivity.this);
            return result;
        }
        @JavascriptInterface public void requestExactAlarmPermission() {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return;
            runOnUiThread(() -> startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                    Uri.parse("package:" + getPackageName()))));
        }
    }

    void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            runOnUiThread(() -> requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1));
        }
    }
}
