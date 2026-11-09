package com.renanabade.darksouls.core;

import static com.renanabade.darksouls.core.Fixtures.json;
import static com.renanabade.darksouls.core.Fixtures.readFile;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class RequirementTest {
    private static Requirement parse(String text) {
        return Requirement.parse(json(text));
    }

    private static boolean evaluate(Requirement requirement, List<String> items, List<String> regions) {
        return requirement.evaluate(items::contains, regions::contains);
    }

    @Test
    void constants_evaluate_to_themselves() {
        assertTrue(evaluate(parse("true"), List.of(), List.of()));
        assertFalse(evaluate(parse("false"), List.of(), List.of()));
    }

    @Test
    void items_and_regions_are_checked_against_the_context() {
        assertTrue(evaluate(parse("{\"has\":\"Master Key\"}"), List.of("Master Key"), List.of()));
        assertFalse(evaluate(parse("{\"has\":\"Master Key\"}"), List.of(), List.of()));
        assertTrue(evaluate(parse("{\"region\":\"firelink-shrine\"}"), List.of(), List.of("firelink-shrine")));
    }

    @Test
    void all_and_any_combine_including_nesting() {
        var requirement = parse("{\"all\":[{\"region\":\"sens-fortress\"},{\"any\":[{\"has\":\"Cage Key\"},{\"has\":\"Master Key\"}]}]}");
        assertTrue(evaluate(requirement, List.of("Master Key"), List.of("sens-fortress")));
        assertFalse(evaluate(requirement, List.of("Master Key"), List.of()));
        assertFalse(evaluate(requirement, List.of(), List.of("sens-fortress")));
    }

    @Test
    void items_collects_every_item_named_anywhere() {
        var requirement = parse("{\"all\":[{\"has\":\"A\"},{\"any\":[{\"has\":\"B\"},{\"region\":\"r\"}]}]}");
        assertEquals(List.of("A", "B"), requirement.items());
        assertEquals(List.of("r"), requirement.regions());
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
        "null|$",
        "[]|$",
        "{}|$",
        "{\"has\":\"A\",\"region\":\"r\"}|$",
        "{\"has\":\"\"}|$.has",
        "{\"all\":[]}|$.all",
        "{\"any\":[{\"has\":\"A\"},{\"nope\":1}]}|$.any[1]"
    })
    void bad_input_is_rejected_with_the_path_of_the_bad_node(String text, String path) {
        assertEquals(path, assertThrows(RequirementParseException.class, () -> parse(text)).path());
    }

    @Test
    void every_requirement_of_the_data_set_parses() {
        var entrances = readFile("entrances");
        assertFalse(entrances.isEmpty());
        var i = 0;
        for (var entrance : entrances) {
            Requirement.parse(entrance.get("requires"), "entrances[" + i + "]");
            i++;
        }
    }
}
