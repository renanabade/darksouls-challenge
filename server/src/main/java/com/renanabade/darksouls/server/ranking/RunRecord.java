package com.renanabade.darksouls.server.ranking;

import com.renanabade.darksouls.server.auth.AppUser;
import com.renanabade.darksouls.server.generation.ChallengeRecord;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** A player's word that they finished a challenge. One per player and challenge. */
@Entity
@Table(name = "runs")
public class RunRecord {
    public static final int MAX_PROOF_URL_LENGTH = 300;

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id")
    private AppUser user;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "challenge_id")
    private ChallengeRecord challenge;

    private int deaths;

    @Column(name = "proof_url")
    private String proofUrl;

    @Column(name = "finished_at")
    private Instant finishedAt;

    protected RunRecord() {}

    public RunRecord(UUID id, AppUser user, ChallengeRecord challenge, Instant finishedAt) {
        this.id = id;
        this.user = user;
        this.challenge = challenge;
        this.finishedAt = finishedAt;
    }

    public int deaths() {
        return deaths;
    }

    public String proofUrl() {
        return proofUrl;
    }

    public Instant finishedAt() {
        return finishedAt;
    }

    public void correct(int newDeaths, String newProofUrl) {
        deaths = newDeaths;
        proofUrl = newProofUrl;
    }
}
