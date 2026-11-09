package com.renanabade.darksouls.core.generation;

import static com.renanabade.darksouls.core.Fixtures.DS1;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.renanabade.darksouls.core.orders.Difficulty;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class ChallengeLinkTest {
    private static LinkReading read(String... pairs) {
        var query = new HashMap<String, String>();
        for (var i = 0; i < pairs.length; i += 2) query.put(pairs[i], pairs[i + 1]);
        return ChallengeLink.read(DS1, query, () -> "123");
    }

    private static String single(List<String> notices) {
        assertEquals(1, notices.size(), notices.toString());
        return notices.get(0);
    }

    @Test
    void asks_for_nothing_without_parameters() {
        var reading = read();
        assertNull(reading.config());
        assertEquals(List.of(), reading.notices());
    }

    @Test
    void reads_a_code_and_gives_its_canonical_form() {
        var code = ChallengeCode.encode(DS1, new GeneratorConfig("9", Difficulty.HARD, Length.EPIC));
        var reading = read("c", code.toLowerCase(Locale.ROOT));
        assertEquals(code, reading.code());
        assertEquals(Difficulty.HARD, reading.config().difficulty());
        assertEquals(List.of(), reading.notices());
    }

    @Test
    void tells_when_a_code_cannot_be_read() {
        var reading = read("c", "nonsense");
        assertNull(reading.config());
        assertTrue(single(reading.notices()).contains("cannot be read"));
    }

    @Test
    void tells_when_a_code_comes_from_another_generator_or_data_set() {
        assertTrue(single(read("c", "ds1.7.07-0000000000").notices()).contains("generator 7"));
        assertTrue(single(read("c", "ds1.8.06-0000000000").notices()).contains("data 06"));
    }

    @Test
    void keeps_reading_links_with_a_seed_with_the_text_hashed_into_the_code() {
        var reading = read("seed", "ashen-one", "difficulty", "hard", "length", "short", "class", "Knight", "gift", "2406");
        var expected = new GeneratorConfig("ashen-one", Difficulty.HARD, Length.SHORT).withStartingClass("Knight").withGiftRow(2406);
        assertEquals(expected, reading.config());
        assertEquals(ChallengeCode.encode(DS1, expected), reading.code());
        assertEquals(List.of(), reading.notices());
    }

    // It once ignored the other parameters.
    @Test
    void honors_the_other_parameters_when_the_seed_is_empty() {
        var reading = read("seed", "", "difficulty", "hard");
        assertEquals("123", reading.config().seed());
        assertEquals(Difficulty.HARD, reading.config().difficulty());
    }

    // They once fell back to the defaults in silence.
    @ParameterizedTest
    @CsvSource({
        "class,Clown,class",
        "gift,1,gift",
        "gift,abc,gift",
        "difficulty,brutal,difficulty",
        "length,tiny,length",
        "curve,flat,curve",
        "cap,9000,level cap"
    })
    void tells_about_each_invalid_parameter(String name, String value, String shown) {
        var reading = read("seed", "x", name, value);
        assertNotNull(reading.config());
        assertEquals("The link's " + shown + " \"" + value + "\" does not exist, and was ignored.", single(reading.notices()));
    }

    @Test
    void tells_when_a_seed_link_comes_from_another_generator() {
        assertTrue(single(read("seed", "x", "v", "7").notices()).contains("generator 7"));
    }

    @Test
    void writes_the_link_of_a_code() {
        assertEquals("?c=ds1.8.07-AB", ChallengeLink.queryOf("ds1.8.07-AB"));
    }
}
