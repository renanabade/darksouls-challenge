package com.renanabade.darksouls.server.ranking;

import java.time.Instant;
import java.util.UUID;

public record RunResponse(UUID challengeId, String code, String displayName, int score, int deaths, String proofUrl, Instant finishedAt) {}
