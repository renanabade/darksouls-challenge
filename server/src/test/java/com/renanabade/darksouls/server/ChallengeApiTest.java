package com.renanabade.darksouls.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.renanabade.darksouls.core.World;
import com.renanabade.darksouls.core.generation.Generator;
import com.renanabade.darksouls.core.generation.GeneratorConfig;
import com.renanabade.darksouls.core.generation.Length;
import com.renanabade.darksouls.core.generation.Manual;
import com.renanabade.darksouls.core.orders.Difficulty;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;

class ChallengeApiTest extends ServerTest {
    @Autowired
    private World world;

    @Autowired
    private DataSource dataSource;

    private void queueJob(String code) {
        jdbc.update(
                "INSERT INTO generation_jobs (id, code, status, created_at) VALUES (?, ?, 'QUEUED', ?)",
                Ids.next(), code, Timestamp.from(Instant.now()));
    }

    @Test
    void reports_its_health() {
        assertEquals("ok", client().get("/api/health").json().get("status").stringValue());
    }

    @Test
    void hosts_the_site_and_answers_not_found_for_unknown_api_routes() {
        var page = client().get("/?c=ds1.8.07-0000000000");
        assertEquals(200, page.status());
        assertTrue(page.body().contains("app-root"));
        assertTrue(client().get("/ranking").body().contains("app-root"), "an address of the site's router");
        assertEquals(404, client().get("/api/nothing").status());
    }

    @Test
    void offers_what_a_client_may_fix() {
        var options = client().get("/api/options").json();
        assertEquals(10, options.get("classes").size());
        assertEquals("Bandit", options.get("classes").get(0).get("name").stringValue());
        assertEquals("easy", options.get("difficulties").get(0).stringValue());
        assertEquals("short", options.get("lengths").get(0).stringValue());
        var hasNone = false;
        for (var gift : options.get("gifts")) hasNone |= gift.get("label").stringValue().equals("None");
        assertTrue(hasNone);
    }

    @Test
    void generates_a_requested_challenge_in_the_background() {
        var job = readyJob(Map.of("seed", "ashen-one", "difficulty", "hard", "length", "short", "startingClass", "Thief"));
        assertEquals("done", job.get("status").stringValue());
        var challenge = client().get("/api/challenges/" + job.get("challengeId").stringValue()).json();
        assertEquals(job.get("code").stringValue(), challenge.get("code").stringValue());
        assertEquals("Thief", challenge.get("setup").get("startingClass").stringValue());
        assertTrue(challenge.get("manual").stringValue().contains(challenge.get("code").stringValue()));
    }

    @Test
    void a_code_reproduces_what_the_generator_draws() {
        var expected = Generator.generate(world, new GeneratorConfig("777", Difficulty.MEDIUM, Length.SHORT));
        var job = readyJob(Map.of("code", expected.code()));
        var challenge = client().get("/api/challenges/" + job.get("challengeId").stringValue()).json();
        assertEquals(Manual.render(world, expected), challenge.get("manual").stringValue());
        var byCode = client().get("/api/challenges/by-code/" + expected.code().toLowerCase(Locale.ROOT)).json();
        assertEquals(expected.code(), byCode.get("code").stringValue());
    }

    @Test
    void stores_each_code_once_however_many_ask_for_it() {
        var first = readyJob(Map.of("seed", "same", "length", "short"));
        var second = readyJob(Map.of("code", first.get("code").stringValue()));
        assertEquals(first.get("challengeId").stringValue(), second.get("challengeId").stringValue());
        assertEquals(first.get("id").stringValue(), second.get("id").stringValue());
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM challenges", Integer.class));
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
        "{ \"code\": \"not a code\" }|this is not a challenge code",
        "{ \"code\": \"ds3.8.07-K3F9QX2M7T\" }|another game",
        "{ \"code\": \"ds1.7.07-0000000000\" }|generator 7",
        "{ \"startingClass\": \"Clown\" }|unknown class",
        "{ \"giftRow\": 1 }|unknown gift row",
        "{ \"levelCap\": 800 }|at most 713"
    })
    void refuses_what_cannot_be_generated(String body, String problem) {
        var response = client().post("/api/challenges", body);
        assertEquals(400, response.status());
        assertTrue(response.body().contains(problem), response.body());
    }

    @Test
    void answers_not_found_for_what_does_not_exist() {
        assertEquals(404, client().get("/api/jobs/" + UUID.randomUUID()).status());
        assertEquals(404, client().get("/api/challenges/" + UUID.randomUUID()).status());
        assertEquals(404, client().get("/api/jobs/not-an-id").status());
    }

    // Two workers never take one job: the second skips the row the first has locked.
    @Test
    void a_job_locked_by_one_worker_is_skipped_by_another() throws SQLException {
        queueJob("ds1.8.07-0000000000");
        try (var holding = dataSource.getConnection()) {
            holding.setAutoCommit(false);
            try (var statement = holding.createStatement()) {
                statement.executeQuery("SELECT * FROM generation_jobs FOR UPDATE");
            }

            assertFalse(worker.runNextJob());
            holding.rollback();
            holding.setAutoCommit(true);
        }

        // A worker that dies gives its lock back, and the job is taken again.
        assertTrue(worker.runNextJob());
    }

    @Test
    void a_job_that_cannot_generate_is_marked_failed() {
        queueJob("bad code");
        worker.runNextJob();
        var job = jdbc.queryForMap("SELECT status, error FROM generation_jobs WHERE code = 'bad code'");
        assertEquals("FAILED", job.get("status"));
        assertEquals("this is not a challenge code", job.get("error"));
    }

    @Test
    void shows_the_challenge_a_link_asks_for_and_tells_what_it_changed() {
        var expected = Generator.generate(world, new GeneratorConfig("777", Difficulty.MEDIUM, Length.SHORT));
        var preview = client().get("/api/previews?c=" + expected.code()).json();
        assertEquals(expected.code(), preview.get("code").stringValue());
        assertEquals(expected.code(), preview.get("view").get("code").stringValue());
        assertEquals(0, preview.get("notices").size());

        var legacy = client().get("/api/previews?seed=777&difficulty=medium&length=short&class=Clown").json();
        assertEquals(expected.code(), legacy.get("code").stringValue());
        assertTrue(legacy.get("notices").get(0).stringValue().contains("Clown"));

        var empty = client().get("/api/previews").json();
        assertNull(empty.get("view"));
    }

    @Test
    void shows_what_a_form_asks_for_or_says_why_not() {
        var drawn = client().post("/api/previews", Map.of("difficulty", "hard", "length", "short")).json();
        assertTrue(drawn.get("code").stringValue().startsWith("ds1.8."));
        assertEquals("hard", drawn.get("view").get("difficulty").stringValue());

        var unreadable = client().post("/api/previews", Map.of("code", "not a code")).json();
        assertNull(unreadable.get("view"));
        assertEquals("That code cannot be read: this is not a challenge code.", unreadable.get("notices").get(0).stringValue());

        var capped = client().post("/api/previews", Map.of("levelCap", 800)).json();
        assertEquals("The level cap must be from 1 to 713.", capped.get("notices").get(0).stringValue());
    }
}
