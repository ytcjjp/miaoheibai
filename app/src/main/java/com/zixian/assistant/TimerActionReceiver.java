package com.zixian.assistant;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public final class TimerActionReceiver extends BroadcastReceiver {
    static final String ACTION_PAUSE = "com.zixian.assistant.PAUSE_TIMER";
    static final String ACTION_CANCEL = "com.zixian.assistant.CANCEL_TIMER";
    static final String ACTION_STOP_ALERT = "com.zixian.assistant.STOP_ALERT";

    @Override public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (ACTION_PAUSE.equals(action)) {
            TimerStore.pause(context);
            if (TimerStore.isPaused(context)) TimerService.stop(context);
            return;
        }
        else if (ACTION_CANCEL.equals(action)) TimerStore.cancel(context);
        else if (ACTION_STOP_ALERT.equals(action)) TimerStore.dismissAlert(context);
        else return;
        TimerService.stop(context);
    }
}
