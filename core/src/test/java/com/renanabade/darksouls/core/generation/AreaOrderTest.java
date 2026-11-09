package com.renanabade.darksouls.core.generation;

import static com.renanabade.darksouls.core.Fixtures.DS1;
import static com.renanabade.darksouls.core.Fixtures.args;
import static com.renanabade.darksouls.core.Fixtures.order;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

import com.renanabade.darksouls.core.InvalidOrderException;
import com.renanabade.darksouls.core.Setup;
import com.renanabade.darksouls.core.ValidationResult;
import com.renanabade.darksouls.core.Validator;
import com.renanabade.darksouls.core.Verdict;
import com.renanabade.darksouls.core.orders.Catalog;
import com.renanabade.darksouls.core.orders.Difficulty;
import com.renanabade.darksouls.core.orders.Mode;
import com.renanabade.darksouls.core.orders.OrderInstance;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Orders about what an area holds, on the DS1 data set. */
class AreaOrderTest {
    private static ValidationResult check(OrderInstance... orders) {
        return Validator.validate(DS1, new Setup(Mode.STATIC, DS1.gifts().get(0), "Knight", 60), List.of(orders));
    }

    private static int chestsIn(String area) {
        return (int) DS1.chests().stream().filter(c -> area.equals(DS1.regions().get(c.region()).area())).count();
    }

    private static OrderInstance hunt(String area, String until) {
        return order("lizard-hunt", args("area", area, "until", until));
    }

    private static OrderInstance closed(String area, String until) {
        return order("the-other-way", args("area", area, "until", until));
    }

    @Test
    void reads_the_chests_of_the_world_without_the_firelink_rescue_chest() {
        assertTrue(DS1.chests().size() > 50);
        assertTrue(chestsIn("anor-londo") > 5);
    }

    @Test
    void needs_every_crystal_lizard_of_the_area_within_reach_before_the_milestone() {
        // The Crystal Cave lies past the Duke's Archives, which open once the Lordvessel is placed.
        assertEquals(
                List.of("not every crystal lizard of crystal-cave can be reached before Lordvessel placed at the Firelink Altar"),
                check(hunt("crystal-cave", "lordvessel-placed")).problems());
        assertEquals(Verdict.COMFORTABLE, check(hunt("crystal-cave", "boss-gwyn-lord-of-cinder")).verdict());
        assertThrows(InvalidOrderException.class, () -> check(hunt("depths", "both-bells")));
    }

    @Test
    void counts_the_chests_in_the_text_and_refuses_a_wrong_count() {
        var chests = chestsIn("anor-londo");
        assertEquals(Verdict.COMFORTABLE, check(order("every-chest", args("area", "anor-londo", "chests", chests, "until", "boss-gwyn-lord-of-cinder"))).verdict());
        assertEquals(
                "In Anor Londo: open all " + chests + " chests before you defeat Gwyn, Lord of Cinder.",
                Manual.orderText(DS1, new GeneratedOrder(Catalog.get("every-chest"), args("area", "anor-londo", "chests", chests, "until", "boss-gwyn-lord-of-cinder"), List.of(), null)));
        assertThrows(InvalidOrderException.class, () -> check(order("every-chest", args("area", "anor-londo", "chests", chests + 1, "until", "boss-gwyn-lord-of-cinder"))));
    }

    @Test
    void sends_the_player_for_a_pickup_only_when_it_can_be_taken_in_time() {
        var found = DS1.locations().stream()
                .filter(l -> l.isFound() && "weapon".equals(l.kind()) && l.region().startsWith("anor-londo"))
                .findFirst()
                .orElseThrow();
        assertEquals(Verdict.IMPOSSIBLE, check(order("errand", args("location", found.name(), "until", "both-bells"))).verdict());
        assertEquals(Verdict.COMFORTABLE, check(order("errand", args("location", found.name(), "until", "lordvessel-placed"))).verdict());
    }

    @Test
    void closes_an_area_until_a_milestone_only_when_another_way_exists() {
        assertEquals(Verdict.COMFORTABLE, check(closed("depths", "both-bells")).verdict());
        assertEquals(Verdict.IMPOSSIBLE, check(closed("undead-parish", "bell-undead-parish")).verdict());
        assertTrue(check(hunt("crystal-cave", "boss-gwyn-lord-of-cinder"), closed("crystal-cave", "boss-gwyn-lord-of-cinder")).problems()
                .contains("lizard-hunt sends you into crystal-cave, which the-other-way closes"));
    }

    @Test
    void leaves_the_journeys_forbidden_area_out_of_every_chapter() {
        for (var i = 1; i <= 6; i++) {
            var challenge = Generator.generate(DS1, new GeneratorConfig("forbid-" + i, Difficulty.MEDIUM, Length.FULL));
            var area = challenge.orders().stream()
                    .filter(o -> o.template().id().equals("forbidden-area"))
                    .map(o -> o.args().text("area"))
                    .findFirst()
                    .orElse(null);
            if (area == null) continue;
            assertTrue(challenge.chapters().stream().noneMatch(chapter -> chapter.areas().contains(area)));
            assertTrue(Manual.render(DS1, challenge).contains("Do not enter " + DS1.areas().get(area).name()));
            return;
        }

        fail("no sample journey forbids an area");
    }

    // These bonfires are out, or missing, for part of the run. One bonfire must not name them. No bonfire still may: it never asks the
    // player to rest at one of them.
    @Test
    void draws_only_the_bonfires_that_are_always_lit() {
        var domains = Draw.domainsOf(DS1);
        List<String> offered = new ArrayList<>();
        domains.bonfiresByArea().values().forEach(offered::addAll);
        assertFalse(offered.contains("FS: Firelink Shrine Bonfire"));
        assertFalse(offered.contains("AL: Anor Londo Bonfire"));
        assertFalse(offered.contains("AL: Chamber of the Princess Bonfire"));
        assertEquals(List.of("AL: Anor Londo - Residence Bonfire", "AL: Darkmoon Tomb Bonfire"), domains.bonfiresByArea().get("anor-londo"));
        assertFalse(domains.bonfiresByArea().containsKey("firelink-shrine"));
        assertTrue(domains.areasWithBonfires().contains("firelink-shrine"));
        assertTrue(domains.areasWithBonfires().contains("anor-londo"));
    }

    @Test
    void names_a_bonfire_without_its_area_code() {
        assertEquals(
                "In Anor Londo: rest only at the Darkmoon Tomb Bonfire.",
                Manual.orderText(DS1, new GeneratedOrder(Catalog.get("one-bonfire"), args("area", "anor-londo", "bonfire", "AL: Darkmoon Tomb Bonfire"), List.of(), null)));
    }
}
