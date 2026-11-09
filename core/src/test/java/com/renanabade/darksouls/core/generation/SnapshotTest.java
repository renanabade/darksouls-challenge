package com.renanabade.darksouls.core.generation;

import static com.renanabade.darksouls.core.Fixtures.DS1;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.renanabade.darksouls.core.Validator;
import com.renanabade.darksouls.core.Verdict;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HexFormat;
import java.util.List;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

/**
 * Locks what the generator draws: twenty seeds per class, one hash per manual. A change here is a change of the challenges players
 * share, and needs a version bump.
 *
 * <p>The reference file was written by the first implementation of generator 8. This is the proof that the port is the same
 * generator: same code, same challenge, whichever runtime drew it.
 */
class SnapshotTest {
    private static String sha256(String text) {
        try {
            var digest = MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException(error);
        }
    }

    @Test
    void draws_the_same_manuals_for_twenty_seeds_of_each_class() throws Exception {
        var path = "/references/generator-" + Generator.VERSION + "-class-hashes.json";
        try (var stream = SnapshotTest.class.getResourceAsStream(path)) {
            var expected = JsonMapper.builder().build().readTree(stream);
            List<String> differences = new ArrayList<>();
            var checked = 0;
            for (var entry : expected.properties()) {
                var startingClass = entry.getKey();
                var drawn = IntStream.range(0, 20).parallel()
                        .mapToObj(i -> sha256(Manual.render(DS1, Generator.generate(
                                DS1,
                                new GeneratorConfig("snapshot-" + i, Curves.DIFFICULTIES.get(i % 4), Length.SHORT).withStartingClass(startingClass))))
                                .substring(0, 16))
                        .toList();
                var i = 0;
                for (var hash : entry.getValue().values()) {
                    checked++;
                    if (!hash.stringValue().equals(drawn.get(i))) differences.add(startingClass + " seed " + i);
                    i++;
                }
            }

            assertEquals(200, checked);
            assertEquals(List.of(), differences);
        }
    }

    // Across 1000 seeds, every challenge passes the validator, reachability included.
    @Test
    void validates_the_challenge_of_every_one_of_1000_seeds() {
        List<String> failed = Collections.synchronizedList(new ArrayList<>());
        IntStream.range(0, 1000).parallel().forEach(i -> {
            var seed = "property-" + i;
            try {
                var challenge = Generator.generate(DS1, new GeneratorConfig(seed, Curves.DIFFICULTIES.get(i % 4), Length.SHORT));
                var result = Validator.validate(DS1, challenge.setup(), challenge.orders());
                if (result.verdict() != Verdict.COMFORTABLE) failed.add(seed + ": " + String.join("; ", result.problems()));
            } catch (IllegalStateException error) {
                failed.add(seed + ": " + error.getMessage());
            }
        });
        assertTrue(failed.isEmpty(), () -> String.join("\n", failed));
    }
}
