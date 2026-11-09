package com.renanabade.darksouls.server.generation;

import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import org.springframework.stereotype.Component;

/** Wakes the worker when a job is queued, so it does not wait for its next look at the table. */
@Component
public class GenerationSignal {
    private final Semaphore pending = new Semaphore(0);

    public void notifyWorker() {
        pending.release();
    }

    public void await(long millis) throws InterruptedException {
        if (pending.tryAcquire(millis, TimeUnit.MILLISECONDS)) pending.drainPermits();
    }
}
