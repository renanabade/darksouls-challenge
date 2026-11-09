package com.renanabade.darksouls.server.ranking;

import com.renanabade.darksouls.server.Ids;
import com.renanabade.darksouls.server.auth.AppUser;
import com.renanabade.darksouls.server.auth.UserRepository;
import com.renanabade.darksouls.server.config.ApiErrors;
import com.renanabade.darksouls.server.generation.ChallengeRepository;
import java.net.URI;
import java.net.URISyntaxException;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Limit;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Profiles, runs and the ranking. A run is the player's own word: the server checks only that the challenge is real, and takes its
 * score from what it generated, never from the client.
 */
@RestController
@RequestMapping("/api")
public class RankingController {
    private static final int MAX_DEATHS = 100_000;
    private static final int MAX_PAGE_SIZE = 100;
    private static final int DEFAULT_PAGE_SIZE = 50;

    private final UserRepository users;
    private final ChallengeRepository challenges;
    private final RunRepository runs;
    private final JdbcClient jdbc;

    public record ProfileResponse(String email, String displayName) {}

    public record UpdateProfileRequest(String displayName) {}

    /** A player's word that they finished a challenge. */
    public record SubmitRunRequest(UUID challengeId, int deaths, String proofUrl) {}

    public record RankingEntry(int rank, String displayName, long score, long runs) {}

    public record RankingPage(List<RankingEntry> entries, int offset, long total) {}

    public RankingController(UserRepository users, ChallengeRepository challenges, RunRepository runs, JdbcClient jdbc) {
        this.users = users;
        this.challenges = challenges;
        this.runs = runs;
        this.jdbc = jdbc;
    }

    private static UUID userIdOf(Jwt token) {
        return UUID.fromString(token.getSubject());
    }

    @GetMapping("/me")
    ResponseEntity<ProfileResponse> profile(@AuthenticationPrincipal Jwt token) {
        return users.findById(userIdOf(token))
                .map(user -> ResponseEntity.ok(new ProfileResponse(user.email(), user.displayName())))
                .orElse(ResponseEntity.status(HttpStatus.UNAUTHORIZED).build());
    }

    @PutMapping("/me")
    ResponseEntity<Object> updateProfile(@RequestBody UpdateProfileRequest request, @AuthenticationPrincipal Jwt token) {
        var name = request.displayName() == null ? "" : request.displayName().strip();
        if (name.length() < 3 || name.length() > AppUser.MAX_DISPLAY_NAME_LENGTH || !name.matches("[A-Za-z0-9 _-]+")) {
            return ApiErrors.validation("displayName", "a name has 3 to " + AppUser.MAX_DISPLAY_NAME_LENGTH + " letters, digits, spaces, hyphens or underscores");
        }

        var user = users.findById(userIdOf(token)).orElse(null);
        if (user == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (users.existsByDisplayNameAndIdNot(name, user.id())) return ApiErrors.message(HttpStatus.CONFLICT, "that name is taken");
        user.setDisplayName(name);
        try {
            users.save(user);
        } catch (DataIntegrityViolationException sameNameAtOnce) {
            // Two players asking for one name at once: the unique index decides.
            return ApiErrors.message(HttpStatus.CONFLICT, "that name is taken");
        }

        return ResponseEntity.ok(new ProfileResponse(user.email(), user.displayName()));
    }

    @GetMapping("/me/runs")
    List<RunResponse> myRuns(@AuthenticationPrincipal Jwt token) {
        return runs.ofUser(userIdOf(token), Limit.of(MAX_PAGE_SIZE));
    }

    @GetMapping("/challenges/{id}/runs")
    List<RunResponse> challengeRuns(@PathVariable UUID id) {
        return runs.ofChallenge(id, Limit.of(MAX_PAGE_SIZE));
    }

    /** Records a finished challenge, or corrects the player's own earlier record of it. */
    @PutMapping("/runs")
    ResponseEntity<Object> submitRun(@RequestBody SubmitRunRequest request, @AuthenticationPrincipal Jwt token) {
        if (request.deaths() < 0 || request.deaths() > MAX_DEATHS) return ApiErrors.validation("deaths", "deaths must be from 0 to " + MAX_DEATHS);
        var proof = request.proofUrl() == null || request.proofUrl().isBlank() ? null : request.proofUrl().strip();
        if (proof != null && !isHttpsLink(proof)) return ApiErrors.validation("proofUrl", "the proof must be an https link");

        var userId = userIdOf(token);
        var user = users.findById(userId).orElse(null);
        if (user == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (user.displayName() == null) return ApiErrors.validation("displayName", "choose a display name before recording a run");
        var challenge = request.challengeId() == null ? null : challenges.findById(request.challengeId()).orElse(null);
        if (challenge == null) return ApiErrors.message(HttpStatus.NOT_FOUND, "that challenge does not exist");

        var run = runs.findOne(userId, challenge.id()).orElseGet(() -> new RunRecord(Ids.next(), user, challenge, Instant.now()));
        run.correct(request.deaths(), proof);
        run = runs.save(run);
        return ResponseEntity.ok(new RunResponse(challenge.id(), challenge.code(), user.displayName(), challenge.score(), run.deaths(), run.proofUrl(), run.finishedAt()));
    }

    private static boolean isHttpsLink(String text) {
        if (text.length() > RunRecord.MAX_PROOF_URL_LENGTH) return false;
        try {
            var uri = new URI(text);
            return "https".equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null;
        } catch (URISyntaxException notALink) {
            return false;
        }
    }

    @DeleteMapping("/runs/{challengeId}")
    ResponseEntity<Void> deleteRun(@PathVariable UUID challengeId, @AuthenticationPrincipal Jwt token) {
        return runs.deleteOne(userIdOf(token), challengeId) > 0 ? ResponseEntity.noContent().build() : ResponseEntity.notFound().build();
    }

    /** Players by the score of everything they finished. Ties go to whoever got there first. */
    @GetMapping("/ranking")
    RankingPage ranking(@RequestParam(required = false) Integer offset, @RequestParam(required = false) Integer limit) {
        var skip = Math.max(0, offset == null ? 0 : offset);
        var take = Math.clamp(limit == null ? DEFAULT_PAGE_SIZE : limit, 1, MAX_PAGE_SIZE);
        var total = jdbc.sql("SELECT COUNT(DISTINCT user_id) FROM runs").query(Long.class).single();
        var position = new int[] {skip};
        var entries = jdbc.sql("""
                        SELECT u.display_name, t.score, t.runs
                        FROM (
                            SELECT r.user_id, SUM(c.score) AS score, COUNT(*) AS runs, MAX(r.finished_at) AS last_finished
                            FROM runs r
                            JOIN challenges c ON c.id = r.challenge_id
                            GROUP BY r.user_id
                        ) t
                        JOIN users u ON u.id = t.user_id
                        ORDER BY t.score DESC, t.last_finished, t.user_id
                        OFFSET :skip LIMIT :take
                        """)
                .param("skip", skip)
                .param("take", take)
                .query((row, index) -> new RankingEntry(
                        position[0] + index + 1,
                        row.getString("display_name") == null ? "" : row.getString("display_name"),
                        row.getLong("score"),
                        row.getLong("runs")))
                .list();
        return new RankingPage(entries, skip, total);
    }
}
