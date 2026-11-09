package com.renanabade.darksouls.server.generation;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChallengeRepository extends JpaRepository<ChallengeRecord, UUID> {
    Optional<ChallengeRecord> findByCode(String code);
}
