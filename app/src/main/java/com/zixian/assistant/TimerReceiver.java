package com.zixian.assistant;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public final class TimerReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        synchronized (TimerStore.class) {
            long deadline = intent.getLongExtra(TimerStore.EXTRA_DEADLINE, 0);
            if (!TimerStore.ACTION_FINISH.equals(intent.getAction()) || deadline == 0
                    || TimerStore.runningDeadline(context) != deadline) return;
            TimerStore.finish(context, deadline);
            TimerService.start(context);
        }
    }
}
