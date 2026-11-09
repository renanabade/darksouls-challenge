package com.renanabade.darksouls.core;

import static com.renanabade.darksouls.core.Fixtures.DS1;
import static com.renanabade.darksouls.core.Fixtures.args;
import static com.renanabade.darksouls.core.Fixtures.noGift;
import static com.renanabade.darksouls.core.Fixtures.order;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.renanabade.darksouls.core.orders.Mode;
import com.renanabade.darksouls.core.orders.OrderInstance;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class WeaponOrderTest {
    private static String loc(String region, String item, String category, boolean found) {
        return "{ \"name\": \"%s: %s\", \"region\": \"%s\", \"item\": \"%s\", \"count\": 1, \"category\": \"%s\", \"mandatory\": false, \"found\": %s }"
                .formatted(region, item, region, item, category, found);
    }

    private static String weapon(int id, String name, int str, int intelligence, int phys, int magic, String category) {
        return """
                { "id": %d, "name": "%s", "category": "%s", "melee": true, "level": 0, "hands": { "both": true },
                  "req": { "str": %d, "dex": 0, "int": %d, "fth": 0 }, "baseDamage": { "phys": %d, "magic": %d, "fire": 0, "thunder": 0 } }"""
                .formatted(id, name, category, str, intelligence, phys, magic);
    }

    /**
     * camp, yard (a Club and a Heavy Axe on corpses), gate (the Brute), keep (a Moon Blade, magic only), crypt (the Wraith, whom physical
     * damage does not hurt; the goal), throne (a Crown Sword).
     */
    private static final World SMALL = new Fixtures.Data()
            .meta("{ \"start\": \"camp\", \"goal\": \"Wraith Defeated\" }")
            .regions("""
                    [
                      { "id": "camp", "name": "camp", "area": "camp", "mandatory": false },
                      { "id": "yard", "name": "yard", "area": "yard", "mandatory": false },
                      { "id": "gate", "name": "gate", "area": "yard", "mandatory": false },
                      { "id": "keep", "name": "keep", "area": "keep", "mandatory": false },
                      { "id": "crypt", "name": "crypt", "area": "keep", "mandatory": false },
                      { "id": "throne", "name": "throne", "area": "throne", "mandatory": false }
                    ]""")
            .entrances("""
                    [
                      { "from": "camp", "to": "yard", "requires": true },
                      { "from": "yard", "to": "gate", "requires": true },
                      { "from": "gate", "to": "keep", "requires": { "has": "Brute Defeated" } },
                      { "from": "keep", "to": "crypt", "requires": true },
                      { "from": "crypt", "to": "throne", "requires": { "has": "Wraith Defeated" } }
                    ]""")
            .locations("[" + String.join(",",
                    loc("yard", "Club", "CORPSE_ITEM", true),
                    loc("yard", "Heavy Axe", "CORPSE_ITEM", true),
                    loc("keep", "Moon Blade", "CORPSE_ITEM", true),
                    loc("throne", "Crown Sword", "CORPSE_ITEM", true),
                    loc("gate", "Brute Defeated", "BOSS", false),
                    loc("crypt", "Wraith Defeated", "BOSS", false)) + "]")
            .classes("""
                    { "classes": [{ "name": "Knight", "level": 5, "stats": { "strength": 12, "dexterity": 10, "intelligence": 8, "faith": 8, "attunement": 10 } }],
                      "gifts": [{ "row": 1, "items": ["(none)"] }] }""")
            .bosses("""
                    [
                      { "id": "brute", "name": "Brute", "region": "gate", "parts": [{ "noDamage": [] }] },
                      { "id": "wraith", "name": "Wraith", "region": "crypt", "parts": [{ "noDamage": ["phys"] }] }
                    ]""")
            .merchants("[]")
            .milestones("""
                    [
                      { "id": "brute-dead", "name": "Brute defeated", "kind": "boss", "requires": { "has": "Brute Defeated" } },
                      { "id": "wraith-dead", "name": "Wraith defeated", "kind": "boss", "requires": { "has": "Wraith Defeated" } }
                    ]""")
            .weapons("[" + String.join(",",
                    weapon(1, "Club", 10, 0, 100, 0, "hammer"),
                    weapon(2, "Heavy Axe", 30, 0, 150, 0, "axe"), // two-handed: 20 Strength, 8 points for the Knight
                    weapon(3, "Moon Blade", 0, 15, 0, 80, "sword"), // 7 Intelligence points
                    weapon(4, "Crown Sword", 0, 0, 0, 120, "sword")) + "]")
            .world();

    private static ValidationResult check(int levelCap, OrderInstance... orders) {
        return Validator.validate(SMALL, new Setup(Mode.STATIC, SMALL.gifts().get(0), "Knight", levelCap), List.of(orders));
    }

    private static OrderInstance firstWeapon(String area, String until) {
        return order("first-weapon-of-area", args("area", area, "until", until));
    }

    private static OrderInstance assigned(String location) {
        return order("assigned-weapon", args("from", "brute-dead", "until", "wraith-dead", "location", location));
    }

    private static OrderInstance curse(String... ids) {
        return order("accumulated-curse", args("restrictions", List.of(ids)));
    }

    private static OrderInstance swap(String before, String after) {
        return order("phase-swap", args("milestone", "brute-dead", "before", before, "after", after));
    }

    private static OrderInstance fight(String id, String boss, String element) {
        return order(id, args("boss", boss, "element", element));
    }

    @Test
    void first_weapon_needs_every_weapon_of_the_area_to_be_wieldable_within_the_level_cap() {
        var yard = firstWeapon("yard", "brute-dead");
        assertEquals(List.of("Heavy Axe needs 8 attribute points; the build leaves 5 (found in yard, used until Brute defeated)"), check(10, yard).problems());
        assertEquals(Verdict.COMFORTABLE, check(13, yard).verdict());
    }

    @Test
    void first_weapon_needs_every_weapon_to_hurt_the_bosses_of_the_stretch() {
        assertEquals(Verdict.COMFORTABLE, check(12, firstWeapon("keep", "wraith-dead")).verdict());
        assertTrue(check(20, firstWeapon("yard", "wraith-dead")).problems().get(0).contains("cannot damage Wraith"));
    }

    @Test
    void first_weapon_refuses_an_area_with_no_weapon_to_find() {
        assertEquals(List.of("there is no weapon to find in camp"), check(20, firstWeapon("camp", "brute-dead")).problems());
    }

    @Test
    void assigned_weapon_accepts_a_weapon_taken_before_the_stretch_ends_that_hurts_its_bosses() {
        assertEquals(Verdict.COMFORTABLE, check(12, assigned("keep: Moon Blade")).verdict());
        assertEquals(Verdict.IMPOSSIBLE, check(11, assigned("keep: Moon Blade")).verdict());
    }

    @Test
    void assigned_weapon_refuses_one_the_bosses_shrug_off_or_one_found_too_late() {
        assertTrue(check(20, assigned("yard: Club")).problems().get(0).contains("Club cannot damage Wraith"));
        assertEquals(
                List.of("Crown Sword at \"throne: Crown Sword\" cannot be taken before the bosses until Wraith defeated"),
                check(20, assigned("throne: Crown Sword")).problems());
    }

    @Test
    void assigned_weapon_refuses_to_run_without_a_class_and_a_level_cap() {
        assertThrows(InvalidOrderException.class, () ->
                Validator.validate(SMALL, new Setup(Mode.STATIC, SMALL.gifts().get(0)), List.of(assigned("keep: Moon Blade"))));
    }

    @Test
    void leaves_no_points_when_levels_must_be_earned() {
        var earned = order("earned-levels", args("condition", "x", "points", 1));
        assertEquals(
                List.of("Heavy Axe needs 8 attribute points; the build leaves 0 (found in yard, used until Brute defeated)"),
                check(30, firstWeapon("yard", "brute-dead"), earned).problems());
    }

    @Test
    void applies_every_restriction_of_the_curse_from_the_start() {
        var yard = firstWeapon("yard", "brute-dead");

        // One-handed, the Heavy Axe needs 30 Strength: 18 points for the Knight.
        assertEquals(Verdict.COMFORTABLE, check(20, yard, curse("no-estus")).verdict());
        assertTrue(check(20, yard, curse("no-estus", "one-handed")).problems().get(0).startsWith("Heavy Axe needs 18 attribute points"));
        assertThrows(InvalidOrderException.class, () -> check(20, curse("no-such-thing")));
    }

    @Test
    void lets_two_orders_choose_your_weapon_one_after_the_other_with_one_build_for_all() {
        var first = firstWeapon("yard", "brute-dead");
        var assigned = assigned("keep: Moon Blade");

        // Heavy Axe (8 Strength points) and Moon Blade (7 Intelligence points): 15 of the Knight's 15.
        assertEquals(Verdict.COMFORTABLE, check(20, first, assigned).verdict());
        assertEquals(
                List.of("Club and Heavy Axe and Moon Blade need 15 attribute points; the build leaves 14 (every weapon the orders may hand you)"),
                check(19, first, assigned).problems());
    }

    @Test
    void refuses_two_orders_that_choose_your_weapon_at_the_same_time() {
        var assigned = assigned("keep: Moon Blade");
        assertTrue(check(40, firstWeapon("yard", "wraith-dead"), assigned).problems()
                .contains("first-weapon-of-area and assigned-weapon would choose your weapon at the same time"));
        assertTrue(check(40, swap("hammer", "sword"), assigned).problems()
                .contains("phase-swap and assigned-weapon would choose your weapon at the same time"));
    }

    @Test
    void applies_a_chapter_restriction_to_the_whole_run_the_worst_case() {
        var chapter = order("chapter-restriction", args("from", "brute-dead", "until", "wraith-dead", "restriction", "one-handed"));
        assertTrue(check(20, firstWeapon("yard", "brute-dead"), chapter).problems().get(0).startsWith("Heavy Axe needs 18 attribute points"));
    }

    @Test
    void refuses_to_wear_what_you_find_under_a_curse_of_no_armor() {
        assertEquals(
                List.of("the restriction \"no-armor\" contradicts the order \"wear-what-you-find\""),
                check(30, order("wear-what-you-find", args("area", "yard")), curse("no-armor")).problems());
    }

    @Test
    void phase_swap_finds_a_weapon_of_each_style_in_time_that_one_build_can_wield() {
        // Club (hammer, yard) until the Brute; Moon Blade (sword, magic) for the Wraith: 7 Intelligence points.
        assertEquals(Verdict.COMFORTABLE, check(12, swap("hammer", "sword")).verdict());
        assertEquals(List.of("no hammer and sword fit one build"), check(11, swap("hammer", "sword")).problems());
    }

    @Test
    void phase_swap_needs_the_second_style_to_hurt_the_bosses_after_the_milestone() {
        assertEquals(List.of("no hammer can be taken for after Brute defeated"), check(30, swap("axe", "hammer")).problems());
    }

    @Test
    void phase_swap_needs_the_first_style_before_the_milestone() {
        assertEquals(List.of("no sword can be taken before Brute defeated"), check(30, swap("sword", "hammer")).problems());
    }

    private static ValidationResult run(String startingClass, int levelCap, OrderInstance... orders) {
        return Validator.validate(DS1, new Setup(Mode.STATIC, noGift(), startingClass, levelCap), List.of(orders));
    }

    private static OrderInstance ds1Swap(String milestone, String before, String after) {
        return order("phase-swap", args("milestone", milestone, "before", before, "after", after));
    }

    private static OrderInstance noRings(String from, String until) {
        return order("chapter-restriction", args("from", from, "until", until, "restriction", "no-rings"));
    }

    // Derived from the data set: a Knight at soul level 30 can wield whatever melee weapon each area offers until the Kiln; a level-1
    // Pyromancer has no points to spend, and every one needs some.
    @Test
    void gives_a_first_weapon_of_the_area_that_a_knight_at_level_30_can_always_use() {
        var areas = List.of(
                "anor-londo", "blighttown", "darkroot-garden", "depths", "firelink-shrine", "new-londo-ruins",
                "painted-world-of-ariamis", "sens-fortress", "the-catacombs", "undead-burg", "undead-parish", "valley-of-drakes");
        for (var area : areas) {
            var first = firstWeapon(area, "kiln-open");
            assertEquals(Verdict.COMFORTABLE, run("Knight", 30, first).verdict(), area);
            assertEquals(Verdict.IMPOSSIBLE, run("Pyromancer", 1, first).verdict(), area);
        }
    }

    @Test
    void excepts_from_no_rings_exactly_the_rings_the_run_needs() {
        var result = run("Knight", 30, curse("no-rings", "no-estus"));
        assertEquals(Verdict.COMFORTABLE, result.verdict());
        assertEquals(List.of("Covenant of Artorias", "Orange Charred Ring"), result.orders().get(0).exceptions());
    }

    @Test
    void excepts_from_a_chapters_no_rings_only_the_rings_that_chapter_needs() {
        var early = run("Knight", 30, noRings("boss-asylum-demon", "bell-undead-parish"));
        assertEquals(Verdict.COMFORTABLE, early.verdict());
        assertEquals(List.of(), early.orders().get(0).exceptions());
        var late = run("Knight", 30, noRings("lordvessel-placed", "kiln-open"));
        assertEquals(List.of("Covenant of Artorias", "Orange Charred Ring"), late.orders().get(0).exceptions());
    }

    // From the chapter's start, not the run's: what lies behind the player is not what the chapter needs.
    @ParameterizedTest
    @CsvSource({"kiln-open,boss-gwyn-lord-of-cinder", "boss-asylum-demon,bell-undead-parish"})
    void excepts_no_ring_in_a_chapter_that_needs_none(String from, String until) {
        var result = run("Knight", 30, noRings(from, until));
        assertEquals(Verdict.COMFORTABLE, result.verdict());
        assertEquals(List.of(), result.orders().get(0).exceptions());
    }

    @ParameterizedTest
    @CsvSource({
        "lordvessel-placed,lord-souls-placed-3,Covenant of Artorias", // the Four Kings, in the Abyss
        "lordvessel-placed,lord-souls-placed-2,Orange Charred Ring" // the Bed of Chaos, past the lava
    })
    void excepts_only_the_ring_a_chapters_own_goal_needs(String from, String until, String ring) {
        assertEquals(List.of(ring), run("Knight", 30, noRings(from, until)).orders().get(0).exceptions());
    }

    private static OrderInstance lords() {
        return order("lord-order", args("order", List.of(
                "Lord Soul (Nito)", "Bequeathed Lord Soul Shard (Seath)", "Bequeathed Lord Soul Shard (Four Kings)", "Lord Soul (Bed of Chaos)")));
    }

    // The Kiln's chapter starts with every soul placed, so it needs no ring, though the run as a whole needs two.
    @Test
    void excepts_no_ring_in_the_kilns_chapter() {
        var result = run("Knight", 30, lords(), noRings("lord-souls-placed-2", "boss-gwyn-lord-of-cinder"));
        assertEquals(Verdict.COMFORTABLE, result.verdict());
        assertEquals(List.of(), result.orders().get(1).exceptions());
    }

    @Test
    void excepts_the_rings_of_the_souls_still_ahead_by_the_order_of_the_lords() {
        // After the Four Kings, only the Bed of Chaos is ahead. Before them, the Covenant is still needed too.
        assertEquals(List.of("Orange Charred Ring"), run("Knight", 30, lords(), noRings("lord-souls-placed-3", "lord-souls-placed-2")).orders().get(1).exceptions());
        assertEquals(List.of("Covenant of Artorias"), run("Knight", 30, lords(), noRings("lord-souls-placed-4", "lord-souls-placed-3")).orders().get(1).exceptions());
    }

    // Without the order of the Lords, any soul may still be ahead: the worst case.
    @Test
    void excepts_both_rings_when_the_souls_ahead_are_not_known() {
        assertEquals(
                List.of("Covenant of Artorias", "Orange Charred Ring"),
                run("Knight", 30, noRings("lord-souls-placed-1", "boss-gwyn-lord-of-cinder")).orders().get(0).exceptions());
    }

    @Test
    void swaps_fighting_style_at_the_lordvessel_when_one_build_fits_both() {
        var swap = ds1Swap("lordvessel-obtained", "dagger", "halberd");
        assertEquals(Verdict.COMFORTABLE, run("Knight", 10, swap).verdict());
        assertEquals(List.of("no dagger and halberd fit one build"), run("Deprived", 6, swap).problems());
    }

    @Test
    void lets_a_sorcerer_start_with_sorceries_the_class_kit_has_a_catalyst_and_soul_arrow() {
        assertEquals(Verdict.COMFORTABLE, run("Sorcerer", 20, ds1Swap("bell-undead-parish", "sorcery", "sword")).verdict());
    }

    @Test
    void needs_attunement_for_a_slot_a_warrior_has_8_and_spends_2_points_on_it() {
        // Soul Arrow with a Sorcerer's Catalyst: Intelligence 10 (the Warrior has 9) and Attunement 10.
        var before = ds1Swap("bell-undead-parish", "sorcery", "dagger");
        assertEquals(List.of("no sorcery and dagger fit one build"), run("Warrior", 6, before).problems());
        assertEquals(Verdict.COMFORTABLE, run("Warrior", 7, before).verdict());
    }

    @Test
    void refuses_pyromancy_while_quelaag_whom_fire_does_not_hurt_is_still_to_fight() {
        assertEquals(Verdict.COMFORTABLE, run("Pyromancer", 30, ds1Swap("bell-undead-parish", "pyromancy", "sword")).verdict());
        assertEquals(
                List.of("no pyromancy can be taken for after Undead Parish bell rung"),
                run("Pyromancer", 30, ds1Swap("bell-undead-parish", "sword", "pyromancy")).problems());
    }

    @Test
    void a_school_of_magic_contradicts_a_curse_of_no_magic() {
        assertTrue(run("Sorcerer", 30, ds1Swap("bell-undead-parish", "sorcery", "sword"), curse("no-magic")).problems()
                .contains("the restriction \"no-magic\" contradicts fighting with sorcery"));
    }

    private static OrderInstance assignHalberd(String from) {
        var halberd = DS1.locations().stream().filter(l -> l.isFound() && l.item().equals("Halberd")).findFirst().orElseThrow();
        return order("assigned-weapon", args("from", from, "until", "bell-undead-parish", "location", halberd.name()));
    }

    @Test
    void assigns_the_undead_parish_halberd_from_the_taurus_demon_to_the_first_bell() {
        assertEquals(Verdict.COMFORTABLE, run("Knight", 10, assignHalberd("boss-taurus-demon")).verdict());
        assertTrue(run("Pyromancer", 1, assignHalberd("boss-taurus-demon")).problems().get(0).matches("^Halberd needs \\d+ attribute points.*"));

        // The Parish lies past the Taurus Demon: from the Asylum Demon on, the halberd comes too late for him.
        assertTrue(run("Knight", 10, assignHalberd("boss-asylum-demon")).problems().get(0).contains("cannot be taken before the bosses"));
    }

    @Test
    void element_fight_needs_something_that_deals_the_element_before_the_boss_falls_within_the_build() {
        assertEquals(Verdict.COMFORTABLE, check(12, fight("exploit-weakness", "wraith", "magic")).verdict());
        assertEquals(List.of("nothing that deals magic against Wraith fits the build"), check(11, fight("exploit-weakness", "wraith", "magic")).problems());

        // The Moon Blade lies past the Brute.
        assertEquals(List.of("nothing that deals magic can be taken before Brute"), check(20, fight("against-the-grain", "brute", "magic")).problems());
        assertEquals(Verdict.IMPOSSIBLE, check(20, fight("against-the-grain", "wraith", "fire")).verdict());
    }

    @Test
    void refuses_two_elements_for_one_fight_and_an_element_while_an_order_chooses_your_weapon() {
        assertTrue(check(20, fight("exploit-weakness", "wraith", "magic"), fight("against-the-grain", "wraith", "fire")).problems()
                .contains("Wraith cannot be fought only with magic and only with fire"));
        assertEquals(
                List.of("assigned-weapon chooses your weapon, and exploit-weakness the element of a fight"),
                check(20, assigned("keep: Moon Blade"), fight("exploit-weakness", "wraith", "magic")).problems());
    }
}
