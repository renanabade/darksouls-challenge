package com.renanabade.darksouls.core.orders;

import static com.renanabade.darksouls.core.Fixtures.readFile;
import static com.renanabade.darksouls.core.Fixtures.sorted;
import static com.renanabade.darksouls.core.Fixtures.sortedAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

class CatalogTest {
    private static final List<Difficulty> LEVELS = List.of(Difficulty.EASY, Difficulty.MEDIUM, Difficulty.HARD, Difficulty.EXTREME);

    @Test
    void has_the_orders_of_the_catalog_numbered_from_1_each_once() {
        assertEquals(IntStream.rangeClosed(1, 28).boxed().toList(), Catalog.ALL.stream().map(OrderTemplate::number).toList());
        assertEquals(Catalog.ALL.size(), Catalog.ALL.stream().map(OrderTemplate::id).distinct().count());
    }

    @Test
    void text_placeholders_are_exactly_the_parameters_and_exceptions() {
        for (var order : Catalog.ALL) {
            List<String> expected = new ArrayList<>(order.params().keySet());
            if (order.exceptions() != null) expected.add(order.exceptions().placeholder());
            assertEquals(sortedAll(expected), sortedAll(OrderTemplate.placeholdersOf(order.text())), order.id());
        }
    }

    @Test
    void every_piece_refers_to_a_declared_parameter_of_the_right_kind() {
        for (var order : Catalog.ALL) {
            for (var ref : order.paramRefs()) {
                assertTrue(order.params().containsKey(ref.param()), order.id() + ": " + ref.param() + " is not declared");
                assertEquals(ref.kind(), order.params().get(ref.param()).kind());
            }
        }
    }

    @Test
    void every_order_exists_in_at_least_one_mode() {
        for (var order : Catalog.ALL) assertFalse(order.modes().isEmpty());
    }

    // Principle: the static mode asks the player nothing.
    @Test
    void only_live_orders_ask_or_check_the_actual_case() {
        for (var order : Catalog.ALL) {
            if (order.asks() != null || order.command().kind() == CommandKind.OFFER_CHOICE) {
                assertEquals(List.of(Mode.LIVE), order.modes());
            }

            assertNotEquals(Validation.ACTUAL_CASE, order.staticValidation());
        }
    }

    @Test
    void exceptions_go_with_automatic_exception_validation() {
        for (var order : Catalog.ALL) {
            var auto = order.staticValidation() == Validation.AUTO_EXCEPTION || order.liveValidation() == Validation.AUTO_EXCEPTION;
            assertEquals(auto, order.exceptions() != null);
        }
    }

    @Test
    void has_exactly_four_live_only_orders() {
        assertEquals(List.of(4, 12, 19, 20), Catalog.ALL.stream().filter(o -> o.staticValidation() == null).map(OrderTemplate::number).toList());
    }

    private static List<String> fixedIn(MilestoneRef reference) {
        return switch (reference) {
            case MilestoneRef.Fixed f -> List.of(f.id());
            case MilestoneRef.FirstOf f -> f.ids();
            case null, default -> List.of();
        };
    }

    @Test
    void only_names_milestones_that_exist_in_the_data_set() {
        Set<String> ids = new HashSet<>();
        for (var milestone : readFile("milestones")) ids.add(milestone.get("id").stringValue());
        List<String> named = new ArrayList<>();
        for (var order : Catalog.ALL) {
            if (order.trigger() instanceof Trigger.MilestoneReached t) named.addAll(fixedIn(t.milestone()));
            if (order.scope() instanceof Scope.Phase s) {
                named.addAll(fixedIn(s.from()));
                named.addAll(fixedIn(s.until()));
            }
        }

        assertFalse(named.isEmpty());
        assertTrue(ids.containsAll(named));
    }

    // The group handicap moves a number to the same relative place in an easier range; that only eases the run if every bound of an easier
    // range is at least the same bound of a harder one.
    @Test
    void gives_every_count_a_range_per_difficulty_never_harder_for_an_easier_difficulty() {
        for (var order : Catalog.ALL) {
            for (var entry : order.params().entrySet()) {
                var spec = entry.getValue();
                if (spec.kind() != ParamKind.COUNT) continue;
                if (order.staticValidation() != null) assertNotNull(spec.ranges(), order.id() + "." + entry.getKey());
                var ranges = spec.ranges();
                if (ranges == null) continue;
                for (var level : LEVELS) assertTrue(ranges.of(level).min() <= ranges.of(level).max());
                for (var i = 0; i + 1 < LEVELS.size(); i++) {
                    assertTrue(ranges.of(LEVELS.get(i)).min() >= ranges.of(LEVELS.get(i + 1)).min());
                    assertTrue(ranges.of(LEVELS.get(i)).max() >= ranges.of(LEVELS.get(i + 1)).max());
                }
            }
        }
    }

    @Test
    void has_a_deathless_text_only_for_a_count_that_can_be_zero() {
        for (var order : Catalog.ALL) {
            var zero = order.textIfZero();
            if (zero == null) continue;
            assertEquals(0, order.params().get(zero.param()).ranges().extreme().min());
            assertEquals(List.of(), OrderTemplate.placeholdersOf(zero.text()));
        }
    }

    @Test
    void restrictions_have_unique_ids_and_manual_text() {
        assertEquals(Restrictions.ALL.size(), Restrictions.ALL.stream().map(Restriction::id).distinct().count());
        for (var restriction : Restrictions.ALL) assertTrue(restriction.text().matches("^[A-Z].*\\.$"), restriction.id());
    }

    @Test
    void has_light_restrictions_enough_for_an_easy_curse_and_heavy_ones_for_an_extreme_curse() {
        assertTrue(Restrictions.ALL.stream().filter(r -> r.tier() == Tier.LIGHT).count() >= 2);
        assertTrue(Restrictions.ALL.stream().filter(r -> r.tier() == Tier.HEAVY).count() >= 3);
    }

    @Test
    void lists_each_placeholder_once_in_order() {
        assertEquals(List.of("a", "b"), OrderTemplate.placeholdersOf("{a} and {b}, then {a}"));
        assertEquals(List.of(), OrderTemplate.placeholdersOf("no placeholders"));
    }

    @Test
    void sorted_helper_keeps_distinct_names() {
        assertEquals(List.of("a", "b"), sorted(List.of("b", "a", "b")));
    }
}
