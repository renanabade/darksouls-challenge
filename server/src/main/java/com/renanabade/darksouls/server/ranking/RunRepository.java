package com.renanabade.darksouls.server.ranking;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public interface RunRepository extends JpaRepository<RunRecord, UUID> {
    @Query("SELECT r FROM RunRecord r WHERE r.user.id = :userId AND r.challenge.id = :challengeId")
    Optional<RunRecord> findOne(@Param("userId") UUID userId, @Param("challengeId") UUID challengeId);

    @Query("""
            SELECT new com.renanabade.darksouls.server.ranking.RunResponse(
                r.challenge.id, r.challenge.code, COALESCE(r.user.displayName, ''), r.challenge.score, r.deaths, r.proofUrl, r.finishedAt)
            FROM RunRecord r WHERE r.user.id = :userId ORDER BY r.finishedAt DESC
            """)
    List<RunResponse> ofUser(@Param("userId") UUID userId, Limit limit);

    @Query("""
            SELECT new com.renanabade.darksouls.server.ranking.RunResponse(
                r.challenge.id, r.challenge.code, COALESCE(r.user.displayName, ''), r.challenge.score, r.deaths, r.proofUrl, r.finishedAt)
            FROM RunRecord r WHERE r.challenge.id = :challengeId ORDER BY r.finishedAt DESC
            """)
    List<RunResponse> ofChallenge(@Param("challengeId") UUID challengeId, Limit limit);

    @Transactional
    @Modifying
    @Query("DELETE FROM RunRecord r WHERE r.user.id = :userId AND r.challenge.id = :challengeId")
    int deleteOne(@Param("userId") UUID userId, @Param("challengeId") UUID challengeId);
}
