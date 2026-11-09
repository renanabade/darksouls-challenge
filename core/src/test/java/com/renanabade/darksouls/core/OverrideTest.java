package com.renanabade.darksouls.core;

import static com.renanabade.darksouls.core.Fixtures.json;
import static com.renanabade.darksouls.core.Fixtures.readFile;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.function.Function;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * data/ds1/overrides.json: the corrections the export applies on top of the DSAP graph (SCHEMA.md). The export fails on a missing target;
 * these tests check, on the exported files, that every override still names a record and that the record carries the correction, so a
 * re-export that loses a fix fails here.
 */
class OverrideTest {
    // A source cites the game: an event, a flag, a talk script, a map, a param row, or a test in play.
    private static final Pattern GAME_EVIDENCE = Pattern.compile("\\b(Event_\\d+|flags? \\d+|t\\d{6}|m\\d{2}_\\d{2}_\\d{2}_\\d{2}|[A-Z]\\w*Param|in-game test)\\b");

    // Never a path into the private pipeline.
    private static final Pattern PRIVATE_PATH = Pattern.compile("\\\\|\\b(knowledge|tools|notes|gamefiles)/|\\.(py|md|json)\\b");

    private static boolean matches(JsonNode row, JsonNode match) {
        for (var field : match.properties()) {
            if (!field.getValue().equals(row.get(field.getKey()))) return false;
        }

        return true;
    }

    /** True when the requirement holds the part as itself or as a member of an "all", at any depth. */
    private static boolean holds(JsonNode requirement, JsonNode part) {
        if (requirement == null) return false;
        if (requirement.equals(part)) return true;
        var all = requirement.isObject() ? requirement.get("all") : null;
        if (all == null || !all.isArray()) return false;
        for (var member : all) {
            if (holds(member, part)) return true;
        }

        return false;
    }

    /** What is wrong with one override against the exported data; empty when it is applied. */
    private static List<String> overrideProblems(JsonNode o, Function<String, JsonNode> data) {
        var id = o.get("id").stringValue();
        var source = o.get("source").stringValue();
        var op = o.get("op").stringValue();
        List<String> problems = new ArrayList<>();
        if (!GAME_EVIDENCE.matcher(source).find()) problems.add(id + ": source cites no game evidence");
        if (PRIVATE_PATH.matcher(source).find()) problems.add(id + ": source names a private path");
        var file = o.get("file").stringValue();
        var rows = data.apply(file);
        if (rows == null || !rows.isArray()) {
            problems.add(id + ": " + file + " is not a list file");
            return problems;
        }

        // An added record is found by its match when it has one (the export recomputes derived fields such as mandatory), else by all of
        // its fields; a replaced one by its match with the new fields on top.
        JsonNode match;
        if (op.equals("replace")) {
            var merged = (ObjectNode) o.get("match").deepCopy();
            for (var field : o.get("value").properties()) merged.set(field.getKey(), field.getValue());
            match = merged;
        } else {
            match = o.get("match") != null ? o.get("match") : o.get("value");
        }

        List<JsonNode> hits = new ArrayList<>();
        for (var row : rows) {
            if (row.isObject() && matches(row, match)) hits.add(row);
        }

        if (op.equals("remove")) {
            if (!hits.isEmpty()) problems.add(id + ": the removed record is still there");
            return problems;
        }

        if (hits.size() != 1) {
            problems.add(id + ": target matches " + hits.size() + " records");
            return problems;
        }

        var field = o.get("field") != null ? o.get("field").stringValue() : "requires";
        if (op.equals("condition") && !holds(hits.get(0).get(field), o.get("value"))) problems.add(id + ": condition not applied");
        return problems;
    }

    private static List<JsonNode> overrides() {
        List<JsonNode> all = new ArrayList<>();
        readFile("overrides").get("overrides").forEach(all::add);
        return all;
    }

    @Test
    void have_unique_ids_and_known_ops() {
        var overrides = overrides();
        Set<String> ids = new HashSet<>();
        for (var o : overrides) {
            ids.add(o.get("id").stringValue());
            assertTrue(Set.of("add", "remove", "replace", "condition").contains(o.get("op").stringValue()));
        }

        assertEquals(overrides.size(), ids.size());
    }

    @Test
    void are_all_applied_to_the_exported_data_each_citing_the_game() {
        List<String> problems = new ArrayList<>();
        for (var o : overrides()) problems.addAll(overrideProblems(o, file -> readFile(file)));
        assertEquals(List.of(), problems);
    }

    private static List<String> check(String text) {
        var rows = json("""
                [
                  { "from": "a", "to": "b", "requires": true },
                  { "from": "b", "to": "c", "requires": { "all": [{ "has": "x" }, { "has": "y" }] } }
                ]""");
        var o = (ObjectNode) json(text);
        if (o.get("id") == null) o.put("id", "T");
        if (o.get("op") == null) o.put("op", "add");
        if (o.get("file") == null) o.put("file", "entrances");
        if (o.get("source") == null) o.put("source", "m10_00_00_00 Event_11000532");
        return overrideProblems(o, file -> file.equals("entrances") ? rows : null);
    }

    @Test
    void are_checked_against_the_exported_records() {
        assertEquals(List.of(), check("{ \"op\": \"condition\", \"match\": { \"from\": \"b\" }, \"value\": { \"has\": \"y\" } }"));
        assertEquals(List.of(), check("{ \"op\": \"replace\", \"match\": { \"from\": \"a\" }, \"value\": { \"requires\": true } }"));
        assertEquals(List.of(), check("{ \"op\": \"replace\", \"match\": { \"from\": \"x\" }, \"value\": { \"from\": \"a\" } }"));
        assertEquals(List.of("T: target matches 0 records"), check("{ \"op\": \"replace\", \"match\": { \"from\": \"a\" }, \"value\": { \"requires\": false } }"));
        assertEquals(List.of(), check("{ \"op\": \"add\", \"value\": { \"from\": \"a\", \"to\": \"b\" } }"));
        assertEquals(List.of(), check("{ \"op\": \"add\", \"match\": { \"from\": \"b\" }, \"value\": { \"from\": \"b\", \"mandatory\": true } }"));
        assertEquals(List.of(), check("{ \"op\": \"remove\", \"match\": { \"from\": \"z\" } }"));
        assertEquals(List.of("T: the removed record is still there"), check("{ \"op\": \"remove\", \"match\": { \"from\": \"a\" } }"));
        assertEquals(List.of("T: target matches 0 records"), check("{ \"op\": \"condition\", \"match\": { \"from\": \"z\" }, \"value\": true }"));
        assertEquals(List.of("T: condition not applied"), check("{ \"op\": \"condition\", \"match\": { \"from\": \"a\" }, \"value\": { \"has\": \"y\" } }"));
        assertEquals(List.of("T: meta is not a list file"), check("{ \"file\": \"meta\", \"op\": \"remove\", \"match\": {} }"));
        assertTrue(check("{ \"op\": \"remove\", \"match\": {}, \"source\": \"private research notes\" }").contains("T: source cites no game evidence"));
        assertEquals(List.of("T: source names a private path"), check("{ \"op\": \"remove\", \"match\": { \"from\": \"z\" }, \"source\": \"Event_1 in knowledge/notes/x.md\" }"));
    }
}
