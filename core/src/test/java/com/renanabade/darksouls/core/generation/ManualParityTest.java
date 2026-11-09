package com.renanabade.darksouls.core.generation;

import static com.renanabade.darksouls.core.Fixtures.DS1;
import static org.junit.jupiter.api.Assertions.assertEquals;

import com.renanabade.darksouls.core.orders.Difficulty;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.StreamSupport;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Whole manuals, byte for byte, for what the snapshot test does not cover: full and epic journeys, every curve, fixed settings and
 * groups with handicap. The hashes were written by the first implementation of generator 8.
 */
class ManualParityTest {
    private static String text(JsonNode node, String key) {
        var value = node.get(key);
        return value == null ? null : value.stringValue();
    }

    private static String sha256(String text) {
        try {
            var digest = MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException(error);
        }
    }

    private static GenerationRequest requestOf(JsonNode c) {
        var players = c.get("players") != null
                ? Arrays.stream(text(c, "players").split(",")).map(Difficulty::named).toList()
                : List.of(Difficulty.named(text(c, "difficulty")));
        return new GenerationRequest(
                null,
                text(c, "seed"),
                players,
                Length.named(text(c, "length")),
                c.get("curve") == null ? null : Curve.named(text(c, "curve")),
                text(c, "class"),
                c.get("gift") == null ? null : c.get("gift").intValue(),
                c.get("levelCap") == null ? null : c.get("levelCap").intValue());
    }

    @Test
    void writes_the_same_manuals_byte_for_byte() throws Exception {
        try (var stream = ManualParityTest.class.getResourceAsStream("/references/generator-8-manuals.json")) {
            var cases = JsonMapper.builder().build().readTree(stream);
            List<JsonNode> all = StreamSupport.stream(cases.spliterator(), false).toList();
            List<String> differences = new ArrayList<>(all.parallelStream()
                    .map(c -> {
                        var documents = requestOf(c).run(DS1);
                        var manual = documents.stream().map(ChallengeDocument::manual).collect(Collectors.joining("\n---\n\n"));
                        return sha256(manual).equals(text(c, "sha256")) && documents.get(0).code().equals(text(c, "code")) ? "" : c.toString();
                    })
                    .filter(difference -> !difference.isEmpty())
                    .toList());
            assertEquals(List.of(), differences);
        }
    }

    @Test
    void reproduces_each_challenge_from_its_code() throws Exception {
        try (var stream = ManualParityTest.class.getResourceAsStream("/references/generator-8-manuals.json")) {
            var cases = JsonMapper.builder().build().readTree(stream);
            for (var c : cases) {
                if (c.get("players") != null) continue;
                var byCode = new GenerationRequest(text(c, "code"), null, null, null, null, null, null, null).run(DS1);
                assertEquals(text(c, "sha256"), sha256(byCode.get(0).manual()), text(c, "code"));
            }
        }
    }
}
