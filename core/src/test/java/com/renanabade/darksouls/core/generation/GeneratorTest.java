package com.renanabade.darksouls.core.generation;

import static com.renanabade.darksouls.core.Fixtures.DS1;
import static com.renanabade.darksouls.core.Fixtures.args;
import static com.renanabade.darksouls.core.Fixtures.order;
import static com.renanabade.darksouls.core.Fixtures.sorted;
import static com.renanabade.darksouls.core.Fixtures.sortedAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.renanabade.darksouls.core.Combat;
import com.renanabade.darksouls.core.Fixtures;
import com.renanabade.darksouls.core.Validator;
import com.renanabade.darksouls.core.Verdict;
import com.renanabade.darksouls.core.World;
import com.renanabade.darksouls.core.orders.Catalog;
import com.renanabade.darksouls.core.orders.Difficulty;
import com.renanabade.darksouls.core.orders.OrderArgs;
import com.renanabade.darksouls.core.orders.ParamKind;
import com.renanabade.darksouls.core.orders.Restrictions;
import com.renanabade.darksouls.core.orders.Tier;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.EnumMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

class GeneratorTest {
    private static GeneratorConfig config(String seed, Difficulty difficulty, Length length) {
        return new GeneratorConfig(seed, difficulty, length);
    }

    private static List<Challenge> sample;

    /** Generated once, by whichever test asks first. Not in a static initializer: its parallel workers would wait for it, and never end. */
    private static synchronized List<Challenge> sample() {
        if (sample == null) {
            sample = generated(24, "seed", i -> config("seed-" + i, Curves.DIFFICULTIES.get(i % 4), Length.values()[i / 4 % 3]));
        }

        return sample;
    }

    private static List<Challenge> generated(int count, String prefix, java.util.function.IntFunction<GeneratorConfig> config) {
        return IntStream.range(0, count).parallel().mapToObj(i -> Generator.generate(DS1, config.apply(i))).toList();
    }

    private static ChapterPlan everything() {
        return new ChapterPlan("kiln-open", List.of("kiln-open"), List.copyOf(DS1.areas().keySet()), List.copyOf(DS1.bosses().keySet()), 0, Difficulty.MEDIUM);
    }

    private static ChapterPlan plan(String goal, List<String> areas, List<String> bosses) {
        return new ChapterPlan(goal, List.of(goal), areas, bosses, 0, Difficulty.MEDIUM);
    }

    private static GeneratedOrder generatedOrder(String id, OrderArgs args) {
        return new GeneratedOrder(Catalog.get(id), args, List.of(), null);
    }

    private static List<Double> draw(String seed) {
        var rng = new SeededRandom(seed);
        return IntStream.range(0, 5).mapToObj(i -> rng.next()).toList();
    }

    @Test
    void random_repeats_the_same_sequence_for_the_same_seed_and_only_for_it() {
        assertEquals(draw("a"), draw("a"));
        assertNotEquals(draw("a"), draw("b"));
    }

    @Test
    void random_keeps_integers_in_range_and_shuffles_without_losing_items() {
        var rng = new SeededRandom("range");
        Set<Integer> ints = new HashSet<>();
        for (var i = 0; i < 500; i++) ints.add(rng.nextInt(3, 5));
        assertEquals(Set.of(3, 4, 5), ints);
        var list = List.of("a", "b", "c", "d", "e");
        assertEquals(list, sorted(rng.shuffle(list)));
    }

    @Test
    void random_puts_heavier_items_first_more_often_in_a_weighted_shuffle() {
        var rng = new SeededRandom("weights");
        var list = List.of("light", "heavy");
        var heavyFirst = 0;
        for (var i = 0; i < 1000; i++) {
            if (rng.weightedShuffle(list, x -> x.equals("heavy") ? 9 : 1).get(0).equals("heavy")) heavyFirst++;
        }

        assertTrue(heavyFirst > 850, "9 / (9 + 1) of the time, got " + heavyFirst);
    }

    @Test
    void gives_the_same_challenge_for_the_same_seed_and_settings() {
        var config = config("ashen-one", Difficulty.MEDIUM, Length.FULL);
        var manual = Manual.render(DS1, Generator.generate(DS1, config));
        assertEquals(manual, Manual.render(DS1, Generator.generate(DS1, config)));
        assertNotEquals(manual, Manual.render(DS1, Generator.generate(DS1, config.withSeed("other"))));
    }

    // Royal Wood is the only way into the Township and the Chasm. Forbidding it must not leave those places, or their bosses, anywhere in
    // the manual. Built by hand, so no seed has to draw it.
    @Test
    void does_not_send_the_player_past_a_forbidden_area() {
        var forbid = order("forbidden-area", args("area", "royal-wood"));
        var fight = order("dry-fight", args("boss", "sanctuary-guardian"));
        var chapter = Generator.reachableChapters(DS1, List.of(everything()), List.of(forbid, fight), List.of()).get(0);
        assertFalse(chapter.areas().contains("royal-wood"));
        assertTrue(chapter.areas().contains("oolacile-sanctuary"));
        for (var area : List.of("oolacile-township", "chasm-of-the-abyss")) assertFalse(chapter.areas().contains(area));
        for (var boss : List.of("manus-father-of-the-abyss", "knight-artorias", "black-dragon-kalameet")) assertFalse(chapter.bosses().contains(boss));
        assertTrue(chapter.bosses().contains("sanctuary-guardian"));
        var challenge = Generator.generate(DS1, config("ashen-one", Difficulty.MEDIUM, Length.FULL));
        assertEquals(Verdict.COMFORTABLE, Validator.validate(DS1, challenge.setup(), List.of(forbid, fight)).verdict());
        var manual = Manual.render(DS1, new Challenge(
                challenge.config(), challenge.code(), challenge.dataVersion(), challenge.setup(), challenge.curve(),
                List.of(chapter),
                List.of(new GeneratedOrder(forbid.template(), forbid.args(), List.of(), null), new GeneratedOrder(fight.template(), fight.args(), List.of(), 0))));
        for (var name : List.of("Oolacile Township", "Chasm of the Abyss", "Manus", "Kalameet")) assertFalse(manual.contains(name), name);
        assertFalse(manual.contains("**Areas:** Royal Wood"));
        assertTrue(manual.contains("Oolacile Sanctuary"));
    }

    // An area "the other way" closes for a chapter is not listed in that chapter, nor what lies past it; the next chapter lists it again.
    @Test
    void leaves_out_of_a_chapter_the_area_its_other_way_closes() {
        var other = order("the-other-way", args("area", "royal-wood", "until", "kiln-open"), 0);
        var chapters = Generator.reachableChapters(DS1, List.of(everything(), everything()), List.of(other), List.of());
        assertFalse(chapters.get(0).areas().contains("royal-wood"));
        assertFalse(chapters.get(0).areas().contains("oolacile-township"));
        assertFalse(chapters.get(0).bosses().contains("knight-artorias"));
        assertTrue(chapters.get(1).areas().contains("royal-wood"));
        assertTrue(chapters.get(1).bosses().contains("knight-artorias"));
    }

    @Test
    void brings_back_what_a_chapters_other_way_closes_in_the_next_chapter_with_rules() {
        // Nothing in chapter 1 prints; the first chapter that prints after the closure lists what it hid.
        var chapters = Generator.reachableChapters(
                DS1,
                List.of(
                        plan("a", List.of("royal-wood", "oolacile-township"), List.of("knight-artorias")),
                        plan("b", List.of("depths"), List.of()),
                        plan("c", List.of("anor-londo"), List.of("gwyndolin"))),
                List.of(
                        order("the-other-way", args("area", "royal-wood", "until", "kiln-open"), 0),
                        order("dry-fight", args("boss", "gwyndolin"), 2)),
                List.of());
        assertTrue(chapters.get(0).areas().isEmpty());
        assertTrue(chapters.get(0).bosses().isEmpty());
        assertTrue(chapters.get(2).areas().contains("royal-wood"));
        assertTrue(chapters.get(2).areas().contains("oolacile-township"));
        assertTrue(chapters.get(2).bosses().contains("knight-artorias"));
    }

    @Test
    void never_brings_back_what_the_run_forbids() {
        var chapters = Generator.reachableChapters(
                DS1,
                List.of(everything(), everything()),
                List.of(order("forbidden-area", args("area", "royal-wood")), order("the-other-way", args("area", "royal-wood", "until", "kiln-open"), 0)),
                List.of());
        for (var chapter : chapters) {
            assertFalse(chapter.areas().contains("royal-wood"));
            assertFalse(chapter.bosses().contains("knight-artorias"));
        }
    }

    // Darkroot closed in one chapter once left Sif with no Darkroot listed later.
    @Test
    void across_many_seeds_a_closed_area_reappears_in_a_later_chapter() {
        var closures = 0;
        for (var challenge : generated(200, "closed", i -> config("closed-" + i, Curves.DIFFICULTIES.get(i % 4), Length.FULL))) {
            for (var other : challenge.orders()) {
                if (!other.template().id().equals("the-other-way")) continue;
                var area = other.args().text("area");
                var printed = IntStream.range(0, challenge.chapters().size())
                        .filter(k -> k > other.chapter() && challenge.orders().stream().anyMatch(o -> Objects.equals(o.chapter(), k)))
                        .mapToObj(challenge.chapters()::get)
                        .toList();
                if (printed.isEmpty()) continue;
                assertTrue(printed.stream().anyMatch(chapter -> chapter.areas().contains(area)), area);
                closures++;
            }
        }

        assertTrue(closures > 20, "only " + closures + " closures to look at");
    }

    @Test
    void caps_the_rules_about_how_a_fight_is_fought_at_three_per_run() {
        var fights = Set.of("dry-fight", "exploit-weakness", "against-the-grain");
        for (var challenge : generated(60, "fights", i -> config("fights-" + i, Curves.DIFFICULTIES.get(i % 4), Length.values()[i % 3]))) {
            assertTrue(challenge.orders().stream().filter(o -> fights.contains(o.template().id())).count() <= 3);
        }
    }

    @Test
    void leaves_the_abyss_out_of_no_bonfire() {
        assertFalse(Draw.domainsOf(DS1).areasWithBonfires().contains("the-abyss"));
        assertTrue(DS1.locations().stream().anyMatch(l -> l.category().equals("BONFIRE") && "the-abyss".equals(DS1.regions().get(l.region()).area())));
    }

    @Test
    void separates_bosses_with_a_dot_because_their_names_hold_commas() {
        var manual = Manual.render(DS1, Generator.generate(DS1, config("dots", Difficulty.MEDIUM, Length.SHORT)));
        var lines = manual.split("\n");
        var line = Arrays.stream(lines).filter(l -> l.contains("**Bosses:**") && l.contains("Lord of Cinder")).findFirst().orElseThrow();
        assertTrue(line.contains("Gwyn, Lord of Cinder"));
        var multiple = Arrays.stream(lines).filter(l -> l.contains("**Bosses:** Asylum Demon")).findFirst().orElseThrow();
        assertTrue(multiple.contains("Asylum Demon · "));
    }

    @Test
    void writes_a_phase_swap_as_what_to_use_from_then_on() {
        assertEquals(
                "After the Asylum Demon and until you have rung both bells: only daggers. From then on, use only curved swords.",
                Manual.orderText(DS1, generatedOrder("phase-swap", args("milestone", "both-bells", "before", "dagger", "after", "curved sword"))));
    }

    @Test
    void ends_every_manual_with_what_the_scripts_do_to_npcs() {
        var manual = Manual.render(DS1, Generator.generate(DS1, config("ashen-one", Difficulty.MEDIUM, Length.FULL)));
        var before = manual.substring(manual.indexOf("## Before you go"));
        for (var npc : List.of("Lautrec of Carim", "Rhea of Thorolund", "Trusty Patches", "Solaire of Astora", "Darkstalker Kaathe")) {
            assertTrue(before.contains("- **" + npc + ":**"), npc);
        }
    }

    @Test
    void respects_a_class_gift_and_level_cap_the_player_fixes() {
        var challenge = Generator.generate(DS1, config("fixed", Difficulty.HARD, Length.SHORT).withStartingClass("Pyromancer").withGiftRow(2406).withLevelCap(1));
        assertEquals("Pyromancer", challenge.setup().startingClass());
        assertEquals(List.of("Master Key"), challenge.setup().gift().items().stream().map(i -> i.item()).toList());
        assertEquals(1, challenge.setup().levelCap());
    }

    private static long count(Challenge challenge, String id) {
        return challenge.orders().stream().filter(o -> o.template().id().equals(id)).count();
    }

    private static double average(List<Integer> values) {
        return values.stream().mapToInt(Integer::intValue).average().orElseThrow();
    }

    // Many seeds, every challenge possible, and each chapter's rules about the chapter's own areas and bosses.
    @Test
    void only_generates_journeys_that_validate_longer_as_the_length_grows() {
        Map<Length, List<Integer>> sizes = new EnumMap<>(Length.class);
        for (var length : Length.values()) sizes.put(length, new ArrayList<>());
        for (var challenge : sample()) {
            var result = Validator.validate(DS1, challenge.setup(), challenge.orders());
            assertEquals(Verdict.COMFORTABLE, result.verdict());
            assertTrue(result.complete());
            sizes.get(challenge.config().length()).add(challenge.orders().size());
            for (var order : challenge.orders()) {
                var k = order.chapter();
                if (k == null) continue;
                var chapter = challenge.chapters().get(k);

                // The area the other way closes is the one place of the chapter the player is not sent.
                var area = order.args().text("area");
                if (area != null) {
                    assertEquals(!order.template().id().equals("the-other-way"), chapter.areas().contains(area), area);
                } else {
                    assertNotEquals("the-other-way", order.template().id());
                }

                var boss = order.args().text("boss");
                if (boss != null) assertTrue(chapter.bosses().contains(boss), boss);
            }

            assertTrue(count(challenge, "errand") <= 2);
            assertTrue(count(challenge, "every-chest") <= 1);
            assertTrue(count(challenge, "counted-attempts") <= 3);
        }

        assertTrue(sizes.get(Length.SHORT).stream().allMatch(s -> s <= 10));
        assertTrue(sizes.get(Length.FULL).stream().allMatch(s -> s <= 18));
        assertTrue(sizes.get(Length.EPIC).stream().allMatch(s -> s <= 25));
        assertTrue(average(sizes.get(Length.SHORT)) < average(sizes.get(Length.FULL)));
        assertTrue(average(sizes.get(Length.FULL)) < average(sizes.get(Length.EPIC)));
        assertTrue(sizes.get(Length.EPIC).stream().allMatch(s -> s >= 20));
    }

    private static long pickups(String area, String kind) {
        return DS1.locations().stream()
                .filter(l -> l.isFound() && Objects.equals(DS1.regions().get(l.region()).area(), area) && (kind == null || kind.equals(l.kind())))
                .count();
    }

    private static OrderArgs argsOf(Challenge challenge, String id) {
        return challenge.orders().stream().filter(o -> o.template().id().equals(id)).findFirst().map(o -> o.args()).orElse(null);
    }

    @Test
    void draws_no_order_that_asks_nothing() {
        for (var challenge : sample()) {
            var classLevel = DS1.classes().get(challenge.setup().startingClass()).level();
            var curseArgs = argsOf(challenge, "accumulated-curse");
            List<String> curse = curseArgs == null ? List.of() : curseArgs.list("restrictions");
            if (challenge.setup().levelCap() == classLevel) {
                assertNull(argsOf(challenge, "earned-levels"));
                assertFalse(curse.contains("no-level-ups"));
            }

            var livesArgs = argsOf(challenge, "run-lives");
            var deaths = livesArgs == null ? null : livesArgs.number("deaths");
            var forbiddenArgs = argsOf(challenge, "forbidden-area");
            var forbidden = forbiddenArgs == null ? null : forbiddenArgs.text("area");
            Set<Integer> noEstus = challenge.orders().stream()
                    .filter(o -> o.template().id().equals("chapter-restriction") && "no-estus".equals(o.args().text("restriction")))
                    .map(o -> o.chapter())
                    .collect(Collectors.toCollection(HashSet::new));
            for (var order : challenge.orders()) {
                var id = order.template().id();
                var args = order.args();
                var area = args.text("area");
                var bossId = args.text("boss");
                var boss = bossId == null ? null : DS1.bosses().get(bossId);
                if (forbidden != null && !id.equals("forbidden-area")) {
                    assertNotEquals(forbidden, area);
                    if (boss != null) assertNotEquals(forbidden, DS1.regions().get(boss.region()).area());
                }

                if (id.equals("dry-fight")) assertFalse(noEstus.contains(order.chapter()));

                // The element follows the boss's defenses, never the first boss of the run.
                if (id.equals("exploit-weakness") || id.equals("against-the-grain")) {
                    assertNotEquals("asylum-demon", boss.id());
                    var defenses = Combat.elementalDefenses(boss).stream().map(d -> d.element().id()).toList();
                    assertEquals(id.equals("exploit-weakness") ? defenses.get(0) : defenses.get(defenses.size() - 1), args.text("element"));
                }

                if (id.equals("wear-what-you-find")) assertTrue(pickups(area, "armor") > 0);
                if (id.equals("nothing-from-the-ground")) assertTrue(pickups(area, null) >= 5);
                if (id.equals("boss-before-bell")) assertFalse(List.of("asylum-demon", "bell-gargoyles").contains(args.text("boss")));
                if (id.equals("counted-attempts") && deaths != null) assertTrue(args.number("attempts") - 1 < deaths);
                if (id.equals("chapter-restriction")) assertFalse(curse.contains(args.text("restriction")));
            }
        }
    }

    private static final List<String> LORDS = List.of(
            "Lord Soul (Nito)", "Bequeathed Lord Soul Shard (Seath)", "Bequeathed Lord Soul Shard (Four Kings)", "Lord Soul (Bed of Chaos)");

    @Test
    void cuts_the_run_at_the_asylum_the_bells_the_lordvessel_each_lord_soul_and_the_kiln() {
        assertEquals(
                List.of(
                        "boss-asylum-demon", "bell-undead-parish", "both-bells", "lordvessel-placed", "lord-souls-placed-1",
                        "lord-souls-placed-4", "lord-souls-placed-3", "lord-souls-placed-2", "boss-gwyn-lord-of-cinder"),
                Chapters.of(DS1, LORDS).stream().map(Chapter::goal).toList());
    }

    private static List<String> allBosses(List<Chapter> chapters) {
        return chapters.stream().flatMap(c -> c.bosses().stream()).toList();
    }

    // Derived from the data set, not typed in: what each goal cannot be reached without.
    @Test
    void puts_each_area_and_boss_where_the_run_meets_it() {
        var chapters = Chapters.of(DS1, LORDS);
        assertEquals(List.of("northern-undead-asylum"), chapters.get(0).areas());
        assertTrue(chapters.get(1).requiredAreas().contains("undead-burg"));
        assertTrue(chapters.get(1).requiredAreas().contains("undead-parish"));
        assertTrue(chapters.get(2).areas().contains("blighttown"));
        assertTrue(chapters.get(2).areas().contains("quelaags-domain"));
        assertTrue(chapters.get(3).areas().contains("sens-fortress"));
        assertTrue(chapters.get(3).areas().contains("anor-londo"));
        assertTrue(chapters.get(3).areas().contains("painted-world-of-ariamis"));
        assertEquals(List.of("the-catacombs", "tomb-of-the-giants"), chapters.get(4).areas());
        assertTrue(chapters.get(5).areas().contains("the-dukes-archives"));
        assertEquals(List.of("four-kings", "great-grey-wolf-sif"), chapters.get(6).bosses());
        assertEquals(List.of("kiln-of-the-first-flame"), chapters.get(8).areas());
        assertEquals(sortedAll(DS1.bosses().keySet()), sortedAll(allBosses(chapters)));
    }

    private static int widest(List<Chapter> chapters) {
        return chapters.stream().mapToInt(c -> c.areas().size()).max().orElseThrow();
    }

    private static int chapterOf(List<Chapter> chapters, String area) {
        return IntStream.range(0, chapters.size()).filter(k -> chapters.get(k).areas().contains(area)).findFirst().orElseThrow();
    }

    // Every detour in its first chapter gave chapters of 1 to 9 areas, the same for every seed.
    @Test
    void draws_detours_among_their_chapters_balancing_the_chapters_and_keeping_the_way_in_order() {
        var first = Chapters.of(DS1, LORDS);
        var drawn = IntStream.range(0, 30).mapToObj(i -> Chapters.of(DS1, LORDS, new SeededRandom("balance-" + i))).toList();
        assertTrue(drawn.stream().mapToInt(GeneratorTest::widest).average().orElseThrow() < widest(first));
        assertTrue(drawn.stream().map(cs -> cs.stream().map(c -> String.join(",", c.areas())).collect(Collectors.joining("/"))).distinct().count() > 5);
        for (var chapters : drawn) {
            assertEquals(sortedAll(DS1.bosses().keySet()), sortedAll(allBosses(chapters)));

            // What each goal needs never moves; a detour never comes before its way in, nor after the Lord Souls.
            for (var k = 0; k < first.size(); k++) assertEquals(first.get(k).requiredAreas(), chapters.get(k).requiredAreas());
            assertTrue(chapterOf(chapters, "depths") <= chapterOf(chapters, "blighttown"));
            assertTrue(chapterOf(chapters, "ash-lake") >= chapterOf(chapters, "the-great-hollow"));
            assertEquals(List.of("kiln-of-the-first-flame"), chapters.get(chapters.size() - 1).areas());
        }
    }

    @Test
    void keeps_every_offset_within_two_steps_rising_for_the_rising_curve() {
        for (var curve : Curves.ALL) {
            var offsets = Curves.offsets(curve, 9, Difficulty.MEDIUM, new SeededRandom(curve.label()));
            assertEquals(9, offsets.size());
            assertTrue(offsets.stream().allMatch(o -> Math.abs(o) <= 2));
            if (curve == Curve.CONSTANT) assertTrue(offsets.stream().allMatch(o -> o == 0));
            for (var k = 1; k < 9; k++) {
                if (curve == Curve.RISING) assertTrue(offsets.get(k) >= offsets.get(k - 1));
                if (curve == Curve.ROLLERCOASTER) assertNotEquals(offsets.get(k), offsets.get(k - 1));
            }

            if (curve == Curve.PEAKS) assertEquals(2, offsets.stream().filter(o -> o == 2).count());
        }
    }

    @Test
    void turns_peaks_into_valleys_at_extreme_and_never_ends_below_the_chosen_level() {
        var edges = List.of(Difficulty.EASY, Difficulty.EXTREME);
        for (var i = 0; i < 50; i++) {
            var valleys = Curves.offsets(Curve.PEAKS, 9, Difficulty.EXTREME, new SeededRandom("valley-" + i));
            assertEquals(2, valleys.stream().filter(o -> o == -1).count());
            assertTrue(valleys.stream().filter(o -> o != -1).allMatch(o -> o == 0));

            // The rollercoaster changes level at the edges too, but for the last step back up.
            for (var level : edges) {
                var ride = Curves.offsets(Curve.ROLLERCOASTER, 9, level, new SeededRandom("ride-" + i)).stream().map(o -> Curves.shifted(level, o)).toList();
                for (var k = 1; k < 8; k++) assertNotEquals(ride.get(k), ride.get(k - 1));
            }

            for (var curve : Curves.ALL) {
                for (var chapters : List.of(4, 9)) {
                    for (var level : edges) {
                        var offsets = Curves.offsets(curve, chapters, level, new SeededRandom("end-" + i));
                        assertTrue(offsets.get(offsets.size() - 1) >= 0);
                    }
                }
            }
        }
    }

    @Test
    void holds_a_shifted_difficulty_within_easy_and_extreme() {
        assertEquals(Difficulty.EASY, Curves.shifted(Difficulty.EASY, -1));
        assertEquals(Difficulty.HARD, Curves.shifted(Difficulty.MEDIUM, 1));
        assertEquals(Difficulty.EXTREME, Curves.shifted(Difficulty.HARD, 2));
    }

    @Test
    void gives_a_chapter_on_a_peak_harder_numbers_than_the_rest() {
        var challenge = Generator.generate(DS1, config("peaks", Difficulty.EASY, Length.EPIC).withCurve(Curve.PEAKS));
        assertEquals(2, challenge.chapters().stream().filter(c -> c.difficulty() == Difficulty.HARD).count());
        assertEquals(7, challenge.chapters().stream().filter(c -> c.difficulty() == Difficulty.EASY).count());
    }

    private static List<Challenge> budget(Difficulty difficulty) {
        return generated(12, "budget", i -> config("budget-" + i, difficulty, Length.FULL).withCurve(Curve.CONSTANT));
    }

    private static double meanWeight(List<Challenge> challenges) {
        return challenges.stream().flatMap(c -> c.orders().stream()).mapToInt(o -> o.template().weight().difficulty()).average().orElseThrow();
    }

    @Test
    void gives_the_easy_level_light_orders_and_curses_and_the_extreme_level_heavy_ones() {
        var easy = budget(Difficulty.EASY);
        assertTrue(meanWeight(easy) < meanWeight(budget(Difficulty.EXTREME)));
        for (var challenge : easy) {
            var curseArgs = argsOf(challenge, "accumulated-curse");
            List<String> curse = curseArgs == null ? List.of() : curseArgs.list("restrictions");
            for (var id : curse) assertEquals(Tier.LIGHT, Restrictions.find(id).tier());
            for (var order : challenge.orders()) {
                if (order.template().id().equals("chapter-restriction")) {
                    assertEquals(Tier.LIGHT, Restrictions.find(order.args().text("restriction")).tier());
                }
            }
        }

        assertTrue(easy.stream().flatMap(c -> c.orders().stream()).mapToInt(o -> o.template().weight().friction()).average().orElseThrow() <= 1);
    }

    private static List<Integer> counts(Challenge challenge) {
        List<Integer> counts = new ArrayList<>();
        for (var order : challenge.orders()) {
            for (var entry : order.template().params().entrySet()) {
                if (entry.getValue().kind() != ParamKind.COUNT) continue;
                var number = order.args().number(entry.getKey());
                counts.add(number == null ? 0 : number);
            }
        }

        return counts;
    }

    private static List<String> curseOf(Challenge challenge) {
        var curse = argsOf(challenge, "accumulated-curse");
        return curse == null ? List.of() : curse.list("restrictions");
    }

    @Test
    void gives_every_player_the_same_orders_with_numbers_that_ease_with_the_difficulty() {
        for (var seed : List.of("group-1", "group-2", "group-3", "group-4")) {
            var group = Generator.generateGroup(DS1, config(seed, Difficulty.MEDIUM, Length.FULL), Curves.DIFFICULTIES);
            var extreme = group.get(3);

            // The hardest player gets exactly the solo challenge.
            assertEquals(Manual.render(DS1, Generator.generate(DS1, config(seed, Difficulty.EXTREME, Length.FULL))), Manual.render(DS1, extreme));
            var ids = extreme.orders().stream().map(o -> o.template().id()).toList();
            for (var challenge : group) {
                assertEquals(extreme.setup().startingClass(), challenge.setup().startingClass());
                assertEquals(ids, challenge.orders().stream().map(o -> o.template().id()).toList());
                assertEquals(Verdict.COMFORTABLE, Validator.validate(DS1, challenge.setup(), challenge.orders()).verdict());
            }

            for (var i = 0; i < 3; i++) {
                var easier = group.get(i);
                var harder = group.get(i + 1);
                assertTrue(easier.setup().levelCap() >= harder.setup().levelCap());
                var easierCounts = counts(easier);
                var harderCounts = counts(harder);
                for (var k = 0; k < Math.min(easierCounts.size(), harderCounts.size()); k++) assertTrue(easierCounts.get(k) >= harderCounts.get(k));
                assertTrue(curseOf(harder).containsAll(curseOf(easier)));
            }
        }
    }

    @Test
    void refuses_an_empty_group() {
        assertThrows(IllegalArgumentException.class, () -> Generator.generateGroup(DS1, config("x", Difficulty.MEDIUM, Length.SHORT), List.of()));
    }

    @Test
    void says_do_not_die_for_no_deaths_and_defines_what_a_death_is() {
        var lives = generatedOrder("run-lives", args("deaths", 0));
        assertTrue(Manual.orderText(DS1, lives).startsWith("Do not die for the whole run."));
        assertTrue(Manual.orderText(DS1, generatedOrder("run-lives", args("deaths", 1))).startsWith("You have 1 death "));
        var challenge = Generator.generate(DS1, config("manual", Difficulty.MEDIUM, Length.SHORT));
        var manual = Manual.render(DS1, new Challenge(
                challenge.config(), challenge.code(), challenge.dataVersion(), challenge.setup(), challenge.curve(), challenge.chapters(), List.of(lives)));
        assertTrue(manual.contains("## Definitions"));
        assertTrue(manual.contains("- **Death:**"));
        assertFalse(manual.contains("- **Attempt:**"));
    }

    @Test
    void lays_the_journey_out_in_chapters_numbering_rules_across_the_manual() {
        var challenge = Generator.generate(DS1, config("chapters", Difficulty.HARD, Length.EPIC));
        var manual = Manual.render(DS1, challenge);
        assertTrue(manual.contains("## Rules of the journey\n\n1. **"));
        assertTrue(manual.contains("## Chapter 1: The Asylum"));
        assertTrue(Pattern.compile("## Chapter \\d: Lord Soul: Nito\\n\\nUntil you place the Lord Soul \\(Nito\\)").matcher(manual).find());
        List<Integer> numbers = new ArrayList<>();
        var match = Pattern.compile("^(\\d+)\\. \\*\\*", Pattern.MULTILINE).matcher(manual);
        while (match.find()) numbers.add(Integer.parseInt(match.group(1)));
        assertEquals(IntStream.rangeClosed(1, numbers.size()).boxed().toList(), numbers);
        assertEquals(challenge.orders().size(), numbers.size());
    }

    @Test
    void groups_a_short_journey_in_four_acts_with_rules_in_each() {
        for (var seed : List.of("act-1", "act-2", "act-3")) {
            var challenge = Generator.generate(DS1, config(seed, Difficulty.MEDIUM, Length.SHORT));
            assertEquals(List.of(2, 2, 4, 1), challenge.chapters().stream().map(c -> c.goals().size()).toList());
            assertTrue(challenge.chapters().get(0).areas().contains("northern-undead-asylum"));
            for (var k : List.of(0, 1, 2, 3)) {
                assertTrue(challenge.orders().stream().anyMatch(o -> k.equals(o.chapter())), "act " + k);
            }

            var manual = Manual.render(DS1, challenge);
            assertTrue(manual.contains("## Act 1: The first bell"));
            assertTrue(manual.contains("## Act 3: The Lord Souls"));
            assertFalse(manual.contains("## Chapter"));
        }
    }

    @Test
    void writes_a_chapter_restriction_as_the_chapters_stretch() {
        assertEquals(
                "From the moment you ring the bell of the Undead Parish until you have rung both bells: do not roll.",
                Manual.orderText(DS1, generatedOrder("chapter-restriction", args("from", "bell-undead-parish", "until", "both-bells", "restriction", "no-rolling"))));
    }

    @Test
    void writes_milestones_as_what_the_player_does() {
        var halberd = DS1.locations().stream().filter(l -> l.isFound() && l.item().equals("Halberd")).findFirst().orElseThrow();
        assertTrue(Manual.orderText(DS1, generatedOrder("assigned-weapon", args("from", "boss-taurus-demon", "until", "both-bells", "location", halberd.name())))
                .startsWith("From the moment you defeat Taurus Demon until you have rung both bells: your weapon is the Halberd"));
    }

    private static String loc(String region, String item, String category, boolean found) {
        return "{ \"name\": \"%s: %s\", \"region\": \"%s\", \"item\": \"%s\", \"count\": 1, \"category\": \"%s\", \"mandatory\": false, \"found\": %s }"
                .formatted(region, item, region, item, category, found);
    }

    private static String weaponRow(int id, String name, String category) {
        return """
                { "id": %d, "name": "%s", "category": "%s", "melee": true, "hands": { "both": true },
                  "req": { "str": 10, "dex": 0, "int": 0, "fth": 0 }, "baseDamage": { "phys": 100, "magic": 0, "fire": 0, "thunder": 0 } }"""
                .formatted(id, name, category);
    }

    /** parish, deep (wild), grove (woods). The woods have no other entrance. The Wanderer sells in the parish and in the wild; the Hermit sells only in the wild. */
    private static final World CUT_OFF = new Fixtures.Data()
            .meta("{ \"start\": \"asylum\", \"goal\": \"Gwyn Defeated\" }")
            .regions("""
                    [
                      { "id": "asylum", "name": "asylum", "area": "asylum", "mandatory": false },
                      { "id": "parish", "name": "parish", "area": "parish", "mandatory": false },
                      { "id": "stall", "name": "stall", "area": "parish", "mandatory": false },
                      { "id": "blight", "name": "blight", "area": "blight", "mandatory": false },
                      { "id": "altar", "name": "altar", "area": "altar", "mandatory": false },
                      { "id": "kiln", "name": "kiln", "area": "kiln", "mandatory": false },
                      { "id": "deep", "name": "deep", "area": "wild", "mandatory": false },
                      { "id": "grove", "name": "grove", "area": "woods", "mandatory": false }
                    ]""")
            .entrances("""
                    [
                      { "from": "asylum", "to": "parish", "requires": true },
                      { "from": "parish", "to": "stall", "requires": true },
                      { "from": "parish", "to": "blight", "requires": { "has": "Bell of Awakening #1" } },
                      { "from": "blight", "to": "altar", "requires": { "has": "Bell of Awakening #2" } },
                      { "from": "altar", "to": "kiln", "requires": { "has": "Lordvessel" } },
                      { "from": "parish", "to": "deep", "requires": true },
                      { "from": "deep", "to": "grove", "requires": true }
                    ]""")
            .locations("[" + String.join(",",
                    loc("asylum", "Asylum Demon Defeated", "BOSS", false),
                    loc("parish", "Bell of Awakening #1", "EVENT", false),
                    loc("parish", "Club", "CORPSE_ITEM", true),
                    loc("parish", "Shortsword", "CORPSE_ITEM", true),
                    loc("blight", "Bell of Awakening #2", "EVENT", false),
                    loc("altar", "Lordvessel", "EVENT", false),
                    loc("kiln", "Gwyn Defeated", "BOSS", false),
                    loc("stall", "Moss", "SHOP_ITEM", false),
                    loc("deep", "Moss", "SHOP_ITEM", false)) + "]")
            .classes("""
                    { "classes": [{ "name": "Knight", "level": 5, "stats": { "strength": 12, "dexterity": 10, "intelligence": 8, "faith": 8, "attunement": 10 } }],
                      "gifts": [{ "row": 1, "items": ["(none)"] }] }""")
            .bosses("""
                    [{ "id": "asylum-demon", "name": "Asylum Demon", "region": "asylum" }, { "id": "gwyn", "name": "Gwyn", "region": "kiln" }]""")
            .merchants("""
                    [{ "id": "wanderer", "name": "Wanderer", "regions": ["stall", "deep"] }, { "id": "hermit", "name": "Hermit", "regions": ["deep"] }]""")
            .milestones("""
                    [
                      { "id": "boss-asylum-demon", "name": "Asylum", "kind": "boss", "requires": { "has": "Asylum Demon Defeated" } },
                      { "id": "bell-undead-parish", "name": "First bell", "kind": "bell", "requires": { "has": "Bell of Awakening #1" } },
                      { "id": "both-bells", "name": "Both bells", "kind": "bell", "requires": { "all": [{ "has": "Bell of Awakening #1" }, { "has": "Bell of Awakening #2" }] } },
                      { "id": "lordvessel-obtained", "name": "Lordvessel", "kind": "item", "requires": { "has": "Lordvessel" } },
                      { "id": "lordvessel-placed", "name": "Lordvessel placed", "kind": "item", "requires": { "has": "Lordvessel" } },
                      { "id": "kiln-open", "name": "Kiln", "kind": "area", "requires": { "region": "kiln" } },
                      { "id": "gwyn-dead", "name": "Gwyn", "kind": "boss", "requires": { "has": "Gwyn Defeated" } }
                    ]""")
            .weapons("[" + weaponRow(1, "Club", "hammer") + "," + weaponRow(2, "Shortsword", "sword") + "]")
            .world();

    @Test
    void skips_the_draw_when_the_area_would_cut_off_an_order_already_chosen() {
        // no-bonfire is weight-only, so the draw loop would have kept it without validating the set. Closing the wild is the only way the
        // woods then fail, and that failure must happen here.
        var woods = List.of(order("no-bonfire", args("area", "woods")));
        assertTrue(Generator.forbiddenAreaCutsOff(CUT_OFF, args("area", "wild"), woods, List.of()));
        assertFalse(Generator.forbiddenAreaCutsOff(CUT_OFF, args("area", "blight"), woods, List.of()));
        assertTrue(Generator.forbiddenAreaCutsOff(CUT_OFF, args("area", "wild"), List.of(order("forbidden-area", args("area", "woods"))), List.of()));
        assertTrue(Generator.forbiddenAreaCutsOff(CUT_OFF, args("area", "wild"), List.of(order("closed-merchant", args("merchant", "hermit"))), List.of()));

        // The parish stall is still open, so the Wanderer is not a reason to skip the draw.
        assertFalse(Generator.forbiddenAreaCutsOff(CUT_OFF, args("area", "wild"), List.of(order("closed-merchant", args("merchant", "wanderer"))), List.of()));
    }
}
