package com.renanabade.darksouls.server.generation;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface JobRepository extends JpaRepository<GenerationJob, UUID> {
    Optional<GenerationJob> findFirstByCodeAndStatusNot(String code, JobStatus status);

    /** The oldest queued job no other worker holds. The lock lasts as long as the caller's transaction. */
    @Query(
            value = "SELECT * FROM generation_jobs WHERE status = 'QUEUED' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED",
            nativeQuery = true)
    Optional<GenerationJob> takeNextQueued();
}
