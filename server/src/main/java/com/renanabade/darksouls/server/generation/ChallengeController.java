package com.renanabade.darksouls.server.generation;

import com.renanabade.darksouls.core.World;
import com.renanabade.darksouls.core.generation.ChallengeCode;
import com.renanabade.darksouls.core.generation.GenerationRequest;
import com.renanabade.darksouls.core.generation.GeneratorConfig;
import com.renanabade.darksouls.core.generation.SetupOptions;
import com.renanabade.darksouls.server.Ids;
import com.renanabade.darksouls.server.config.ApiErrors;
import java.net.URI;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class ChallengeController {
    private final World world;
    private final ChallengeRepository challenges;
    private final JobRepository jobs;
    private final GenerationSignal signal;
    private final JdbcTemplate jdbc;

    public record JobResponse(UUID id, String code, String status, UUID challengeId, String error) {}

    public ChallengeController(World world, ChallengeRepository challenges, JobRepository jobs, GenerationSignal signal, JdbcTemplate jdbc) {
        this.world = world;
        this.challenges = challenges;
        this.jobs = jobs;
        this.signal = signal;
        this.jdbc = jdbc;
    }

    @GetMapping("/health")
    ResponseEntity<Object> health() {
        try {
            jdbc.queryForObject("SELECT 1", Integer.class);
            return ResponseEntity.ok(java.util.Map.of("status", "ok"));
        } catch (org.springframework.dao.DataAccessException unreachable) {
            return ResponseEntity.status(503).body(java.util.Map.of("status", "the database is unreachable"));
        }
    }

    @GetMapping("/options")
    SetupOptions options() {
        return SetupOptions.of(world);
    }

    /**
     * Stores a challenge, generating it when no one asked for that code before. The answer is the job to watch; a job already done
     * means the challenge is ready.
     */
    @PostMapping("/challenges")
    ResponseEntity<Object> create(@RequestBody CreateChallengeRequest request) {
        var problem = problemOf(request);
        if (!problem.isEmpty()) return ApiErrors.validation("request", problem);
        var code = ChallengeCode.encode(world, configOf(request));

        var job = jobs.findFirstByCodeAndStatusNot(code, JobStatus.FAILED).orElse(null);
        if (job == null) {
            var existing = challenges.findByCode(code).map(ChallengeRecord::id).orElse(null);
            job = jobs.save(new GenerationJob(Ids.next(), code, existing == null ? JobStatus.QUEUED : JobStatus.DONE, existing, Instant.now()));
            signal.notifyWorker();
        }

        return ResponseEntity.accepted().location(URI.create("/api/jobs/" + job.id())).body(toResponse(job));
    }

    @GetMapping("/jobs/{id}")
    ResponseEntity<JobResponse> job(@PathVariable UUID id) {
        return ResponseEntity.of(jobs.findById(id).map(ChallengeController::toResponse));
    }

    @GetMapping("/challenges/{id}")
    ResponseEntity<String> challenge(@PathVariable UUID id) {
        return document(challenges.findById(id).orElse(null));
    }

    @GetMapping("/challenges/by-code/{code}")
    ResponseEntity<String> challengeByCode(@PathVariable String code) {
        var reading = ChallengeCode.decode(world, code);
        if (!reading.ok()) return ResponseEntity.notFound().build();
        var canonical = ChallengeCode.encode(world, reading.decoded().config());
        return document(challenges.findByCode(canonical).orElse(null));
    }

    private static ResponseEntity<String> document(ChallengeRecord record) {
        return record == null
                ? ResponseEntity.notFound().build()
                : ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(record.document());
    }

    private static JobResponse toResponse(GenerationJob job) {
        return new JobResponse(job.id(), job.code(), job.status().label(), job.challengeId(), job.error());
    }

    private GeneratorConfig configOf(CreateChallengeRequest request) {
        if (request.code() != null) return ChallengeCode.decode(world, request.code()).decoded().config();
        return new GeneratorConfig(
                request.seed() != null ? request.seed().strip() : GenerationRequest.drawSeed(),
                request.difficulty(),
                request.length(),
                request.curve(),
                request.startingClass() == null ? null : request.startingClass().strip(),
                request.giftRow(),
                request.levelCap());
    }

    private String problemOf(CreateChallengeRequest request) {
        if (request.code() != null) {
            var reading = ChallengeCode.decode(world, request.code());
            if (!reading.ok()) return reading.problem();
            var decoded = reading.decoded();
            return decoded.isCurrent()
                    ? ""
                    : "this code was made by generator " + decoded.generatorVersion() + " and data " + decoded.dataVersion() + ", and gives another challenge now";
        }

        var problems = new GenerationRequest(null, request.seed(), null, null, null, request.startingClass(), request.giftRow(), request.levelCap()).problems();
        if (!problems.isEmpty()) return String.join("; ", problems);
        return settingsProblem(world, request);
    }

    /** What the data set does not hold. Empty when it holds all of it. */
    static String settingsProblem(World world, CreateChallengeRequest request) {
        var name = request.startingClass();
        if (name != null && !world.classes().containsKey(name.strip())) return "unknown class \"" + name + "\"";
        var row = request.giftRow();
        if (row != null && world.gifts().stream().noneMatch(g -> g.row() == row)) return "unknown gift row " + row;
        return "";
    }
}
