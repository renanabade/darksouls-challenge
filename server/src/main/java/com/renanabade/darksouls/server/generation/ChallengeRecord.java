package com.renanabade.darksouls.server.generation;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.ColumnTransformer;

/** A generated challenge, stored once per code. The document is what clients read; it is never queried inside. */
@Entity
@Table(name = "challenges")
public class ChallengeRecord {
    @Id
    private UUID id;

    private String code;

    @Column(name = "data_version")
    private String dataVersion;

    @Column(name = "generator_version")
    private String generatorVersion;

    /** What finishing it is worth on the ranking. */
    private int score;

    @ColumnTransformer(write = "?::jsonb")
    private String document;

    @Column(name = "created_at")
    private Instant createdAt;

    protected ChallengeRecord() {}

    public ChallengeRecord(UUID id, String code, String dataVersion, String generatorVersion, int score, String document, Instant createdAt) {
        this.id = id;
        this.code = code;
        this.dataVersion = dataVersion;
        this.generatorVersion = generatorVersion;
        this.score = score;
        this.document = document;
        this.createdAt = createdAt;
    }

    public UUID id() {
        return id;
    }

    public String code() {
        return code;
    }

    public int score() {
        return score;
    }

    public String document() {
        return document;
    }
}
