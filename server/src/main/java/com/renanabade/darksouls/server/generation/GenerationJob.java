package com.renanabade.darksouls.server.generation;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** A challenge to generate. Workers take jobs with FOR UPDATE SKIP LOCKED. */
@Entity
@Table(name = "generation_jobs")
public class GenerationJob {
    @Id
    private UUID id;

    private String code;

    @Enumerated(EnumType.STRING)
    private JobStatus status;

    @Column(name = "challenge_id")
    private UUID challengeId;

    private String error;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "finished_at")
    private Instant finishedAt;

    protected GenerationJob() {}

    public GenerationJob(UUID id, String code, JobStatus status, UUID challengeId, Instant createdAt) {
        this.id = id;
        this.code = code;
        this.status = status;
        this.challengeId = challengeId;
        this.createdAt = createdAt;
    }

    public UUID id() {
        return id;
    }

    public String code() {
        return code;
    }

    public JobStatus status() {
        return status;
    }

    public UUID challengeId() {
        return challengeId;
    }

    public String error() {
        return error;
    }

    public void finish(UUID challenge, Instant at) {
        status = JobStatus.DONE;
        challengeId = challenge;
        finishedAt = at;
    }

    public void fail(String why, Instant at) {
        status = JobStatus.FAILED;
        error = why;
        finishedAt = at;
    }
}
