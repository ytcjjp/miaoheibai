package com.zixian.assistant;

import android.app.Activity;
import android.app.SearchManager;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.ResolveInfo;
import android.os.Bundle;
import android.provider.MediaStore;
import android.widget.Toast;

public final class SystemMusicActivity extends Activity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        if (state == null) openMusic("play".equals(getIntent().getAction()));
        finish();
    }

    private void openMusic(boolean play) {
        Intent open = Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_MUSIC);
        ResolveInfo preferred = getPackageManager().resolveActivity(open, 0);
        ComponentName player = null;
        // A chooser is not a default player. Only accept an installed music handler.
        if (preferred != null) {
            for (ResolveInfo candidate : getPackageManager().queryIntentActivities(open, 0)) {
                if (candidate.activityInfo.packageName.equals(preferred.activityInfo.packageName)
                        && candidate.activityInfo.name.equals(preferred.activityInfo.name)) {
                    player = new ComponentName(candidate.activityInfo.packageName, candidate.activityInfo.name);
                    break;
                }
            }
        }
        stopService(new Intent(this, BgmService.class));
        if (play) {
            Intent request = new Intent(MediaStore.INTENT_ACTION_MEDIA_PLAY_FROM_SEARCH)
                    .putExtra(SearchManager.QUERY, "")
                    .putExtra(MediaStore.EXTRA_MEDIA_FOCUS, "vnd.android.cursor.item/audio");
            if (player != null) request.setPackage(player.getPackageName());
            if (launch(request)) return;
        }
        if (player != null) open = new Intent(Intent.ACTION_MAIN).setComponent(player);
        if (launch(open)) {
            if (play) Toast.makeText(this, "已打开音乐播放器，请选择音频播放", Toast.LENGTH_SHORT).show();
            return;
        }
        if (launch(new Intent(MediaStore.INTENT_ACTION_MUSIC_PLAYER))) {
            if (play) Toast.makeText(this, "已打开音乐播放器，请选择音频播放", Toast.LENGTH_SHORT).show();
            return;
        }
        Toast.makeText(this, "没有可用的音乐播放器，请先安装或启用音乐应用", Toast.LENGTH_LONG).show();
    }

    private boolean launch(Intent intent) {
        try { startActivity(intent); return true; }
        catch (ActivityNotFoundException | SecurityException unavailable) { return false; }
    }
}
