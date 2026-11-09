package com.renanabade.darksouls.core;

import static com.renanabade.darksouls.core.Fixtures.DS1;
import static com.renanabade.darksouls.core.Fixtures.args;
import static com.renanabade.darksouls.core.Fixtures.json;
import static com.renanabade.darksouls.core.Fixtures.masterKeyGift;
import static com.renanabade.darksouls.core.Fixtures.noGift;
import static com.renanabade.darksouls.core.Fixtures.order;
import static com.renanabade.darksouls.core.Fixtures.readFile;
import static com.renanabade.darksouls.core.Fixtures.sorted;
import static com.renanabade.darksouls.core.Fixtures.strings;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.renanabade.darksouls.core.orders.Mode;
import com.renanabade.darksouls.core.orders.OrderArgs;
import com.renanabade.darksouls.core.orders.OrderInstance;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

class ValidatorTest {
    private static final String BELL = Validator.BELLS.get(0);

    private static String loc(String region, String item, String category, boolean found) {
        return "{ \"name\": \"%s: %s\", \"region\": \"%s\", \"item\": \"%s\", \"count\": 1, \"category\": \"%s\", \"mandatory\": false, \"found\": %s }"
                .formatted(region, item, region, item, category, found);
    }

    private static final String LOCATIONS = "["
            + String.join(",",
                    loc("hall", "Key", "CORPSE_ITEM", true),
                    loc("hall", "Ring", "CHEST_ITEM", true),
                    loc("side", "Junk", "CORPSE_ITEM", true),
                    loc("gate", "Gate Boss Defeated", "BOSS", false),
                    loc("tower", BELL, "EVENT", false),
                    loc("a", "Soul A", "LORD_SOUL", false),
                    loc("b", "Soul B", "LORD_SOUL", false),
                    loc("throne", "Lord Defeated", "BOSS", false),
                    loc("forge", "Lantern", "SHOP_ITEM", false),
                    loc("stall", "Lantern", "SHOP_ITEM", false))
            + "]";

    private static final String REGIONS = """
            { "id": "start", "name": "start", "area": "asylum", "mandatory": false },
            { "id": "hall", "name": "hall", "area": "hall", "mandatory": false },
            { "id": "gate", "name": "gate", "area": "hall", "mandatory": false },
            { "id": "side", "name": "side", "area": "side", "mandatory": false },
            { "id": "tower", "name": "tower", "area": "tower", "mandatory": false },
            { "id": "a", "name": "a", "area": "lords", "mandatory": false },
            { "id": "b", "name": "b", "area": "lords", "mandatory": false },
            { "id": "throne", "name": "throne", "area": "throne", "mandatory": false },
            { "id": "forge", "name": "forge", "area": "hall", "mandatory": false },
            { "id": "market", "name": "market", "area": "hall", "mandatory": false },
            { "id": "stall", "name": "stall", "area": null, "mandatory": false }""";

    private static final String ENTRANCES = """
            { "from": "start", "to": "hall", "requires": true },
            { "from": "hall", "to": "side", "requires": true },
            { "from": "hall", "to": "gate", "requires": true },
            { "from": "hall", "to": "tower", "requires": { "has": "Key" } },
            { "from": "side", "to": "tower", "requires": { "has": "Master Key" } },
            { "from": "tower", "to": "a", "requires": { "all": [{ "has": "Bell of Awakening #1" }, { "has": "Lantern" }] } },
            { "from": "hall", "to": "forge", "requires": true },
            { "from": "hall", "to": "market", "requires": true },
            { "from": "forge", "to": "stall", "requires": true },
            { "from": "market", "to": "stall", "requires": true },
            { "from": "a", "to": "b", "requires": { "has": "Soul A" } },
            { "from": "b", "to": "throne", "requires": { "all": [{ "has": "Soul A" }, { "has": "Soul B" }] } }""";

    private static final String MERCHANTS = """
            { "id": "smith", "name": "Smith", "regions": ["forge", "stall"] },
            { "id": "trader", "name": "Trader", "regions": ["market", "stall"] }""";

    /**
     * start, hall; hall leads to side, gate (a boss), tower (needs Key, found in the hall); side leads to tower with the Master Key; tower
     * leads to a (needs the first bell, rung in the tower); a to b (needs Soul A); b to throne (needs both souls), where the goal boss is.
     * Shops: the smith sells a Lantern at the forge; the smith and the trader both sell one at a shared (virtual) stall. tower to a also
     * needs the Lantern.
     */
    private static Fixtures.Data raw() {
        return new Fixtures.Data()
                .meta("{ \"start\": \"start\", \"goal\": \"Lord Defeated\" }")
                .regions("[" + REGIONS + "]")
                .entrances("[" + ENTRANCES + "]")
                .locations(LOCATIONS)
                .classes("{ \"gifts\": [{ \"row\": 1, \"items\": [\"(none)\"] }, { \"row\": 2, \"items\": [\"Master Key\"] }] }")
                .bosses("""
                        [{ "id": "gate-boss", "name": "Gate Boss", "region": "gate" }, { "id": "lord", "name": "Lord", "region": "throne" }]""")
                .merchants("[" + MERCHANTS + "]");
    }

    private static final World SMALL = raw().world();

    private static Setup smallSetup(int gift) {
        return new Setup(Mode.STATIC, SMALL.gifts().get(gift));
    }

    private static OrderArgs area(String area) {
        return args("area", area);
    }

    private static ValidationResult check(OrderInstance... orders) {
        return Validator.validate(SMALL, smallSetup(0), List.of(orders));
    }

    @Test
    void forbids_areas_refusing_one_the_goal_needs() {
        assertEquals(Verdict.COMFORTABLE, check(order("forbidden-area", area("side"))).verdict());
        var result = check(order("forbidden-area", area("tower")));
        assertEquals(Verdict.IMPOSSIBLE, result.verdict());
        assertEquals(List.of("the goal \"Lord Defeated\" cannot be reached"), result.problems());
    }

    @Test
    void checks_that_a_boss_can_die_before_any_bell_is_rung() {
        assertEquals(Verdict.COMFORTABLE, check(order("boss-before-bell", args("boss", "gate-boss"))).verdict());
        assertEquals(List.of("Lord cannot be defeated before a bell"), check(order("boss-before-bell", args("boss", "lord"))).problems());
    }

    @Test
    void checks_that_the_lord_souls_can_be_taken_in_the_given_order() {
        assertEquals(Verdict.COMFORTABLE, check(order("lord-order", args("order", List.of("Soul A", "Soul B")))).verdict());
        assertEquals(List.of("Soul B cannot be obtained before Soul A"), check(order("lord-order", args("order", List.of("Soul B", "Soul A")))).problems());
    }

    @Test
    void excepts_only_the_pickups_the_game_requires_given_the_starting_gift() {
        var ground = List.of(order("nothing-from-the-ground", area("hall")));
        assertEquals(List.of("Key"), Validator.validate(SMALL, smallSetup(0), ground).orders().get(0).exceptions());
        assertEquals(List.of(), Validator.validate(SMALL, smallSetup(1), ground).orders().get(0).exceptions());
    }

    @Test
    void validates_orders_together_one_order_can_make_anothers_exception_necessary() {
        var result = Validator.validate(SMALL, smallSetup(1), List.of(
                order("forbidden-area", area("side")),
                order("nothing-from-the-ground", area("hall"))));
        assertEquals(Verdict.COMFORTABLE, result.verdict());
        assertEquals(List.of("Key"), result.orders().get(1).exceptions());
    }

    @Test
    void keeps_a_merchant_who_still_has_one_reachable_shop_when_another_is_cut_off() {
        var world = raw()
                .regions("[" + REGIONS + ", { \"id\": \"deep\", \"name\": \"deep\", \"area\": \"wild\", \"mandatory\": false }]")
                .entrances("[" + ENTRANCES + ", { \"from\": \"hall\", \"to\": \"deep\", \"requires\": true }]")
                .merchants("[" + MERCHANTS + """
                        ,
                        { "id": "wanderer", "name": "Wanderer", "regions": ["market", "deep"] },
                        { "id": "hermit", "name": "Hermit", "regions": ["deep"] }]""")
                .world();
        var setup = new Setup(Mode.STATIC, world.gifts().get(0));

        // market stays open. One reachable shop is enough: the order is about the merchant, not every stall.
        var kept = Validator.validate(world, setup, List.of(order("forbidden-area", area("wild")), order("closed-merchant", args("merchant", "wanderer"))));
        assertEquals(Verdict.COMFORTABLE, kept.verdict());
        assertEquals(List.of(), kept.problems());
        var cut = Validator.validate(world, setup, List.of(order("forbidden-area", area("wild")), order("closed-merchant", args("merchant", "hermit"))));
        assertEquals(Verdict.IMPOSSIBLE, cut.verdict());
        assertTrue(cut.problems().contains("closed-merchant: Hermit cannot be reached"));
    }

    @Test
    void closes_a_merchant_keeping_a_shared_shop_open_while_another_merchant_sells_there() {
        assertEquals(List.of(), check(order("closed-merchant", args("merchant", "smith"))).orders().get(0).exceptions());
        var both = check(order("closed-merchant", args("merchant", "smith")), order("closed-merchant", args("merchant", "trader")));
        assertEquals(Verdict.COMFORTABLE, both.verdict());
        assertEquals(List.of("Lantern"), both.orders().get(0).exceptions());
        assertEquals(List.of(), both.orders().get(1).exceptions());
    }

    // Every static order has a check; the live-only ones wait for the live mode's state.
    @Test
    void reports_which_orders_it_cannot_check_yet() {
        var result = Validator.validate(SMALL, new Setup(Mode.LIVE, SMALL.gifts().get(0)), List.of(
                order("dry-fight", args("boss", "gate-boss")),
                order("boss-inheritance", args("boss", "gate-boss", "weapon", "x"))));
        assertEquals(List.of(Support.WEIGHT_ONLY, Support.PENDING), result.orders().stream().map(OrderResult::support).toList());
        assertFalse(result.complete());
    }

    @Test
    void leaves_order_5_pending_when_the_data_set_has_no_found_flag() {
        var unflagged = raw().locations("""
                [
                  { "name": "gate: Gate Boss Defeated", "region": "gate", "item": "Gate Boss Defeated", "count": 1, "category": "BOSS", "mandatory": false },
                  { "name": "throne: Lord Defeated", "region": "throne", "item": "Lord Defeated", "count": 1, "category": "BOSS", "mandatory": false },
                  { "name": "hall: Key", "region": "hall", "item": "Key", "count": 1, "category": "CORPSE_ITEM", "mandatory": false },
                  { "name": "tower: Bell", "region": "tower", "item": "Bell of Awakening #1", "count": 1, "category": "EVENT", "mandatory": false },
                  { "name": "a: Soul A", "region": "a", "item": "Soul A", "count": 1, "category": "LORD_SOUL", "mandatory": false },
                  { "name": "b: Soul B", "region": "b", "item": "Soul B", "count": 1, "category": "LORD_SOUL", "mandatory": false },
                  { "name": "forge: Lantern", "region": "forge", "item": "Lantern", "count": 1, "category": "SHOP_ITEM", "mandatory": false }
                ]""").world();
        var result = Validator.validate(unflagged, new Setup(Mode.STATIC, unflagged.gifts().get(0)), List.of(order("nothing-from-the-ground", area("hall"))));
        assertEquals(Support.PENDING, result.orders().get(0).support());
    }

    @Test
    void rejects_orders_the_generator_filled_in_wrong() {
        // The wager is live only; asking for it in a static challenge is a generator bug.
        assertThrows(InvalidOrderException.class, () -> check(order("wager", args("boss", "lord", "restriction", "x"))));
        assertThrows(InvalidOrderException.class, () -> check(order("forbidden-area", area("nowhere"))));
        assertThrows(InvalidOrderException.class, () -> check(order("lord-order", args("order", List.of("Soul A", "Soul A")))));
    }

    private static ValidationResult run(StartingGift gift, OrderInstance... orders) {
        return Validator.validate(DS1, new Setup(Mode.STATIC, gift), List.of(orders));
    }

    private static ValidationResult run(OrderInstance... orders) {
        return run(noGift(), orders);
    }

    private static List<String> ds1Areas() {
        return DS1.regions().values().stream().map(Region::area).filter(a -> a != null).distinct().toList();
    }

    @Test
    void names_bells_and_lord_souls_that_exist_in_the_graph() {
        var items = new HashSet<String>();
        for (var location : DS1.locations()) items.add(location.item());
        assertTrue(items.containsAll(Validator.BELLS));
        assertEquals(4, DS1.locations().stream().filter(l -> l.category().equals("LORD_SOUL")).count());
    }

    @Test
    void refuses_to_forbid_an_area_exactly_when_it_holds_a_mandatory_region() {
        var mandatory = new HashSet<>(strings(readFile("mandatory").get("regions")));
        for (var area : ds1Areas()) {
            var holdsMandatory = DS1.regions().values().stream().anyMatch(r -> area.equals(r.area()) && mandatory.contains(r.id()));
            assertEquals(holdsMandatory ? Verdict.IMPOSSIBLE : Verdict.COMFORTABLE, run(order("forbidden-area", area(area))).verdict(), area);
        }
    }

    private static List<String> before(StartingGift gift) {
        return DS1.bosses().keySet().stream()
                .filter(boss -> run(gift, order("boss-before-bell", args("boss", boss))).verdict() == Verdict.COMFORTABLE)
                .toList();
    }

    // Derived from the graph, not from memory. The Master Key opens no boss before a bell.
    @Test
    void finds_the_bosses_that_can_die_before_any_bell() {
        assertEquals(
                List.of(
                        "asylum-demon", "bell-gargoyles", "capra-demon", "ceaseless-discharge", "chaos-witch-quelaag", "gaping-dragon",
                        "great-grey-wolf-sif", "moonlight-butterfly", "pinwheel", "stray-demon", "taurus-demon"),
                sorted(before(noGift())));
        assertEquals(before(noGift()), before(masterKeyGift()));
    }

    private static List<List<String>> permutations(List<String> items) {
        if (items.size() <= 1) return List.of(items);
        List<List<String>> all = new ArrayList<>();
        for (var i = 0; i < items.size(); i++) {
            List<String> rest = new ArrayList<>(items);
            var first = rest.remove(i);
            for (var permutation : permutations(rest)) {
                List<String> whole = new ArrayList<>();
                whole.add(first);
                whole.addAll(permutation);
                all.add(whole);
            }
        }

        return all;
    }

    @Test
    void accepts_every_order_of_the_four_lord_souls() {
        var souls = DS1.locations().stream().filter(l -> l.category().equals("LORD_SOUL")).map(Location::item).toList();
        for (var lords : permutations(souls)) {
            assertEquals(List.of(), run(order("lord-order", args("order", lords))).problems());
        }
    }

    // The two found pickups the graph needs: the key on the corpse in the first cell, and the Archives chest key.
    @Test
    void excepts_in_each_area_exactly_the_pickups_the_run_cannot_do_without() {
        Map<String, List<String>> exceptions = new LinkedHashMap<>();
        for (var area : ds1Areas()) {
            var result = run(order("nothing-from-the-ground", area(area)));
            assertEquals(Verdict.COMFORTABLE, result.verdict());
            if (!result.orders().get(0).exceptions().isEmpty()) exceptions.put(area, result.orders().get(0).exceptions());
        }

        assertEquals(2, exceptions.size());
        assertEquals(List.of("Dungeon Cell Key"), exceptions.get("northern-undead-asylum"));
        assertEquals(List.of("Archive Tower Giant Door Key"), exceptions.get("the-dukes-archives"));
    }

    private static ValidationResult past(OrderInstance order) {
        return run(order("forbidden-area", area("royal-wood")), order);
    }

    private static OrderInstance dry(String boss) {
        return order("dry-fight", args("boss", boss));
    }

    @Test
    void rejects_an_order_whose_place_lies_past_a_forbidden_area() {
        assertTrue(past(order("no-bonfire", area("oolacile-township"))).problems().contains("no-bonfire: Oolacile Township cannot be reached"));
        assertTrue(past(dry("manus-father-of-the-abyss")).problems().contains("dry-fight: Manus, Father of the Abyss cannot be reached"));
        assertEquals(Verdict.IMPOSSIBLE, past(dry("knight-artorias")).verdict());
        assertEquals(Verdict.IMPOSSIBLE, past(dry("black-dragon-kalameet")).verdict());

        // The sanctuary is the way into the woods, so it stays open when the woods are closed.
        assertEquals(Verdict.COMFORTABLE, past(dry("sanctuary-guardian")).verdict());
        assertTrue(past(order("forbidden-area", area("oolacile-township"))).problems().contains("forbidden-area: Oolacile Township cannot be reached"));
    }

    private static OrderInstance one(String bonfire) {
        return order("one-bonfire", args("area", "anor-londo", "bonfire", bonfire));
    }

    // The game's scripts put these bonfires out, or add them late.
    @Test
    void rejects_a_one_bonfire_order_that_names_a_bonfire_out_for_part_of_the_run() {
        var windowed = DS1.locations().stream().filter(l -> l.category().equals("BONFIRE") && !l.alwaysLit()).toList();
        assertEquals(
                List.of("AL: Anor Londo Bonfire", "AL: Chamber of the Princess Bonfire", "FS: Firelink Shrine Bonfire"),
                sorted(windowed.stream().map(Location::name).toList()));
        for (var location : windowed) {
            var result = run(one(location.name()));
            assertEquals(Verdict.IMPOSSIBLE, result.verdict());
            assertEquals(location.unavailable().stream().map(w -> location.name() + " cannot be the one bonfire: " + w.why()).toList(), result.problems());
        }

        assertEquals(List.of(), run(one("AL: Darkmoon Tomb Bonfire")).problems());
        assertEquals(Verdict.COMFORTABLE, run(order("no-bonfire", area("firelink-shrine"))).verdict());
        assertEquals(Verdict.COMFORTABLE, run(order("no-bonfire", area("anor-londo"))).verdict());
    }

    @Test
    void counts_every_window_of_a_bonfire_not_only_the_first() {
        var raw = RawDataSet.fromDirectory(Fixtures.DATA);
        ArrayNode rows = JsonNodeFactory.instance.arrayNode();
        for (var row : raw.locations()) {
            var copy = (ObjectNode) row.deepCopy();
            if (copy.get("name").stringValue().equals("AL: Darkmoon Tomb Bonfire")) {
                copy.set("unavailable", json("""
                        [
                          { "from": true, "until": { "has": "Bell of Awakening #1" }, "why": "first" },
                          { "from": { "has": "Lordvessel" }, "until": null, "why": "second" }
                        ]"""));
            }

            rows.add(copy);
        }

        var twice = WorldParser.parse(new RawDataSet(
                raw.meta(), raw.regions(), raw.entrances(), rows, raw.classes(), raw.bosses(), raw.merchants(), raw.milestones(),
                raw.weapons(), raw.spells(), raw.areas(), raw.treasures(), raw.warnings()));
        var tomb = order("one-bonfire", args("area", "anor-londo", "bonfire", "AL: Darkmoon Tomb Bonfire"));
        assertEquals(
                List.of("AL: Darkmoon Tomb Bonfire cannot be the one bonfire: first", "AL: Darkmoon Tomb Bonfire cannot be the one bonfire: second"),
                Validator.validate(twice, new Setup(Mode.STATIC, noGift()), List.of(tomb)).problems());
    }

    @Test
    void can_close_any_single_merchant_with_no_exception() {
        for (var merchant : DS1.merchants().keySet()) {
            var result = run(order("closed-merchant", args("merchant", merchant)));
            assertEquals(Verdict.COMFORTABLE, result.verdict());
            assertEquals(List.of(), result.orders().get(0).exceptions());
        }
    }
}
