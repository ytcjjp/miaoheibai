package com.zixian.assistant;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public final class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) TimerStore.restoreAfterBoot(context);
        else if (Intent.ACTION_TIME_CHANGED.equals(intent.getAction())) TimerStore.rescheduleAfterClockChange(context);
    }
}
