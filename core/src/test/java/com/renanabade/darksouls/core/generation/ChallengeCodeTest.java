package com.renanabade.darksouls.core.generation;

import static com.renanabade.darksouls.core.Fixtures.DS1;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.renanabade.darksouls.core.orders.Difficulty;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

class ChallengeCodeTest {
    private static GeneratorConfig decode(String code) {
        var reading = ChallengeCode.decode(DS1, code);
        assertTrue(reading.ok(), reading.problem());
        return reading.decoded().config();
    }

    @Test
    void round_trips_every_option_combination() {
        List<String> classes = new ArrayList<>();
        classes.add(null);
        classes.addAll(DS1.classes().keySet());
        List<Integer> gifts = new ArrayList<>();
        gifts.add(null);
        DS1.gifts().forEach(g -> gifts.add(g.row()));
        List<Curve> curves = new ArrayList<>();
        curves.add(null);
        curves.addAll(Curves.ALL);
        var count = 0;
        for (var difficulty : Curves.DIFFICULTIES) {
            for (var length : Length.values()) {
                for (var curve : curves) {
                    for (var startingClass : classes) {
                        for (var gift : gifts) {
                            for (var levelCap : Arrays.asList(null, 1, 60, ChallengeCode.MAX_LEVEL_CAP)) {
                                var seed = Integer.toString(count * 7919 % (1 << ChallengeCode.SEED_BITS));
                                var config = new GeneratorConfig(seed, difficulty, length, curve, startingClass, gift, levelCap);
                                assertEquals(config, decode(ChallengeCode.encode(DS1, config)));
                                count++;
                            }
                        }
                    }
                }
            }
        }

        assertTrue(count > 10000);
    }

    @Test
    void writes_the_game_both_versions_and_ten_symbols() {
        var code = ChallengeCode.encode(DS1, new GeneratorConfig("1", Difficulty.MEDIUM, Length.SHORT));
        assertTrue(code.matches("^ds1\\.8\\.07-[0-9A-HJKMNP-TV-Z]{10}$"), code);
    }

    @Test
    void reads_a_code_in_any_case_and_with_look_alike_symbols() {
        var code = ChallengeCode.encode(DS1, new GeneratorConfig("12345", Difficulty.HARD, Length.EPIC).withStartingClass("Knight"));
        assertEquals(decode(code), decode(code.toLowerCase(Locale.ROOT)));
        assertEquals(decode(code), decode("  " + code + " "));
        var stem = code.substring(0, code.length() - 1);
        assertEquals(decode(stem + "1"), decode(stem + "I"));
        assertEquals(decode(stem + "1"), decode(stem + "l"));
    }

    @Test
    void a_code_reproduces_the_exact_challenge_and_overrides_the_request() {
        var first = new GenerationRequest(null, "ashen-one", List.of(Difficulty.HARD), Length.SHORT, Curve.RISING, "Thief", null, null).run(DS1).get(0);
        var again = new GenerationRequest(first.code(), null, List.of(Difficulty.EASY), Length.EPIC, null, "Knight", null, null).run(DS1).get(0);
        assertEquals(first.manual(), again.manual());
        assertEquals(first.code(), again.code());
    }

    @Test
    void text_and_number_seeds_share_one_space_of_challenges() {
        var number = Integer.toString(ChallengeCode.seedNumber("ashen-one"));
        var text = Generator.generate(DS1, new GeneratorConfig("ashen-one", Difficulty.EASY, Length.SHORT));
        var digits = Generator.generate(DS1, new GeneratorConfig(number, Difficulty.EASY, Length.SHORT));
        assertEquals(text.code(), digits.code());
        assertEquals(Manual.render(DS1, text), Manual.render(DS1, digits));
    }

    @Test
    void prints_the_code_and_never_the_seed_in_the_manual() {
        var challenge = Generator.generate(DS1, new GeneratorConfig("ashen-one", Difficulty.EASY, Length.SHORT));
        var manual = Manual.render(DS1, challenge);
        assertTrue(manual.startsWith("# Dark Souls challenge — " + challenge.code() + "\n"));
        assertFalse(manual.contains("ashen-one"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "hello", "ds1.8.07-SHORT", "ds1.8-K3F9QX2M7T", "ds1.8.07-K3F9QX2M7U"}) // U is not in the alphabet
    void refuses_what_is_not_a_code(String text) {
        var reading = ChallengeCode.decode(DS1, text);
        assertFalse(reading.ok());
        assertEquals("this is not a challenge code", reading.problem());
    }

    @Test
    void refuses_another_game_and_parameters_that_do_not_exist() {
        assertEquals("this code is for another game (ds3)", ChallengeCode.decode(DS1, "ds3.8.07-K3F9QX2M7T").problem());

        // Length 3 does not exist: bits 2 and 3 of the payload, in the last symbol.
        assertEquals("this code holds parameters that do not exist", ChallengeCode.decode(DS1, "ds1.8.07-000000000C").problem());
    }

    @Test
    void marks_a_code_from_another_version() {
        var code = ChallengeCode.encode(DS1, new GeneratorConfig("1", Difficulty.EASY, Length.SHORT));
        assertTrue(ChallengeCode.decode(DS1, code).decoded().isCurrent());
        var oldGenerator = ChallengeCode.decode(DS1, code.replace("ds1.8.", "ds1.7.")).decoded();
        assertFalse(oldGenerator.isCurrent());
        assertEquals("7", oldGenerator.generatorVersion());
        var oldData = ChallengeCode.decode(DS1, code.replace(".07-", ".06-")).decoded();
        assertFalse(oldData.isCurrent());
        assertEquals("06", oldData.dataVersion());
    }

    @ParameterizedTest
    @CsvSource({"0.7.0,07", "0.7.1,071", "1.0.0,10"})
    void writes_the_data_version_without_dots(String version, String compact) {
        assertEquals(compact, ChallengeCode.compactDataVersion(version));
    }
}
