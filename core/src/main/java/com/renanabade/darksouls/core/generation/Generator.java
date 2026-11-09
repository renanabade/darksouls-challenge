package com.renanabade.darksouls.core.generation;

import com.renanabade.darksouls.core.Reachability;
import com.renanabade.darksouls.core.Setup;
import com.renanabade.darksouls.core.StartingGift;
import com.renanabade.darksouls.core.Validator;
import com.renanabade.darksouls.core.Verdict;
import com.renanabade.darksouls.core.World;
import com.renanabade.darksouls.core.orders.Catalog;
import com.renanabade.darksouls.core.orders.Difficulty;
import com.renanabade.darksouls.core.orders.IntRange;
import com.renanabade.darksouls.core.orders.Mode;
import com.renanabade.darksouls.core.orders.OrderArgs;
import com.renanabade.darksouls.core.orders.OrderInstance;
import com.renanabade.darksouls.core.orders.OrderTemplate;
import com.renanabade.darksouls.core.orders.ParamKind;
import com.renanabade.darksouls.core.orders.ArgValue;
import com.renanabade.darksouls.core.orders.Validation;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;

/**
 * Generates a static challenge as a journey in chapters: the run is cut at its milestones (the Asylum, the bells, the Lordvessel,
 * each Lord Soul in a drawn order, the Kiln); the journey gets a few rules for the whole run, and each chapter its own rules about
 * its areas and bosses, at the chapter's place on the difficulty curve. Orders are added one at a time, in a shuffled order, and
 * kept only when they fit the budget and the whole set still validates as comfortable. Same config and data, same challenge.
 */
public final class Generator {
    /** Version of the drawing rules; part of the seed, so a change in the rules never reuses an old draw. */
    public static final String VERSION = "8";

    private static final String ASYLUM = "boss-asylum-demon";

    /** The Asylum has one area and one boss. */
    private static final int ASYLUM_MAX = 1;

    /** Fresh parameters tried for an order before it is left out. */
    private static final int ATTEMPTS = 6;

    private static final double FRICTION_PER_ORDER = 0.75;

    private static final List<String> TARGET_PARAMS = List.of("area", "boss", "restriction");

    /** Most times an order is drawn in one run: these repeat the same chore, area after area. */
    private static final Map<String, Integer> RUN_CAPS = Map.of("errand", 2, "every-chest", 1, "counted-attempts", 3);

    /** Rules about how one fight is fought: together they would crowd out every other rule of a run. */
    private static final List<String> FIGHT_RULES = List.of("dry-fight", "exploit-weakness", "against-the-grain");

    private static final int FIGHT_RULES_CAP = 3;

    /** Orders that rule the whole journey; every other static order belongs to a chapter. */
    private static final Set<String> JOURNEY_TEMPLATES = Set.of(
            "closed-merchant", "run-lives", "accumulated-curse", "phase-swap", "forbidden-area", "earned-levels", "earned-upgrades");

    /**
     * Weight-only orders that no other order contradicts: they never make a set impossible, so the generator adds them without
     * validating the whole set again (a journey validates dozens of times). "Wear what you find" is left out: it contradicts "no
     * armor" and "nothing from the ground". The challenge is validated once more as a whole before it is handed out.
     */
    private static final Set<String> WEIGHT_ONLY_ALWAYS_FITS = Set.of(
            "no-bonfire", "one-bonfire", "dry-fight", "counted-attempts", "run-lives", "earned-upgrades");

    private static final class Section {
        final DrawContext context;
        int target;
        final List<OrderTemplate> pool;

        Section(DrawContext context, int target, List<OrderTemplate> pool) {
            this.context = context;
            this.target = target;
            this.pool = pool;
        }
    }

    private record Act(Chapter chapter, List<String> goals) {}

    private Generator() {}

    /** Soul level cap per difficulty, to tune by playing; never below the class's level. */
    private static IntRange levelCaps(Difficulty difficulty) {
        return switch (difficulty) {
            case EASY -> new IntRange(60, 90);
            case MEDIUM -> new IntRange(35, 55);
            case HARD -> new IntRange(18, 30);
            case EXTREME -> new IntRange(1, 12);
        };
    }

    /** How many orders a journey has: rules of the whole journey. A short challenge stays a handful of good rules; an epic one has rules for every area of the run. */
    private static IntRange journeyOrders(Length length) {
        return switch (length) {
            case SHORT -> new IntRange(2, 3);
            case FULL -> new IntRange(3, 5);
            case EPIC -> new IntRange(4, 6);
        };
    }

    /** How many orders each chapter has. */
    private static IntRange chapterOrders(Length length) {
        return switch (length) {
            case SHORT -> new IntRange(1, 2);
            case FULL -> new IntRange(1, 3);
            case EPIC -> new IntRange(3, 5);
        };
    }

    /**
     * Most rules a manual holds, the order of the Lord Souls included: past this, a journey reads as a list of chores. Chapters with
     * the most rules give one up first, the later chapter on a tie.
     */
    private static int maxOrders(Length length) {
        return switch (length) {
            case SHORT -> 10;
            case FULL -> 18;
            case EPIC -> 25;
        };
    }

    /**
     * A short journey has too few rules for nine chapters, most of which were left empty, so it groups them in four acts: the Asylum
     * and the first bell, the second bell and the Lordvessel, the Lord Souls, the Kiln. The sizes are counts of chapters, in order.
     */
    private static int[] acts(Length length) {
        return length == Length.SHORT ? new int[] {2, 2, 4, 1} : null;
    }

    /** Orders a chapter can only take in one place: the chapter of the first bell, or one with a milestone to start after. */
    private static boolean fitsChapter(String templateId, int k, List<String> goals) {
        return switch (templateId) {
            case "boss-before-bell" -> goals.contains("bell-undead-parish");
            case "assigned-weapon", "chapter-restriction" -> k > 0;
            default -> true;
        };
    }

    /**
     * The budget. Difficulty: the average weight an order may have, so an easy chapter is mostly light orders; hard and extreme have
     * no ceiling. Friction (time, searching, repetition) has a ceiling per order, because no profile enjoys a challenge made of chores.
     */
    private static double difficultyPerOrder(Difficulty difficulty) {
        return switch (difficulty) {
            case EASY -> 1.5;
            case MEDIUM -> 2;
            default -> Double.POSITIVE_INFINITY;
        };
    }

    /**
     * How the candidate orders are shuffled: heavier orders come first more often as the difficulty grows (weight raised to this
     * power), so a tryhard gets the heavy orders without always getting the same ones.
     */
    private static double weightBias(Difficulty difficulty) {
        return switch (difficulty) {
            case EASY -> -1;
            case MEDIUM -> 0;
            case HARD -> 1;
            case EXTREME -> 2;
        };
    }

    public static Challenge generate(World world, GeneratorConfig config) {
        var rng = new SeededRandom(ChallengeCode.seedNumber(config.seed()) + "|" + world.dataVersion() + "|" + VERSION);
        var setup = drawSetup(world, config, rng);
        var domains = Draw.domainsOf(world);
        var curve = config.curve() != null ? config.curve() : rng.pick(Curves.ALL);
        var startingClass = setup.startingClass() == null ? null : world.classes().get(setup.startingClass());
        var levelsLocked = setup.levelCap() <= (startingClass == null ? 1 : startingClass.level());

        // The Lord Souls' order is the backbone of the later chapters, so it is drawn first and always kept.
        var lordTemplate = Catalog.get("lord-order");
        OrderInstance lordOrder = null;
        for (var attempt = 0; attempt < ATTEMPTS * 4 && lordOrder == null; attempt++) {
            var candidate = new OrderInstance(lordTemplate, new OrderArgs().put("order", rng.shuffle(domains.lordSouls())));
            if (Validator.validate(world, setup, List.of(candidate)).verdict() == Verdict.COMFORTABLE) lordOrder = candidate;
        }

        if (lordOrder == null) throw new IllegalStateException("no order of the Lord Souls validates for " + config.seed());

        var chapters = actsOf(Chapters.of(world, lordOrder.args().list("order"), rng), acts(config.length()));
        var offsets = Curves.offsets(curve, chapters.size(), config.difficulty(), rng);
        List<ChapterPlan> plans = new ArrayList<>();
        for (var k = 0; k < chapters.size(); k++) {
            var act = chapters.get(k);
            plans.add(new ChapterPlan(
                    act.chapter().goal(),
                    act.goals(),
                    act.chapter().areas(),
                    act.chapter().bosses(),
                    offsets.get(k),
                    Curves.shifted(config.difficulty(), offsets.get(k))));
        }

        var statics = Catalog.ALL.stream()
                .filter(t -> t.staticValidation() != null && !t.optIn() && !t.id().equals("lord-order"))
                .toList();
        var journeyRange = journeyOrders(config.length());
        List<Section> sections = new ArrayList<>();
        sections.add(new Section(
                new DrawContext(config.difficulty(), levelsLocked),
                rng.nextInt(journeyRange.min(), journeyRange.max()),
                statics.stream().filter(t -> JOURNEY_TEMPLATES.contains(t.id())).toList()));
        var chapterRange = chapterOrders(config.length());
        List<String> areasSoFar = new ArrayList<>();
        for (var k = 0; k < chapters.size(); k++) {
            var act = chapters.get(k);
            var chapter = act.chapter();
            var index = k;
            areasSoFar.addAll(chapter.areas());
            var target = Math.min(
                    rng.nextInt(chapterRange.min(), chapterRange.max()),
                    chapter.goal().equals(ASYLUM) ? ASYLUM_MAX : Integer.MAX_VALUE);
            sections.add(new Section(
                    new DrawContext(plans.get(k).difficulty(), levelsLocked, new ChapterContext(
                            k == 0 ? chapter.goal() : chapters.get(k - 1).chapter().goal(),
                            chapter.goal(),
                            chapter.areas(),
                            chapter.requiredAreas(),
                            chapter.bosses(),
                            List.copyOf(areasSoFar))),
                    target,
                    statics.stream().filter(t -> !JOURNEY_TEMPLATES.contains(t.id()) && fitsChapter(t.id(), index, act.goals())).toList()));
        }

        // The Lord Souls' order is one of the rules.
        for (var total = 1 + targets(sections); total > maxOrders(config.length()); total--) {
            var largest = sections.get(0);
            for (var section : sections.subList(1, sections.size())) {
                if (section.target >= largest.target) largest = section;
            }

            largest.target--;
        }

        var frictionBudget = FRICTION_PER_ORDER * targets(sections);

        List<OrderInstance> chosen = new ArrayList<>();
        chosen.add(lordOrder);
        double friction = lordTemplate.weight().friction();
        var held = Validator.startingItems(world, setup);
        Map<String, Integer> uses = new HashMap<>();

        // An area or a boss may gather several rules, but never the same rule twice.
        Set<String> usedTargets = new HashSet<>();
        for (var index = 0; index < sections.size(); index++) {
            var section = sections.get(index);
            Integer chapter = index == 0 ? null : index - 1;
            var difficulty = section.context.difficulty();
            var budget = section.target * difficultyPerOrder(difficulty);
            double spent = 0;
            var added = 0;

            // Orders already in the journey come later more often, so chapters do not repeat one another.
            var candidates = rng.weightedShuffle(
                    section.pool,
                    t -> StrictMath.pow(t.weight().difficulty(), weightBias(difficulty)) / (1 + uses.getOrDefault(t.id(), 0)));
            for (var template : candidates) {
                if (added >= section.target) break;
                if (uses.getOrDefault(template.id(), 0) >= RUN_CAPS.getOrDefault(template.id(), Integer.MAX_VALUE)) continue;
                if (FIGHT_RULES.contains(template.id()) && fightRulesUsed(uses) >= FIGHT_RULES_CAP) continue;

                // Leave room for the orders still to come, at the lightest weight.
                if (spent + template.weight().difficulty() + (section.target - added - 1) > budget) continue;
                if (friction + template.weight().friction() > frictionBudget) continue;
                for (var attempt = 0; attempt < ATTEMPTS; attempt++) {
                    var args = Draw.args(template, domains, section.context, rng);
                    if (args == null) break;
                    var targets = targetsOf(args).stream().map(t -> template.id() + "|" + t).toList();
                    if (targets.stream().anyMatch(usedTargets::contains)) continue;
                    if (pointless(world, template, args, chapter, chosen, held)) continue;

                    // A forbidden area drawn after another order can close the only way to that order. Try another area. The
                    // validation at the end must not be what rejects the draw.
                    if (template.id().equals("forbidden-area") && forbiddenAreaCutsOff(world, args, chosen, held)) continue;
                    List<OrderInstance> next = new ArrayList<>(chosen);
                    next.add(new OrderInstance(template, args, chapter));
                    if (!WEIGHT_ONLY_ALWAYS_FITS.contains(template.id()) || template.staticValidation() != Validation.WEIGHT_ONLY) {
                        var result = Validator.validate(world, setup, next);
                        if (result.verdict() != Verdict.COMFORTABLE || !result.complete()) continue;
                    }

                    chosen = next;
                    spent += template.weight().difficulty();
                    friction += template.weight().friction();
                    added++;
                    uses.merge(template.id(), 1, Integer::sum);
                    usedTargets.addAll(targets);
                    break;
                }
            }
        }

        return finish(world, config, ChallengeCode.encode(world, config), setup, curve, plans, chosen);
    }

    private static int targets(List<Section> sections) {
        var total = 0;
        for (var section : sections) total += section.target;
        return total;
    }

    private static int fightRulesUsed(Map<String, Integer> uses) {
        var total = 0;
        for (var id : FIGHT_RULES) total += uses.getOrDefault(id, 0);
        return total;
    }

    /**
     * One challenge for a group of players of different skill: the same seed gives everyone the same orders, chapters, curve, areas,
     * bosses, weapons, class and gift; only the numbers follow each player's difficulty. The structure is generated for the hardest
     * difficulty of the group, then eased for each player: each chapter keeps its offset on the curve from the player's own
     * difficulty. Every number is monotonic (a higher level cap, more deaths, attempts or points, fewer restrictions never make a run
     * impossible), so a structure possible for the hardest player is possible for all; each eased challenge is still validated. The
     * hardest player gets exactly the solo challenge. Returns one challenge per difficulty given, in the same order. The config's own
     * difficulty is not used.
     */
    public static List<Challenge> generateGroup(World world, GeneratorConfig config, List<Difficulty> difficulties) {
        if (difficulties.isEmpty()) throw new IllegalArgumentException("a group needs at least one difficulty");
        var solo = generate(world, config.withDifficulty(Collections.max(difficulties)));
        return difficulties.stream().map(difficulty -> ease(world, solo, difficulty)).toList();
    }

    private static boolean areaOpen(World world, String area, Set<String> reached, List<String> closed) {
        return !closed.contains(area) && (reached == null || world.regionsInArea(area).stream().anyMatch(reached::contains));
    }

    private static boolean bossOpen(World world, String id, Set<String> reached) {
        var boss = world.bosses().get(id);
        var region = boss == null ? null : boss.region();
        return region == null || region.isEmpty() || reached == null || reached.contains(region);
    }

    private static List<String> sortedUnion(List<String> a, List<String> b) {
        Set<String> union = new TreeSet<>(a);
        union.addAll(b);
        return new ArrayList<>(union);
    }

    /**
     * The chapters the player reads. An area forbidden for the run is left out, and so are the areas and bosses that can only be
     * reached through one, so the manual does not send the player somewhere the orders closed. An area "the other way" closes for a
     * chapter is only postponed: it and what lies past it come back in the next chapter with rules, so Darkroot Garden closed once
     * does not leave Sif with no Darkroot listed later.
     */
    public static List<ChapterPlan> reachableChapters(
            World world,
            List<ChapterPlan> chapters,
            List<? extends OrderInstance> orders,
            List<String> items) {
        var forbidden = forbiddenAreas(orders);
        var open = forbidden.isEmpty() ? null : Reachability.withoutAreas(world, forbidden, items).regions();

        List<ChapterPlan> result = new ArrayList<>();
        List<String> postponedAreas = new ArrayList<>();
        List<String> postponedBosses = new ArrayList<>();
        for (var k = 0; k < chapters.size(); k++) {
            var chapter = chapters.get(k);
            Integer index = k;
            List<String> closed = new ArrayList<>(forbidden);
            for (var order : orders) {
                if (order.template().id().equals("the-other-way") && index.equals(order.chapter()) && order.args().text("area") != null) {
                    closed.add(order.args().text("area"));
                }
            }

            var reached = closed.isEmpty() ? null : Reachability.withoutAreas(world, closed, items).regions();
            var areas = sortedUnion(chapter.areas(), postponedAreas);
            var bosses = sortedUnion(chapter.bosses(), postponedBosses);
            result.add(chapter.withPlaces(
                    areas.stream().filter(a -> areaOpen(world, a, reached, closed)).toList(),
                    bosses.stream().filter(b -> bossOpen(world, b, reached)).toList()));

            // What this chapter's other way hides waits for a later chapter; what the run forbids never comes back. A chapter with
            // no rules is not printed, so what it would show goes on waiting.
            var printed = orders.stream().anyMatch(o -> index.equals(o.chapter()));
            postponedAreas = new ArrayList<>(areas.stream()
                    .filter(a -> !areaOpen(world, a, reached, closed) && areaOpen(world, a, open, forbidden))
                    .toList());
            postponedBosses = new ArrayList<>(bosses.stream()
                    .filter(b -> !bossOpen(world, b, reached) && bossOpen(world, b, open))
                    .toList());
            if (!printed) {
                postponedAreas.addAll(areas.stream().filter(a -> areaOpen(world, a, reached, closed) && !chapter.areas().contains(a)).toList());
                postponedBosses.addAll(bosses.stream().filter(b -> bossOpen(world, b, reached) && !chapter.bosses().contains(b)).toList());
            }
        }

        return result;
    }

    /**
     * True when closing this area would leave an order already drawn with nowhere to go. A forbidden area already drawn is judged
     * without its own regions: closing that area is the order. A merchant stays when any of their shops can still be reached.
     */
    public static boolean forbiddenAreaCutsOff(World world, OrderArgs args, List<? extends OrderInstance> chosen, List<String> items) {
        var area = args.text("area");
        if (area == null) return false;
        List<String> areas = new ArrayList<>(forbiddenAreas(chosen));
        areas.add(area);
        var reached = Reachability.withoutAreas(world, areas, items).regions();
        for (var order : chosen) {
            if (!order.template().id().equals("forbidden-area")) {
                if (Validator.unreachableTarget(world, order.args(), reached) != null) return true;
                continue;
            }

            var own = order.args().text("area");
            if (own == null) continue;
            var others = areas.stream().filter(id -> !id.equals(own)).toList();
            if (!others.isEmpty()
                    && Validator.unreachableTarget(world, order.args(), Reachability.withoutAreas(world, others, items).regions()) != null) {
                return true;
            }
        }

        return false;
    }

    /** The challenge in manual order, with each order's automatic exceptions from one last validation. */
    private static Challenge finish(
            World world,
            GeneratorConfig config,
            String code,
            Setup setup,
            Curve curve,
            List<ChapterPlan> chapters,
            List<OrderInstance> orders) {
        List<OrderInstance> sorted = new ArrayList<>(orders);
        sorted.sort(Comparator
                .comparingInt((OrderInstance o) -> o.chapter() == null ? -1 : o.chapter())
                .thenComparingInt(o -> o.template().number()));
        var result = Validator.validate(world, setup, sorted);
        if (result.verdict() != Verdict.COMFORTABLE || !result.complete()) {
            throw new IllegalStateException("seed " + config.seed() + " does not validate: " + String.join("; ", result.problems()));
        }

        List<GeneratedOrder> generated = new ArrayList<>();
        for (var i = 0; i < sorted.size(); i++) {
            var order = sorted.get(i);
            generated.add(new GeneratedOrder(order.template(), order.args(), result.orders().get(i).exceptions(), order.chapter()));
        }

        return new Challenge(
                config,
                code,
                world.dataVersion(),
                setup,
                curve,
                reachableChapters(world, chapters, sorted, Validator.startingItems(world, setup)),
                generated);
    }

    private static List<String> forbiddenAreas(List<? extends OrderInstance> orders) {
        return orders.stream()
                .filter(o -> o.template().id().equals("forbidden-area"))
                .map(o -> o.args().text("area"))
                .filter(Objects::nonNull)
                .toList();
    }

    /** The areas, bosses and restrictions an order is about. */
    private static List<String> targetsOf(OrderArgs args) {
        return TARGET_PARAMS.stream().filter(name -> args.text(name) != null).map(name -> name + ":" + args.text(name)).toList();
    }

    /** The chapters grouped in acts of the given sizes, each act ending at its last chapter's goal. */
    private static List<Act> actsOf(List<Chapter> chapters, int[] sizes) {
        if (sizes == null) return chapters.stream().map(c -> new Act(c, List.of(c.goal()))).toList();
        var total = 0;
        for (var size : sizes) total += size;
        if (total != chapters.size()) throw new IllegalStateException("acts of " + total + " chapters for a journey of " + chapters.size());

        List<Act> acts = new ArrayList<>();
        var start = 0;
        for (var size : sizes) {
            var group = chapters.subList(start, start + size);
            start += size;
            Set<String> areas = new TreeSet<>();
            Set<String> required = new TreeSet<>();
            Set<String> bosses = new TreeSet<>();
            for (var chapter : group) {
                areas.addAll(chapter.areas());
                required.addAll(chapter.requiredAreas());
                bosses.addAll(chapter.bosses());
            }

            acts.add(new Act(
                    new Chapter(group.get(group.size() - 1).goal(), new ArrayList<>(areas), new ArrayList<>(required), new ArrayList<>(bosses)),
                    group.stream().map(Chapter::goal).toList()));
        }

        return acts;
    }

    /** The area an order sends the player into: its own, its boss's, or its pickup's. */
    private static String placeOf(World world, OrderArgs args) {
        var area = args.text("area");
        if (area != null) return area;
        var bossId = args.text("boss");
        var boss = bossId == null ? null : world.bosses().get(bossId);
        String region = boss != null ? boss.region() : null;
        if (region == null) {
            var name = args.text("location");
            for (var location : world.locations()) {
                if (location.name().equals(name)) {
                    region = location.region();
                    break;
                }
            }
        }

        if (region == null) return null;
        var known = world.regions().get(region);
        return known == null ? null : known.area();
    }

    /**
     * An order that would ask nothing on top of the others: attempts against a boss that the deaths of the whole run already limit
     * more tightly (every lost attempt is a death); a chapter restriction the curse already holds; an order about a place the journey
     * can no longer reach once its forbidden areas are closed; a fight without Estus in a chapter that already forbids Estus, or the
     * other way round.
     */
    private static boolean pointless(World world, OrderTemplate template, OrderArgs args, Integer chapter, List<OrderInstance> chosen, List<String> items) {
        var forbidden = forbiddenAreas(chosen);
        var place = placeOf(world, args);

        // One reach per distinct forbidden set, shared with the validator.
        if (!forbidden.isEmpty()
                && Validator.unreachableTarget(world, args, Reachability.withoutAreas(world, forbidden, items).regions()) != null) {
            return true;
        }

        // An area closed for the chapter (the other way) takes no other order of the chapter, and the other way round.
        if (place != null && chapter != null) {
            var isOtherWay = template.id().equals("the-other-way");
            for (var order : chosen) {
                if (Objects.equals(order.chapter(), chapter)
                        && order.template().id().equals("the-other-way") != isOtherWay
                        && place.equals(placeOf(world, order.args()))) {
                    return true;
                }
            }
        }

        switch (template.id()) {
            case "counted-attempts": {
                var journey = journey(chosen, "run-lives");
                var lives = journey == null ? null : journey.number("deaths");
                var attempts = args.number("attempts");
                return lives != null && attempts != null && attempts - 1 >= lives;
            }
            case "chapter-restriction": {
                var journey = journey(chosen, "accumulated-curse");
                var curse = journey == null ? null : journey.list("restrictions");
                var restriction = args.text("restriction");
                if (curse != null && restriction != null && curse.contains(restriction)) return true;
                return "no-estus".equals(restriction) && inChapter(chosen, chapter, "dry-fight", null);
            }
            case "dry-fight":
                return inChapter(chosen, chapter, "chapter-restriction", "no-estus");

            // Resting at one bonfire of an area asks nothing where no bonfire of it may be used, and the other way round.
            case "one-bonfire", "no-bonfire": {
                var other = template.id().equals("one-bonfire") ? "no-bonfire" : "one-bonfire";
                return chosen.stream().anyMatch(o -> o.template().id().equals(other) && Objects.equals(o.args().text("area"), args.text("area")));
            }
            default:
                return false;
        }
    }

    private static OrderArgs journey(List<OrderInstance> chosen, String id) {
        for (var order : chosen) {
            if (order.template().id().equals(id)) return order.args();
        }

        return null;
    }

    private static boolean inChapter(List<OrderInstance> chosen, Integer chapter, String id, String restriction) {
        return chosen.stream().anyMatch(o -> Objects.equals(o.chapter(), chapter)
                && o.template().id().equals(id)
                && (restriction == null || restriction.equals(o.args().text("restriction"))));
    }

    private static int rescale(int value, IntRange a, IntRange b) {
        var u = a.max() == a.min() ? 0.5 : (value - a.min()) / (double) (a.max() - a.min());
        return Curves.jsRound(b.min() + (u * (b.max() - b.min())));
    }

    /** The same challenge with each number moved to the same relative place in an easier range. */
    private static Challenge ease(World world, Challenge solo, Difficulty difficulty) {
        var from = solo.config().difficulty();
        var startingClass = solo.setup().startingClass() == null ? null : world.classes().get(solo.setup().startingClass());
        var classLevel = startingClass == null ? 1 : startingClass.level();
        var cap = solo.setup().levelCap() == null ? 0 : solo.setup().levelCap();
        int levelCap = solo.config().levelCap() != null
                ? solo.config().levelCap()
                : Math.max(classLevel, rescale(cap, levelCaps(from), levelCaps(difficulty)));
        var chapters = solo.chapters().stream().map(c -> c.withDifficulty(Curves.shifted(difficulty, c.offset()))).toList();

        List<OrderInstance> orders = new ArrayList<>();
        for (var order : solo.orders()) {
            var k = order.chapter();
            var levelFrom = k != null ? solo.chapters().get(k).difficulty() : from;
            var levelTo = k != null ? chapters.get(k).difficulty() : difficulty;
            var eased = order.args();
            for (var entry : order.template().params().entrySet()) {
                var name = entry.getKey();
                var kind = entry.getValue().kind();
                var count = order.args().number(name);
                if (kind == ParamKind.COUNT && count != null) {
                    eased = eased.with(name, new ArgValue.Number(rescale(
                            count,
                            Draw.rangeOf(order.template(), name, levelFrom),
                            Draw.rangeOf(order.template(), name, levelTo))));
                }

                var list = order.args().list(name);
                if (kind == ParamKind.RESTRICTION_LIST && list != null) {
                    eased = eased.with(name, new ArgValue.TextList(Draw.fitCurse(list, levelTo)));
                }
            }

            orders.add(new OrderInstance(order.template(), eased, order.chapter()));
        }

        return finish(world, solo.config().withDifficulty(difficulty), solo.code(), solo.setup().withLevelCap(levelCap), solo.curve(), chapters, orders);
    }

    private static Setup drawSetup(World world, GeneratorConfig config, SeededRandom rng) {
        var classes = new ArrayList<>(new TreeSet<>(world.classes().keySet()));
        var startingClass = config.startingClass() != null ? config.startingClass() : rng.pick(classes);
        var known = world.classes().get(startingClass);
        if (known == null) throw new IllegalArgumentException("unknown class \"" + startingClass + "\"");
        var level = known.level();
        List<StartingGift> gifts = new ArrayList<>(world.gifts());
        gifts.sort(Comparator.comparingInt(StartingGift::row));
        StartingGift gift;
        if (config.giftRow() != null) {
            gift = gifts.stream().filter(g -> g.row() == config.giftRow()).findFirst()
                    .orElseThrow(() -> new IllegalArgumentException("unknown gift row " + config.giftRow()));
        } else {
            gift = rng.pick(gifts);
        }

        var caps = levelCaps(config.difficulty());
        int levelCap = Math.max(level, config.levelCap() != null ? config.levelCap() : rng.nextInt(caps.min(), caps.max()));
        return new Setup(Mode.STATIC, gift, startingClass, levelCap);
    }
}
