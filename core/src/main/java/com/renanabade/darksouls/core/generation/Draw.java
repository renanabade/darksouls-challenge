package com.renanabade.darksouls.core.generation;

import com.renanabade.darksouls.core.Boss;
import com.renanabade.darksouls.core.Combat;
import com.renanabade.darksouls.core.Element;
import com.renanabade.darksouls.core.Location;
import com.renanabade.darksouls.core.ReachOptions;
import com.renanabade.darksouls.core.Reachability;
import com.renanabade.darksouls.core.Region;
import com.renanabade.darksouls.core.School;
import com.renanabade.darksouls.core.Validator;
import com.renanabade.darksouls.core.World;
import com.renanabade.darksouls.core.orders.Difficulty;
import com.renanabade.darksouls.core.orders.IntRange;
import com.renanabade.darksouls.core.orders.OrderArgs;
import com.renanabade.darksouls.core.orders.OrderTemplate;
import com.renanabade.darksouls.core.orders.Restrictions;
import com.renanabade.darksouls.core.orders.Tier;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;
import java.util.function.Function;
import java.util.stream.Stream;

/**
 * Draws the parameters of an order from the game data. Every list is sorted before it is drawn from, so the result depends only
 * on the seed. Count ranges live in the catalog; they and the curse budgets are first estimates, to tune by playing.
 */
public final class Draw {
    /** The ends of the five stretches of a run. */
    private static final List<String> STRETCH_ENDS = List.of("bell-undead-parish", "both-bells", "lordvessel-obtained", "lordvessel-placed", "kiln-open");

    private static final String RUN_START = "boss-asylum-demon";

    private static final List<String> CONDITIONS = List.of("on your first attempt", "without drinking Estus", "without summoning help");

    /** Fewest corpse and chest pickups an area needs for "nothing from the ground" to cost anything: it was once drawn for areas with two items. */
    private static final int MIN_PICKUPS = 5;

    /** The Abyss's bonfire only exists after the Four Kings, so forbidding it costs nothing. */
    private static final String NO_BONFIRE_ASKS_NOTHING = "the-abyss";

    /** What an errand sends the player for: equipment and spells, not consumables or keys. */
    private static final Set<String> ERRAND_KINDS = Set.of("weapon", "armor", "ring", "spell");

    /** The restriction no chapter takes: levels are the level orders' business, and they last the whole run. */
    private static final String NOT_FOR_A_CHAPTER = "no-level-ups";

    private record CurseBudget(int budget, List<Tier> tiers) {}

    private Draw() {}

    /**
     * The accumulated curse is drawn by weight, not by size: each tier costs points, and each difficulty has a budget and the
     * tiers it may draw from. An easy curse holds only light restrictions; an extreme one can stack the heavy ones.
     */
    private static int tierCost(Tier tier) {
        return switch (tier) {
            case LIGHT -> 1;
            case MEDIUM -> 2;
            case HEAVY -> 3;
        };
    }

    private static CurseBudget curse(Difficulty difficulty) {
        return switch (difficulty) {
            case EASY -> new CurseBudget(2, List.of(Tier.LIGHT));
            case MEDIUM -> new CurseBudget(4, List.of(Tier.LIGHT, Tier.MEDIUM));
            case HARD -> new CurseBudget(7, List.of(Tier.LIGHT, Tier.MEDIUM, Tier.HEAVY));
            case EXTREME -> new CurseBudget(10, List.of(Tier.LIGHT, Tier.MEDIUM, Tier.HEAVY));
        };
    }

    /** The range a count parameter is drawn from at a difficulty. */
    public static IntRange rangeOf(OrderTemplate template, String param, Difficulty difficulty) {
        var spec = template.params().get(param);
        if (spec == null || spec.ranges() == null) throw new IllegalStateException("no range for " + template.id() + "." + param);
        return spec.ranges().of(difficulty);
    }

    /**
     * A curse built in layers, one per difficulty up to the given one: the easy layer first, then what the medium budget adds, and
     * so on, each taking restrictions in the given order while they fit. So the curse grows harder boss by boss, and fitting a
     * harder curse to an easier difficulty gives back exactly its first layers, never an empty list: what the group handicap
     * relies on.
     */
    public static List<String> fitCurse(List<String> ids, Difficulty difficulty) {
        List<String> fitted = new ArrayList<>();
        var spent = 0;
        for (var level : Curves.DIFFICULTIES) {
            if (level.compareTo(difficulty) > 0) continue;
            var curse = curse(level);
            for (var id : ids) {
                var restriction = Restrictions.find(id);
                if (restriction == null || !curse.tiers().contains(restriction.tier()) || fitted.contains(id)) continue;
                var cost = tierCost(restriction.tier());
                if (spent + cost > curse.budget()) continue;
                fitted.add(id);
                spent += cost;
            }
        }

        return fitted;
    }

    public static Domains domainsOf(World world) {
        var known = world.generatorCache().get("domains");
        if (known != null) return (Domains) known;
        var domains = readDomains(world);
        var raced = world.generatorCache().putIfAbsent("domains", domains);
        return raced != null ? (Domains) raced : domains;
    }

    private static List<String> sortedSet(Stream<String> items) {
        Set<String> sorted = new TreeSet<>();
        items.forEach(sorted::add);
        return new ArrayList<>(sorted);
    }

    private static String areaOf(World world, String region) {
        var known = world.regions().get(region);
        return known == null ? null : known.area();
    }

    private static Stream<String> areasIn(World world, Collection<Location> locations) {
        return locations.stream().map(l -> areaOf(world, l.region())).filter(Objects::nonNull);
    }

    private static Domains readDomains(World world) {
        var found = world.locations().stream().filter(Location::isFound).toList();
        var bonfires = world.locations().stream().filter(l -> l.category().equals("BONFIRE")).toList();
        var stableBonfires = bonfires.stream().filter(Location::alwaysLit).toList();
        var weaponLocations = found.stream().filter(l -> {
            var weapon = world.weapons().get(l.item());
            return weapon != null && Combat.isMeleeWeapon(weapon);
        }).toList();
        Map<String, Integer> pickups = new LinkedHashMap<>();
        areasIn(world, found).forEach(area -> pickups.merge(area, 1, Integer::sum));
        var bell = world.milestones().get("bell-undead-parish");

        // The graph has no boss gates yet: a bell in the same region as a boss can be rung, by the graph, without defeating the
        // boss. Such a boss is taken as one the bell needs.
        Set<String> bellRegions = new HashSet<>();
        for (var location : world.locations()) {
            if (location.item().startsWith("Bell of Awakening")) bellRegions.add(location.region());
        }

        Function<Boss, Boolean> ringable = boss -> {
            if (bell == null) return true;

            // The first boss opens the run, a gate the graph does not hold either.
            if (bellRegions.contains(boss.region()) || ("boss-" + boss.id()).equals(RUN_START)) return false;
            Set<String> forbidden = new HashSet<>();
            forbidden.add(boss.defeatedItem());
            return Reachability.walk(world, ReachOptions.forbidItems(forbidden)).satisfies(bell.requires());
        };

        Map<String, List<String>> errands = new LinkedHashMap<>();
        for (var area : sortedSet(areasIn(world, found))) {
            var names = sortedSet(found.stream()
                    .filter(l -> area.equals(areaOf(world, l.region())) && l.kind() != null && ERRAND_KINDS.contains(l.kind()))
                    .map(Location::name));
            if (!names.isEmpty()) errands.put(area, names);
        }

        Map<String, List<String>> bonfiresByArea = new LinkedHashMap<>();
        for (var area : sortedSet(areasIn(world, stableBonfires))) {
            var names = sortedSet(stableBonfires.stream().filter(l -> area.equals(areaOf(world, l.region()))).map(Location::name));
            if (names.size() > 1) bonfiresByArea.put(area, names);
        }

        // Not the bosses the graph lets the run pass without: what "before the boss" holds would be wrong.
        Map<String, List<Element>> bossElements = new LinkedHashMap<>();
        for (var boss : world.bosses().values()) {
            if (bellRegions.contains(boss.region()) || ("boss-" + boss.id()).equals(RUN_START)) continue;
            var elements = Combat.elementalDefenses(boss).stream().map(Combat.ElementDefense::element).toList();
            if (!elements.isEmpty()) bossElements.put(boss.id(), elements);
        }

        Map<String, String> weaponLocationAreas = new LinkedHashMap<>();
        for (var location : weaponLocations) {
            var area = areaOf(world, location.region());
            if (area != null) weaponLocationAreas.put(location.name(), area);
        }

        Map<String, Integer> chestCounts = new LinkedHashMap<>();
        for (var chest : world.chests()) {
            var area = areaOf(world, chest.region());
            if (area != null) chestCounts.merge(area, 1, Integer::sum);
        }

        Map<String, Integer> chestsByArea = new LinkedHashMap<>();
        chestCounts.forEach((area, count) -> {
            if (count >= 2) chestsByArea.put(area, count);
        });

        List<String> bossesBeforeBell = new ArrayList<>();
        for (var boss : world.bosses().values()) {
            if (ringable.apply(boss)) bossesBeforeBell.add(boss.id());
        }

        List<String> schools = new ArrayList<>();
        for (School school : Combat.SCHOOLS) {
            if (world.spells().values().stream().anyMatch(spell -> spell.school() == school)) schools.add(school.id());
        }

        return new Domains(
                sortedSet(world.regions().values().stream().map(Region::area).filter(Objects::nonNull)),
                sortedSet(areasIn(world, weaponLocations)),
                sortedSet(areasIn(world, found.stream().filter(l -> "armor".equals(l.kind())).toList())),
                sortedSet(pickups.entrySet().stream().filter(p -> p.getValue() >= MIN_PICKUPS).map(Map.Entry::getKey)),
                sortedSet(areasIn(world, bonfires).filter(a -> !a.equals(NO_BONFIRE_ASKS_NOTHING))),
                sortedSet(areasIn(world, world.locations().stream().filter(l -> l.category().equals(Validator.CRYSTAL_LIZARD)).toList())),
                errands,
                chestsByArea,
                bonfiresByArea,
                sortedSet(world.bosses().keySet().stream()),
                sortedSet(bossesBeforeBell.stream()),
                bossElements,
                sortedSet(world.merchants().keySet().stream()),
                sortedSet(weaponLocations.stream().map(Location::name)),
                weaponLocationAreas,
                sortedSet(world.weapons().values().stream().filter(Combat::isMeleeWeapon).map(w -> w.category())),
                schools,
                sortedSet(world.locations().stream().filter(l -> l.category().equals("LORD_SOUL")).map(Location::item)));
    }

    /** Parameters for one order, or null when the order cannot be drawn here. */
    public static OrderArgs args(OrderTemplate template, Domains domains, DrawContext context, SeededRandom rng) {
        return context.chapter() != null
                ? inChapter(template, domains, context, context.chapter(), rng)
                : forJourney(template, domains, context, rng);
    }

    private static int count(OrderTemplate template, String param, Difficulty difficulty, SeededRandom rng) {
        var range = rangeOf(template, param, difficulty);
        return rng.nextInt(range.min(), range.max());
    }

    private static OrderArgs forJourney(OrderTemplate template, Domains domains, DrawContext context, SeededRandom rng) {
        var difficulty = context.difficulty();
        switch (template.id()) {
            case "first-weapon-of-area": {
                var area = rng.pick(domains.areasWithWeapons());
                return new OrderArgs().put("area", area).put("until", rng.pick(STRETCH_ENDS));
            }
            case "assigned-weapon": {
                var i = rng.nextInt(0, STRETCH_ENDS.size() - 1);
                return new OrderArgs()
                        .put("from", i == 0 ? RUN_START : STRETCH_ENDS.get(i - 1))
                        .put("until", STRETCH_ENDS.get(i))
                        .put("location", rng.pick(domains.weaponLocations()));
            }
            case "wear-what-you-find", "nothing-from-the-ground", "no-bonfire", "forbidden-area":
                return new OrderArgs().put("area", rng.pick(domains.areas()));
            case "dry-fight", "boss-before-bell":
                return new OrderArgs().put("boss", rng.pick(domains.bosses()));
            case "closed-merchant":
                return new OrderArgs().put("merchant", rng.pick(domains.merchants()));
            case "counted-attempts": {
                var attempts = count(template, "attempts", difficulty, rng);
                return new OrderArgs().put("attempts", attempts).put("boss", rng.pick(domains.bosses()));
            }
            case "run-lives":
                return new OrderArgs().put("deaths", count(template, "deaths", difficulty, rng));
            case "accumulated-curse": {
                var ids = Restrictions.ALL.stream()
                        .map(r -> r.id())
                        .filter(id -> !(context.levelsLocked() && id.equals("no-level-ups")))
                        .sorted()
                        .toList();
                return new OrderArgs().put("restrictions", fitCurse(rng.shuffle(ids), difficulty));
            }
            case "phase-swap": {
                // Schools of magic from medium up: switching to magic costs attributes, a catalyst and spells to buy, which
                // punishes a casual player and is the novelty a bored veteran looks for.
                List<String> styles = new ArrayList<>(domains.weaponStyles());
                if (difficulty != Difficulty.EASY) styles.addAll(domains.schools());
                styles.sort(null);
                var shuffled = rng.shuffle(styles);
                return new OrderArgs()
                        .put("milestone", rng.pick(STRETCH_ENDS.subList(0, STRETCH_ENDS.size() - 1)))
                        .put("before", shuffled.size() > 0 ? shuffled.get(0) : "")
                        .put("after", shuffled.size() > 1 ? shuffled.get(1) : "");
            }
            case "lord-order":
                return new OrderArgs().put("order", rng.shuffle(domains.lordSouls()));
            case "earned-levels": {
                if (context.levelsLocked()) return null;
                var condition = rng.pick(CONDITIONS);
                return new OrderArgs().put("condition", condition).put("points", count(template, "points", difficulty, rng));
            }
            case "earned-upgrades":
                return new OrderArgs();
            default:
                return null;
        }
    }

    private static OrderArgs one(String name, String value) {
        return value == null ? null : new OrderArgs().put(name, value);
    }

    /**
     * An order of one chapter: its area or boss comes from the chapter, and a phase is the chapter itself. An easy chapter keeps to
     * the areas its goal needs: a casual player may never visit a detour, and an order there would ask nothing of them.
     */
    private static OrderArgs inChapter(OrderTemplate template, Domains domains, DrawContext context, ChapterContext chapter, SeededRandom rng) {
        var difficulty = context.difficulty();
        var pool = difficulty == Difficulty.EASY && !chapter.requiredAreas().isEmpty() ? chapter.requiredAreas() : chapter.areas();
        Function<Collection<String>, String> areaFrom = domain -> {
            var areas = pool.stream().filter(domain::contains).toList();
            return areas.isEmpty() ? null : rng.pick(areas);
        };

        switch (template.id()) {
            case "first-weapon-of-area": {
                var area = areaFrom.apply(domains.areasWithWeapons());
                return area == null ? null : new OrderArgs().put("area", area).put("until", chapter.until());
            }
            case "assigned-weapon": {
                var locations = domains.weaponLocations().stream()
                        .filter(name -> chapter.areasSoFar().contains(domains.weaponLocationAreas().getOrDefault(name, "")))
                        .toList();
                if (locations.isEmpty()) return null;
                return new OrderArgs().put("from", chapter.from()).put("until", chapter.until()).put("location", rng.pick(locations));
            }
            case "wear-what-you-find":
                return one("area", areaFrom.apply(domains.areasWithArmor()));
            case "nothing-from-the-ground":
                return one("area", areaFrom.apply(domains.areasWithPickups()));
            case "no-bonfire":
                return one("area", areaFrom.apply(domains.areasWithBonfires()));
            case "lizard-hunt": {
                var area = areaFrom.apply(domains.areasWithLizards());
                return area == null ? null : new OrderArgs().put("area", area).put("until", chapter.until());
            }
            case "every-chest": {
                var area = areaFrom.apply(domains.chestsByArea().keySet());
                return area == null
                        ? null
                        : new OrderArgs().put("area", area).put("chests", (int) domains.chestsByArea().get(area)).put("until", chapter.until());
            }
            case "errand": {
                var area = areaFrom.apply(domains.errands().keySet());
                return area == null ? null : new OrderArgs().put("location", rng.pick(domains.errands().get(area))).put("until", chapter.until());
            }

            // A detour of the chapter, or a way through it that has another: the graph decides which.
            case "the-other-way": {
                var areas = chapter.areas().stream().filter(a -> !chapter.requiredAreas().contains(a)).toList();
                return areas.isEmpty() ? null : new OrderArgs().put("area", rng.pick(areas)).put("until", chapter.until());
            }
            case "one-bonfire": {
                var area = areaFrom.apply(domains.bonfiresByArea().keySet());
                return area == null ? null : new OrderArgs().put("area", area).put("bonfire", rng.pick(domains.bonfiresByArea().get(area)));
            }
            case "dry-fight":
                return one("boss", pickBoss(chapter, rng));
            case "counted-attempts": {
                var boss = pickBoss(chapter, rng);
                if (boss == null) return null;
                return new OrderArgs().put("attempts", count(template, "attempts", difficulty, rng)).put("boss", boss);
            }

            // The element comes from the boss: the one it defends worst, or the one it resists most (when that is another
            // element).
            case "exploit-weakness", "against-the-grain": {
                var weakest = template.id().equals("exploit-weakness");
                var options = chapter.bosses().stream()
                        .filter(b -> {
                            var elements = domains.bossElements().get(b);
                            return elements != null && elements.size() > (weakest ? 0 : 1);
                        })
                        .toList();
                if (options.isEmpty()) return null;
                var boss = rng.pick(options);
                var elements = domains.bossElements().get(boss);
                return new OrderArgs().put("boss", boss).put("element", (weakest ? elements.get(0) : elements.get(elements.size() - 1)).id());
            }
            case "boss-before-bell": {
                // A boss of this chapter: with detours drawn among chapters, the others may be met later.
                var bosses = domains.bossesBeforeBell().stream().filter(chapter.bosses()::contains).toList();
                return bosses.isEmpty() ? null : new OrderArgs().put("boss", rng.pick(bosses));
            }
            case "chapter-restriction": {
                var tiers = curse(difficulty).tiers();
                var ids = Restrictions.ALL.stream()
                        .filter(r -> tiers.contains(r.tier()) && !r.id().equals(NOT_FOR_A_CHAPTER))
                        .map(r -> r.id())
                        .sorted()
                        .toList();
                return new OrderArgs().put("from", chapter.from()).put("until", chapter.until()).put("restriction", rng.pick(ids));
            }
            default:
                return null;
        }
    }

    private static String pickBoss(ChapterContext chapter, SeededRandom rng) {
        return chapter.bosses().isEmpty() ? null : rng.pick(chapter.bosses());
    }
}
