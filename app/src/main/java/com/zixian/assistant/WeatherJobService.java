package com.zixian.assistant;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

public final class WeatherJobService extends JobService {
    private static final int JOB_ID = 200;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private Future<?> pending;

    static void schedule(Context context) {
        if (WeatherRepository.snapshot(context).optJSONObject("city") == null) return;
        JobScheduler scheduler = (JobScheduler) context.getSystemService(JOB_SCHEDULER_SERVICE);
        if (scheduler.getPendingJob(JOB_ID) == null) scheduler.schedule(new JobInfo.Builder(JOB_ID,
                new ComponentName(context, WeatherJobService.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPeriodic(60 * 60_000L).setPersisted(true).build());
    }

    @Override public boolean onStartJob(JobParameters params) {
        pending = executor.submit(() -> {
            boolean retry = false;
            try { retry = WeatherRepository.refresh(this, false).has("error"); }
            catch (Exception ignored) { retry = true; }
            if (!Thread.currentThread().isInterrupted()) jobFinished(params, retry);
        });
        return true;
    }

    @Override public boolean onStopJob(JobParameters params) {
        if (pending != null) pending.cancel(true);
        return true;
    }

    @Override public void onDestroy() { executor.shutdownNow(); super.onDestroy(); }
}
