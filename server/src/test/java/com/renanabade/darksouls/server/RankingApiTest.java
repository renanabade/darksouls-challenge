package com.renanabade.darksouls.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

class RankingApiTest extends ServerTest {
    private static final String PASSWORD = "Praise-the-Sun-1";

    private static String email() {
        return UUID.randomUUID().toString().replace("-", "") + "@example.test";
    }

    /** A signed-in client for a new player. */
    private Client player(String displayName) {
        var client = client();
        var email = email();
        assertEquals(200, client.post("/api/auth/register", Map.of("email", email, "password", PASSWORD)).status());
        var login = client.post("/api/auth/login", Map.of("email", email, "password", PASSWORD));
        assertEquals(200, login.status());
        client.token = login.json().get("accessToken").stringValue();
        if (displayName != null) assertEquals(200, client.put("/api/me", Map.of("displayName", displayName)).status());
        return client;
    }

    private String challenge(String seed) {
        return readyJob(Map.of("seed", seed, "length", "short")).get("challengeId").stringValue();
    }

    private static Answer submit(Client client, String challengeId, int deaths, String proofUrl) {
        Map<String, Object> body = new HashMap<>();
        body.put("challengeId", challengeId);
        body.put("deaths", deaths);
        if (proofUrl != null) body.put("proofUrl", proofUrl);
        return client.put("/api/runs", body);
    }

    private static Answer submit(Client client, String challengeId) {
        return submit(client, challengeId, 3, null);
    }

    @Test
    void needs_a_login_for_what_is_personal() {
        var anonymous = client();
        assertEquals(401, anonymous.get("/api/me").status());
        assertEquals(401, submit(anonymous, UUID.randomUUID().toString()).status());
        assertEquals(200, anonymous.get("/api/ranking").status());
    }

    @Test
    void refuses_a_wrong_password() {
        var client = client();
        var email = email();
        client.post("/api/auth/register", Map.of("email", email, "password", PASSWORD));
        assertEquals(401, client.post("/api/auth/login", Map.of("email", email, "password", "wrong")).status());
        assertEquals(401, client.post("/api/auth/login", Map.of("email", email(), "password", PASSWORD)).status());
    }

    @ParameterizedTest
    @ValueSource(strings = {"weak", "alllowercase-1", "ALLUPPERCASE-1", "NoDigits-here", "NoSymbols1here"})
    void refuses_a_weak_password(String password) {
        var answer = client().post("/api/auth/register", Map.of("email", email(), "password", password));
        assertEquals(400, answer.status());
        assertTrue(answer.json().get("errors").size() > 0);
    }

    @Test
    void refuses_an_email_already_taken_whatever_its_case() {
        var email = email();
        assertEquals(200, client().post("/api/auth/register", Map.of("email", email, "password", PASSWORD)).status());
        assertEquals(400, client().post("/api/auth/register", Map.of("email", email.toUpperCase(java.util.Locale.ROOT), "password", PASSWORD)).status());
    }

    @Test
    void a_refresh_token_gets_a_new_pair_and_opens_nothing_else() {
        var client = client();
        var email = email();
        client.post("/api/auth/register", Map.of("email", email, "password", PASSWORD));
        var tokens = client.post("/api/auth/login", Map.of("email", email, "password", PASSWORD)).json();
        var access = tokens.get("accessToken").stringValue();
        var refresh = tokens.get("refreshToken").stringValue();

        client.token = refresh;
        assertEquals(401, client.get("/api/me").status());
        client.token = null;
        assertEquals(401, client.post("/api/auth/refresh", Map.of("refreshToken", access)).status());
        assertEquals(401, client.post("/api/auth/refresh", Map.of("refreshToken", "not a token")).status());

        var renewed = client.post("/api/auth/refresh", Map.of("refreshToken", refresh));
        assertEquals(200, renewed.status());
        client.token = renewed.json().get("accessToken").stringValue();
        assertEquals(email, client.get("/api/me").json().get("email").stringValue());
    }

    @ParameterizedTest
    @ValueSource(strings = {"ab", "<script>", "a name that is much too long to be shown"})
    void refuses_a_bad_display_name(String displayName) {
        assertEquals(400, player(null).put("/api/me", Map.of("displayName", displayName)).status());
    }

    @Test
    void keeps_display_names_unique() {
        var name = unique("Solaire");
        var first = player(name);
        var second = player(null);
        var conflict = second.put("/api/me", Map.of("displayName", name));
        assertEquals(409, conflict.status());
        assertEquals("that name is taken", conflict.json().stringValue());

        // Asking again for your own name is not a conflict.
        assertEquals(200, first.put("/api/me", Map.of("displayName", name)).status());
    }

    @Test
    void needs_a_display_name_and_a_real_challenge_to_record_a_run() {
        var challenge = challenge("nameless");
        assertEquals(400, submit(player(null), challenge).status());
        assertEquals(404, submit(player(unique("Oscar")), UUID.randomUUID().toString()).status());
    }

    @ParameterizedTest
    @CsvSource(value = {"-1,", "0,http://example.test/video", "0,javascript:alert(1)", "0,not a link"})
    void refuses_a_bad_run(int deaths, String proofUrl) {
        var challenge = challenge("bad-run");
        assertEquals(400, submit(player(unique("Siegmeyer")), challenge, deaths, proofUrl).status());
    }

    @Test
    void ranks_players_by_the_score_of_what_they_finished() {
        var one = challenge("rank-1");
        var two = challenge("rank-2");
        var leaderName = unique("Leader");
        var otherName = unique("Other");
        var leader = player(leaderName);
        var other = player(otherName);
        assertEquals(200, submit(leader, one).status());
        assertEquals(200, submit(leader, two, 0, "https://example.test/run").status());
        assertEquals(200, submit(other, one).status());

        var anonymous = client();
        var ranking = anonymous.get("/api/ranking").json();
        var entries = ranking.get("entries");
        assertEquals(2, ranking.get("total").intValue());
        assertEquals(leaderName, entries.get(0).get("displayName").stringValue());
        assertEquals(1, entries.get(0).get("rank").intValue());
        assertEquals(2, entries.get(0).get("runs").intValue());
        assertEquals(otherName, entries.get(1).get("displayName").stringValue());
        assertTrue(entries.get(0).get("score").intValue() > entries.get(1).get("score").intValue());

        assertEquals(2, anonymous.get("/api/challenges/" + one + "/runs").json().size());
    }

    @Test
    void shows_no_email_in_public() {
        var challenge = challenge("private");
        submit(player(unique("Laurentius")), challenge);
        var anonymous = client();
        assertFalse(anonymous.get("/api/ranking").body().contains("example.test"));
        assertFalse(anonymous.get("/api/challenges/" + challenge + "/runs").body().contains("@"));
    }

    @Test
    void counts_a_challenge_once_and_lets_a_player_correct_or_remove_it() {
        var challenge = challenge("once");
        var player = player(unique("Patches"));
        submit(player, challenge, 9, null);
        assertEquals(2, submit(player, challenge, 2, null).json().get("deaths").intValue());
        assertEquals(1, player.get("/api/me/runs").json().size());

        assertEquals(204, player.delete("/api/runs/" + challenge).status());
        assertEquals(404, player.delete("/api/runs/" + challenge).status());
        assertEquals(0, player.get("/api/me/runs").json().size());
    }

    @Test
    void pages_the_ranking() {
        var challenge = challenge("pages");
        for (var i = 0; i < 3; i++) submit(player(unique("Page" + i)), challenge);

        var page = client().get("/api/ranking?offset=1&limit=1").json();
        assertEquals(3, page.get("total").intValue());
        assertEquals(2, page.get("entries").get(0).get("rank").intValue());
        assertEquals(1, page.get("entries").size());
    }
}
