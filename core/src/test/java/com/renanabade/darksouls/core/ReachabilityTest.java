package com.renanabade.darksouls.core;

import static com.renanabade.darksouls.core.Fixtures.DS1;
import static com.renanabade.darksouls.core.Fixtures.masterKeyGift;
import static com.renanabade.darksouls.core.Fixtures.readFile;
import static com.renanabade.darksouls.core.Fixtures.set;
import static com.renanabade.darksouls.core.Fixtures.sorted;
import static com.renanabade.darksouls.core.Fixtures.strings;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.renanabade.darksouls.core.orders.Mode;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import org.junit.jupiter.api.Test;

class ReachabilityTest {
    private static final String ROWS = "{ \"id\": \"%s\", \"name\": \"%s\", \"area\": \"x\", \"mandatory\": false }";

    private static String rows(String... ids) {
        List<String> rows = new ArrayList<>();
        for (var id : ids) rows.add(ROWS.formatted(id, id));
        return "[" + String.join(",", rows) + "]";
    }

    private static String row(String name, String region, String item, String category, boolean mandatory) {
        return "{ \"name\": \"%s\", \"region\": \"%s\", \"item\": \"%s\", \"count\": 1, \"category\": \"%s\", \"mandatory\": %s }"
                .formatted(name, region, item, category, mandatory);
    }

    /** start, then a (needs Key, found in start), then b (needs Gem, found in a); c needs b reached and the Gem. */
    private static final World SMALL = new Fixtures.Data()
            .meta("{ \"start\": \"start\", \"goal\": \"Gem\" }")
            .regions(rows("start", "a", "b", "c"))
            .entrances("""
                    [
                      { "from": "start", "to": "a", "requires": { "has": "Key" } },
                      { "from": "a", "to": "b", "requires": { "any": [{ "has": "Gem" }, { "has": "Lockpick" }] } },
                      { "from": "a", "to": "c", "requires": { "all": [{ "region": "b" }, { "has": "Gem" }] } },
                      { "from": "start", "to": "c", "requires": false }
                    ]""")
            .locations("[" + row("1", "start", "Key", "KEY", true) + "," + row("2", "a", "Gem", "KEY", true) + "]")
            .classes("{ \"gifts\": [{ \"row\": 1, \"items\": [\"Lockpick\"] }] }")
            .bosses("[]")
            .merchants("[]")
            .world();

    @Test
    void opens_paths_with_items_picked_up_on_the_way_round_after_round() {
        var result = Reachability.walk(SMALL);
        assertEquals(List.of("a", "b", "c", "start"), sorted(result.regions()));
        assertEquals(List.of("Gem", "Key"), sorted(result.items()));
    }

    @Test
    void never_takes_forbidden_items_so_what_they_open_stays_closed() {
        assertEquals(List.of("start"), sorted(Reachability.walk(SMALL, ReachOptions.forbidItems(set("Key"))).regions()));
        assertEquals(List.of("a", "start"), sorted(Reachability.walk(SMALL, ReachOptions.forbidItems(set("Gem"))).regions()));
    }

    @Test
    void uses_starting_items_as_alternatives() {
        var result = Reachability.walk(SMALL, new ReachOptions(List.of("Lockpick"), set("Gem"), null, null));
        assertEquals(List.of("a", "b", "start"), sorted(result.regions()));
    }

    @Test
    void never_enters_forbidden_regions_nor_goes_through_them() {
        assertEquals(List.of("start"), sorted(Reachability.walk(SMALL, ReachOptions.forbidRegions(set("a"))).regions()));
    }

    /** start, boss (its death item), after; start, shop, which closes for good once the boss is dead. The shop needs a Flame, found either at the start or only past the boss. */
    private static World closing(String flameAt) {
        return new Fixtures.Data()
                .meta("{ \"start\": \"start\", \"goal\": \"Boss Defeated\" }")
                .regions(rows("start", "boss", "after", "shop"))
                .entrances("""
                        [
                          { "from": "start", "to": "boss", "requires": true },
                          { "from": "boss", "to": "after", "requires": { "has": "Boss Defeated" } },
                          { "from": "start", "to": "shop", "requires": { "has": "Flame" }, "before": "Boss Defeated" }
                        ]""")
                .locations("[" + row("1", "boss", "Boss Defeated", "BOSS", true) + "," + row("2", flameAt, "Flame", "KEY", false) + "]")
                .classes("{ \"gifts\": [] }")
                .bosses("[]")
                .merchants("[]")
                .world();
    }

    @Test
    void crosses_an_entrance_that_closes_on_an_item_only_if_it_opens_without_that_item() {
        assertTrue(Reachability.walk(closing("start")).regions().contains("shop"));
        assertFalse(Reachability.walk(closing("after")).regions().contains("shop"));
        assertTrue(Reachability.walk(closing("after"), new ReachOptions(List.of("Flame"), null, null, null)).regions().contains("shop"));

        // Holding the item from the start closes the entrance from the start.
        var deadFromTheStart = new ReachOptions(List.of("Flame", "Boss Defeated"), null, null, null);
        assertFalse(Reachability.walk(closing("start"), deadFromTheStart).regions().contains("shop"));
    }

    // a needs Y and closes on X; b needs X and closes on Y. Each opens alone (take Y, cross a; take X, cross b), but no single order
    // crosses both. The walk judges each entrance on its own item.
    @Test
    void judges_each_closing_entrance_on_its_own_item_not_jointly() {
        var crossed = new Fixtures.Data()
                .meta("{ \"start\": \"start\", \"goal\": \"X\" }")
                .regions(rows("start", "a", "b"))
                .entrances("""
                        [
                          { "from": "start", "to": "a", "requires": { "has": "Y" }, "before": "X" },
                          { "from": "start", "to": "b", "requires": { "has": "X" }, "before": "Y" }
                        ]""")
                .locations("[" + row("1", "start", "X", "KEY", false) + "," + row("2", "start", "Y", "KEY", false) + "]")
                .classes("{ \"gifts\": [] }")
                .bosses("[]")
                .merchants("[]")
                .world();
        assertEquals(List.of("a", "b", "start"), sorted(Reachability.walk(crossed).regions()));
    }

    @Test
    void reaches_every_region_and_the_goal_with_each_starting_gift() {
        for (var gift : DS1.gifts()) {
            var result = Reachability.walk(DS1, new ReachOptions(gift.items().stream().map(GiftItem::item).toList(), null, null, null));
            assertTrue(result.regions().containsAll(DS1.regions().keySet()));
            assertTrue(result.items().contains(DS1.goal()));
        }
    }

    // Cross-check with the pipeline's removal analysis (mandatory.json), computed in another language. The pipeline leaves out what is
    // mandatory by definition: the goal itself and the start region.
    @Test
    void finds_the_same_mandatory_items_as_the_pipeline() {
        var items = new LinkedHashSet<String>();
        for (var location : DS1.locations()) {
            if (!location.item().equals(DS1.goal())) items.add(location.item());
        }

        var found = items.stream()
                .filter(item -> !Reachability.walk(DS1, ReachOptions.forbidItems(set(item))).items().contains(DS1.goal()))
                .toList();
        assertEquals(sorted(strings(readFile("mandatory").get("items"))), sorted(found));
    }

    @Test
    void finds_the_same_mandatory_regions_as_the_pipeline() {
        var found = DS1.regions().keySet().stream()
                .filter(id -> !id.equals(DS1.start()))
                .filter(id -> !Reachability.walk(DS1, ReachOptions.forbidRegions(set(id))).items().contains(DS1.goal()))
                .toList();
        assertEquals(sorted(strings(readFile("mandatory").get("regions"))), sorted(found));
    }

    // The golem that holds Dusk appears once the Hydra is dead, and the Broken Pendant that opens the DLC drops only after Dusk is freed.
    @Test
    void chains_the_hydra_dusk_the_broken_pendant_and_the_dlc() {
        var withoutHydra = Reachability.walk(DS1, ReachOptions.forbidItems(set("Darkroot Basin Hydra Defeated")));
        assertTrue(withoutHydra.regions().contains("darkroot-basin"));
        for (var closed : List.of("darkroot-basin-princess-dusk", "sanctuary-garden", "oolacile-township")) {
            assertFalse(withoutHydra.regions().contains(closed));
        }

        assertFalse(withoutHydra.items().contains("Broken Pendant"));
        assertTrue(withoutHydra.items().contains(DS1.goal()));
    }

    // The Bell Gargoyles' and the Centipede Demon's exit fogs go only on their death.
    @Test
    void waits_for_the_bell_gargoyles_and_the_centipede_demon() {
        var gargoyles = Reachability.walk(DS1, ReachOptions.forbidItems(set("Bell Gargoyles Defeated")));
        assertFalse(gargoyles.items().contains("Bell of Awakening #1"));
        assertFalse(gargoyles.regions().contains("undead-parish-oswald-of-carim"));
        assertFalse(Reachability.walk(DS1, ReachOptions.forbidItems(set("Centipede Demon Defeated"))).regions().contains("lost-izalith"));
    }

    private static boolean needsTaurus(List<String> items) {
        return !Reachability.walk(DS1, new ReachOptions(items, set("Taurus Demon Defeated"), null, null)).items().contains(DS1.goal());
    }

    // Which bosses a run needs follows from what it starts with. The Thief starts with the Master Key.
    @Test
    void leaves_the_taurus_demon_optional_with_the_master_key_from_the_class_or_the_gift() {
        var empty = new StartingGift(0, List.of());
        assertTrue(needsTaurus(Validator.startingItems(DS1, new Setup(Mode.STATIC, empty, "Knight", null))));
        assertFalse(needsTaurus(Validator.startingItems(DS1, new Setup(Mode.STATIC, empty, "Thief", null))));
        assertFalse(needsTaurus(Validator.startingItems(DS1, new Setup(Mode.STATIC, masterKeyGift(), "Knight", null))));
    }

    // The walk down from the Depths side of Blighttown needs no Lordvessel (a DSAP comfort rule).
    @Test
    void walks_down_blighttown_from_the_depths_without_the_lordvessel() {
        var edges = DS1.entrances().stream()
                .filter(e -> e.from().equals("upper-blighttown-depths-side") && e.to().equals("lower-blighttown"))
                .toList();
        assertEquals(1, edges.size());
        assertEquals(new Requirement.Constant(true), edges.get(0).requires());
    }
}
