package com.renanabade.darksouls.server.generation;

import com.renanabade.darksouls.core.InvalidOrderException;
import com.renanabade.darksouls.core.World;
import com.renanabade.darksouls.core.generation.ChallengeCode;
import com.renanabade.darksouls.core.generation.ChallengeDocument;
import com.renanabade.darksouls.core.generation.ChallengeScore;
import com.renanabade.darksouls.core.generation.CoreJson;
import com.renanabade.darksouls.core.generation.Generator;
import com.renanabade.darksouls.server.Ids;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.time.Instant;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.SmartLifecycle;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Generates queued challenges. A job is taken with FOR UPDATE SKIP LOCKED inside a transaction that lasts as long as the work: if the
 * process dies, the lock goes with it and the job is queued again. No broker to run, and no state a crash can leave behind. It runs on
 * a platform thread: generating is pure CPU, which a virtual thread would gain nothing from.
 */
@Component
public class GenerationWorker implements SmartLifecycle {
    /** How often the table is checked without a signal: for jobs left by a process that died. */
    private static final long POLL_MILLIS = 5_000;

    private static final Logger LOG = LoggerFactory.getLogger(GenerationWorker.class);

    private final JobRepository jobs;
    private final ChallengeRepository challenges;
    private final World world;
    private final GenerationSignal signal;
    private final TransactionTemplate transactions;
    private final boolean background;
    private final Counter jobsDone;
    private final Counter jobsFailed;
    private final Timer duration;
    private volatile Thread thread;

    public GenerationWorker(
            JobRepository jobs,
            ChallengeRepository challenges,
            World world,
            GenerationSignal signal,
            PlatformTransactionManager transactionManager,
            MeterRegistry meters,
            @Value("${generation.background}") boolean background) {
        this.jobs = jobs;
        this.challenges = challenges;
        this.world = world;
        this.signal = signal;
        this.transactions = new TransactionTemplate(transactionManager);
        this.background = background;
        jobsDone = meters.counter("generation.jobs", "outcome", "done");
        jobsFailed = meters.counter("generation.jobs", "outcome", "failed");
        duration = meters.timer("generation.duration");
    }

    /** Runs one queued job, if there is any. Returns whether there was one. */
    public boolean runNextJob() {
        return Boolean.TRUE.equals(transactions.execute(status -> {
            var taken = jobs.takeNextQueued();
            if (taken.isEmpty()) return false;
            var job = taken.get();
            try {
                var existing = challenges.findByCode(job.code()).map(ChallengeRecord::id);
                job.finish(existing.orElseGet(() -> duration.record(() -> generate(job.code()))), Instant.now());
                jobsDone.increment();
            } catch (IllegalArgumentException | IllegalStateException | InvalidOrderException error) {
                job.fail(error.getMessage(), Instant.now());
                jobsFailed.increment();
                LOG.warn("Could not generate {}", job.code(), error);
            }

            jobs.save(job);
            return true;
        }));
    }

    private UUID generate(String code) {
        var reading = ChallengeCode.decode(world, code);
        if (!reading.ok()) throw new IllegalArgumentException(reading.problem());
        var challenge = Generator.generate(world, reading.decoded().config());
        var record = new ChallengeRecord(
                Ids.next(),
                code,
                challenge.dataVersion(),
                Generator.VERSION,
                ChallengeScore.of(challenge),
                CoreJson.write(ChallengeDocument.from(world, challenge)),
                Instant.now());
        challenges.save(record);
        return record.id();
    }

    private void loop() {
        while (!Thread.currentThread().isInterrupted()) {
            try {
                while (runNextJob()) {
                    if (Thread.currentThread().isInterrupted()) return;
                }

                signal.await(POLL_MILLIS);
            } catch (InterruptedException stopping) {
                Thread.currentThread().interrupt();
            } catch (RuntimeException error) {
                // The database is away, or a job could not be saved: its lock is gone, so it will be taken again.
                LOG.error("The generation loop failed", error);
                try {
                    Thread.sleep(POLL_MILLIS);
                } catch (InterruptedException stopping) {
                    Thread.currentThread().interrupt();
                }
            }
        }
    }

    @Override
    public void start() {
        if (background && thread == null) {
            thread = Thread.ofPlatform().name("generation-worker").daemon().start(this::loop);
        }
    }

    @Override
    public void stop() {
        var running = thread;
        thread = null;
        if (running == null) return;
        running.interrupt();
        try {
            running.join(POLL_MILLIS);
        } catch (InterruptedException stopping) {
            Thread.currentThread().interrupt();
        }
    }

    @Override
    public boolean isRunning() {
        return thread != null;
    }
}
