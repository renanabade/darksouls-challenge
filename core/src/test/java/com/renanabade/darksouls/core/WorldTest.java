package com.renanabade.darksouls.core;

import static com.renanabade.darksouls.core.Fixtures.DS1;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;

class WorldTest {
    private static final String REGIONS = """
            [
              { "id": "cell", "name": "cell", "area": "a", "mandatory": false, "virtual": false },
              { "id": "arena", "name": "arena", "area": "a", "mandatory": false, "virtual": false },
              { "id": "shop", "name": "shop", "area": null, "mandatory": false, "virtual": true }
            ]""";

    private static final String LOCATIONS = """
            [
              { "name": "cell: Key", "region": "cell", "item": "Key", "count": 1, "category": "KEY", "mandatory": false },
              { "name": "arena: Boss Defeated", "region": "arena", "item": "Boss Defeated", "count": 1, "category": "BOSS", "mandatory": false }
            ]""";

    private static Fixtures.Data raw() {
        return new Fixtures.Data()
                .meta("{ \"start\": \"cell\", \"goal\": \"Boss Defeated\" }")
                .regions(REGIONS)
                .entrances("""
                        [
                          { "from": "cell", "to": "arena", "requires": { "any": [{ "has": "Key" }, { "has": "Master Key" }] } },
                          { "from": "arena", "to": "cell", "requires": true, "walkBack": false }
                        ]""")
                .locations(LOCATIONS)
                .classes("""
                        { "classes": [], "gifts": [{ "row": 1, "items": ["(none)"] }, { "row": 2, "items": ["Master Key"] }] }""")
                .bosses("[{ \"id\": \"the-boss\", \"name\": \"The Boss\", \"region\": \"arena\" }]")
                .merchants("[{ \"id\": \"trader\", \"name\": \"Trader\", \"regions\": [\"shop\"] }]");
    }

    private static List<String> problemsOf(Fixtures.Data data) {
        try {
            data.world();
            return List.of();
        } catch (WorldParseException error) {
            return error.problems();
        }
    }

    @Test
    void builds_the_world_and_applies_the_schema_defaults() {
        var world = raw().world();
        assertEquals("cell", world.start());
        assertNull(world.regions().get("shop").area());
        assertTrue(world.regions().get("shop").isVirtual());
        assertFalse(world.regions().get("cell").isVirtual());
        assertEquals(List.of(true, false), world.entrances().stream().map(Entrance::walkBack).toList());
    }

    @Test
    void links_each_boss_to_the_death_item_of_its_region_whatever_the_names() {
        assertEquals("Boss Defeated", raw().world().bosses().get("the-boss").defeatedItem());
    }

    @Test
    void reads_merchants_and_checks_their_regions() {
        assertEquals(List.of("shop"), raw().world().merchants().get("trader").regions());
        assertEquals(
                List.of("unknown region \"attic\" at merchants[0].regions[0]"),
                problemsOf(raw().merchants("[{ \"id\": \"trader\", \"name\": \"Trader\", \"regions\": [\"attic\"] }]")));
    }

    @Test
    void rejects_a_boss_whose_region_has_no_single_death_item() {
        assertEquals(
                List.of(
                        "expected one BOSS location in \"cell\", found 0 at bosses[0].region",
                        "duplicate boss \"a\" at bosses[1].id"),
                problemsOf(raw().bosses("""
                        [{ "id": "a", "name": "A", "region": "cell" }, { "id": "a", "name": "A", "region": "arena" }]""")));
    }

    @Test
    void reads_starting_gifts_with_counts_and_the_empty_gift() {
        var gifts = raw().classes("""
                { "gifts": [
                  { "row": 1, "items": ["(none)"] },
                  { "row": 2, "items": ["Black Firebomb x10"] },
                  { "row": 3, "items": ["Master Key"] }
                ] }""").world().gifts();
        assertEquals(List.of(1, 2, 3), gifts.stream().map(StartingGift::row).toList());
        assertTrue(gifts.get(0).items().isEmpty());
        assertEquals(List.of(new GiftItem("Black Firebomb", 10)), gifts.get(1).items());
        assertEquals(List.of(new GiftItem("Master Key", 1)), gifts.get(2).items());
    }

    @Test
    void accepts_an_item_that_only_a_starting_gift_gives() {
        assertEquals(List.of(), problemsOf(raw()));
    }

    @Test
    void reports_every_broken_reference_at_once() {
        var problems = problemsOf(raw()
                .meta("{ \"start\": \"nowhere\", \"goal\": \"Nothing\" }")
                .entrances("""
                        [{ "from": "cell", "to": "void", "requires": { "all": [{ "has": "Ghost Key" }, { "region": "limbo" }] } }]""")
                .locations("""
                        [
                          { "name": "cell: Key", "region": "cell", "item": "Key", "count": 1, "category": "KEY", "mandatory": false },
                          { "name": "attic: Boss Defeated", "region": "attic", "item": "Boss Defeated", "count": 1, "category": "KEY", "mandatory": false }
                        ]"""));
        assertEquals(
                List.of(
                        "unknown region \"nowhere\" at meta.start",
                        "goal \"Nothing\" is not an item of any location at meta.goal",
                        "unknown region \"void\" at entrances[0].to",
                        "unknown region \"limbo\" at entrances[0].requires",
                        "item \"Ghost Key\" cannot be obtained at entrances[0].requires",
                        "unknown region \"attic\" at locations[1].region",
                        "expected one BOSS location in \"arena\", found 0 at bosses[0].region"),
                problems);
    }

    @Test
    void reports_shape_problems_with_their_path_bad_requirements_included() {
        var problems = problemsOf(raw()
                .regions("""
                        [
                          { "id": "cell", "name": "cell", "area": "a", "mandatory": false },
                          { "id": "cell", "name": "cell", "area": "a", "mandatory": false },
                          { "id": "arena", "name": "", "area": 1, "mandatory": "no" }
                        ]""")
                .entrances("[{ \"from\": \"cell\", \"to\": \"arena\", \"requires\": { \"has\": \"\" } }]"));
        assertEquals(
                List.of(
                        "duplicate region \"cell\" at regions[1].id",
                        "expected a non-empty string at regions[2].name",
                        "expected a non-empty string at regions[2].area",
                        "expected a boolean at regions[2].mandatory",
                        "\"has\" must be a non-empty string at entrances[0].requires.has",
                        "unknown region \"shop\" at merchants[0].regions[0]"),
                problems);
    }

    @Test
    void rejects_files_that_are_not_the_expected_containers() {
        var problems = problemsOf(raw().meta("[]").regions("{}").classes("null"));
        assertEquals(
                List.of(
                        "expected an object at meta",
                        "expected a non-empty string at meta.start",
                        "expected a non-empty string at meta.goal",
                        "expected an array at regions",
                        "expected an object at classes",
                        "expected an array at classes.gifts",
                        "unknown region \"cell\" at entrances[0].from",
                        "unknown region \"arena\" at entrances[0].to",
                        "item \"Master Key\" cannot be obtained at entrances[0].requires",
                        "unknown region \"arena\" at entrances[1].from",
                        "unknown region \"cell\" at entrances[1].to",
                        "unknown region \"cell\" at locations[0].region",
                        "unknown region \"arena\" at locations[1].region",
                        "unknown region \"arena\" at bosses[0].region",
                        "unknown region \"shop\" at merchants[0].regions[0]"),
                problems);
    }

    @Test
    void loads_the_ds1_data_set() {
        assertTrue(DS1.regions().size() > 100);
        assertTrue(DS1.gifts().stream().anyMatch(g -> g.items().isEmpty()));
    }
}
