package com.renanabade.darksouls.core.generation;

import com.renanabade.darksouls.core.Milestone;
import com.renanabade.darksouls.core.ReachOptions;
import com.renanabade.darksouls.core.Reachability;
import com.renanabade.darksouls.core.World;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.IntStream;

public final class Chapters {
    /** The chapters before the Lord Souls, in the order the game imposes. */
    private static final List<String> OPENING_GOALS = List.of("boss-asylum-demon", "bell-undead-parish", "both-bells", "lordvessel-placed");

    private record RegionArea(String id, String area) {}

    /**
     * What the chapters of one Lord Soul order share, whatever the seed: the costly part, kept per world.
     *
     * @param goals the milestones that end the chapters
     * @param regions the regions chapters are made of, in world order
     * @param required the chapter of each region some goal needs
     * @param open the first chapter in which each region can be entered at all
     * @param from regions with an entrance into each region
     * @param exits the chapters of the areas with required regions that each area leads into
     */
    private record Layout(
            List<Milestone> goals,
            List<RegionArea> regions,
            Map<String, Integer> required,
            Map<String, Integer> open,
            Map<String, List<String>> from,
            Map<String, List<Integer>> exits) {}

    private Chapters() {}

    public static List<Chapter> of(World world, List<String> lordOrder) {
        return of(world, lordOrder, null);
    }

    /**
     * The chapters of a journey whose Lord Souls are taken in the given order (their item names, as in the lord-order order): the
     * opening chapters, one chapter per Lord Soul, and the last one, to the goal.
     *
     * <p>Each region goes to a chapter in two passes. A region the goal of some chapter needs (forbid it, and the goal cannot be
     * reached) goes to the first such chapter: the Catacombs to Nito's, the Duke's Archives to Seath's. Any other region (a detour)
     * can go to any chapter from the first one that reaches it from a region already placed, and in which it can be entered at all
     * (what later chapters hold, their goals and their bosses' deaths, is withheld: the Painted World waits for Anor Londo's
     * chapter), to the last one before the Kiln. A detour that leads into a later chapter's required region comes no later than
     * that chapter (the Depths before Blighttown's). Without a generator, a detour takes its first chapter; with one, an area of
     * detours is drawn among its chapters, smaller chapters first.
     */
    public static List<Chapter> of(World world, List<String> lordOrder, SeededRandom rng) {
        var layout = layoutOf(world, lordOrder);
        var goals = layout.goals();
        var regions = layout.regions();
        var required = layout.required();
        Map<String, Integer> chapterOf = new LinkedHashMap<>(required);
        Map<String, String> areaOf = new HashMap<>();
        for (var region : regions) areaOf.put(region.id(), region.area());

        Set<String> fixedAreas = new HashSet<>();
        for (var region : required.keySet()) {
            if (areaOf.containsKey(region)) fixedAreas.add(areaOf.get(region));
        }

        List<Set<String>> sizes = new ArrayList<>();
        for (var i = 0; i < goals.size(); i++) sizes.add(new HashSet<>());
        required.forEach((region, k) -> sizes.get(k).add(areaOf.getOrDefault(region, region)));
        var lastDetour = goals.size() - 2;
        Map<String, Integer> drawn = new HashMap<>();

        var changed = true;
        while (changed) {
            changed = false;
            for (var region : regions) {
                var id = region.id();
                var area = region.area();
                var opens = layout.open().get(id);
                if (chapterOf.containsKey(id) || opens == null) continue;
                var placed = layout.from().getOrDefault(id, List.of()).stream().filter(chapterOf::containsKey).map(chapterOf::get).toList();
                if (placed.isEmpty()) continue;
                int earliest = Math.max(opens, Collections.min(placed));
                var k = earliest;
                if (rng != null && !fixedAreas.contains(area)) {
                    var areaChapter = drawn.get(area);
                    if (areaChapter == null) {
                        var latest = lastDetour;
                        for (var exit : layout.exits().getOrDefault(area, List.of())) {
                            if (exit > earliest) latest = Math.min(latest, exit);
                        }

                        latest = Math.max(earliest, latest);
                        var options = IntStream.rangeClosed(earliest, latest).boxed().toList();
                        areaChapter = rng.weightedShuffle(options, c -> 1 / StrictMath.pow(1 + sizes.get(c).size(), 2)).get(0);
                        drawn.put(area, areaChapter);
                        sizes.get(areaChapter).add(area);
                    }

                    k = Math.max(earliest, areaChapter);
                }

                chapterOf.put(id, k);
                changed = true;
            }
        }

        // An area belongs to the first chapter that meets it.
        Map<String, Integer> areaChapter = new LinkedHashMap<>();
        for (var region : regions) {
            var k = chapterOf.get(region.id());
            if (k != null && k < areaChapter.getOrDefault(region.area(), Integer.MAX_VALUE)) areaChapter.put(region.area(), k);
        }

        Set<String> requiredAreas = new HashSet<>();
        for (var region : regions) {
            if (required.containsKey(region.id()) && chapterOf.get(region.id()).equals(areaChapter.get(region.area()))) {
                requiredAreas.add(region.area());
            }
        }

        List<Chapter> chapters = new ArrayList<>();
        for (var k = 0; k < goals.size(); k++) {
            var index = k;
            var areas = areaChapter.entrySet().stream().filter(a -> a.getValue() == index).map(Map.Entry::getKey).sorted().toList();
            var bosses = world.bosses().values().stream()
                    .filter(b -> {
                        var chapter = chapterOf.get(b.region());
                        return chapter != null && chapter == index;
                    })
                    .map(b -> b.id())
                    .sorted()
                    .toList();
            chapters.add(new Chapter(goals.get(k).id(), areas, areas.stream().filter(requiredAreas::contains).toList(), bosses));
        }

        return chapters;
    }

    private static Layout layoutOf(World world, List<String> lordOrder) {
        var key = "layout|" + String.join("|", lordOrder);
        var known = world.generatorCache().get(key);
        if (known != null) return (Layout) known;
        var layout = buildLayout(world, lordOrder);
        var raced = world.generatorCache().putIfAbsent(key, layout);
        return raced != null ? (Layout) raced : layout;
    }

    private static Layout buildLayout(World world, List<String> lordOrder) {
        List<Milestone> goals = new ArrayList<>();
        for (var id : OPENING_GOALS) goals.add(milestoneNamed(world, id));
        for (var soul : lordOrder) goals.add(lordGoal(world, soul));
        goals.add(finalGoal(world));

        List<RegionArea> regions = new ArrayList<>();
        for (var region : world.regions().values()) {
            if (!region.isVirtual() && region.area() != null) regions.add(new RegionArea(region.id(), region.area()));
        }

        Map<String, Integer> required = new LinkedHashMap<>();
        for (var region : regions) {
            Set<String> closed = new HashSet<>();
            closed.add(region.id());
            var without = Reachability.walk(world, ReachOptions.forbidRegions(closed));
            for (var k = 0; k < goals.size(); k++) {
                if (!without.satisfies(goals.get(k).requires())) {
                    required.put(region.id(), k);
                    break;
                }
            }
        }

        Map<String, String> regionOfBoss = new LinkedHashMap<>();
        for (var boss : world.bosses().values()) regionOfBoss.put(boss.defeatedItem(), boss.region());

        List<com.renanabade.darksouls.core.Reach> reachBy = new ArrayList<>();
        for (var k = 0; k < goals.size(); k++) {
            Set<String> withheld = new HashSet<>();
            for (var goal : goals.subList(k + 1, goals.size())) withheld.addAll(goal.requires().items());
            for (var goal : goals.subList(0, k + 1)) withheld.removeAll(goal.requires().items());
            for (var entry : regionOfBoss.entrySet()) {
                var chapter = required.get(entry.getValue());
                if (chapter != null && chapter > k) withheld.add(entry.getKey());
            }

            reachBy.add(Reachability.walk(world, ReachOptions.forbidItems(withheld)));
        }

        Map<String, Integer> open = new LinkedHashMap<>();
        for (var region : regions) {
            for (var k = 0; k < reachBy.size(); k++) {
                if (reachBy.get(k).regions().contains(region.id())) {
                    open.put(region.id(), k);
                    break;
                }
            }
        }

        Map<String, String> areaOf = new HashMap<>();
        for (var region : regions) areaOf.put(region.id(), region.area());

        // An area with a required region is met in the first chapter that needs one of them.
        Map<String, Integer> fixedChapter = new HashMap<>();
        required.forEach((region, k) -> {
            var area = areaOf.get(region);
            if (k < fixedChapter.getOrDefault(area, Integer.MAX_VALUE)) fixedChapter.put(area, k);
        });

        Map<String, List<String>> from = new HashMap<>();
        Map<String, List<Integer>> exits = new HashMap<>();
        for (var e : world.entrances()) {
            from.computeIfAbsent(e.to(), t -> new ArrayList<>()).add(e.from());
            var area = areaOf.get(e.from());
            var into = areaOf.get(e.to());
            if (area != null && into != null && !into.equals(area) && fixedChapter.containsKey(into)) {
                exits.computeIfAbsent(area, a -> new ArrayList<>()).add(fixedChapter.get(into));
            }
        }

        return new Layout(goals, regions, required, open, from, exits);
    }

    private static Milestone milestoneNamed(World world, String id) {
        var milestone = world.milestones().get(id);
        if (milestone == null) throw new IllegalStateException("the data set has no milestone \"" + id + "\"");
        return milestone;
    }

    /** The milestone of placing a Lord Soul: the lord-souls milestone that needs that soul. */
    private static Milestone lordGoal(World world, String soul) {
        for (var milestone : world.milestones().values()) {
            if (milestone.kind().equals("lord-souls") && milestone.requires().items().contains(soul)) return milestone;
        }

        throw new IllegalStateException("no milestone places \"" + soul + "\"");
    }

    /** The milestone of the run's goal (defeating Gwyn). */
    private static Milestone finalGoal(World world) {
        for (var milestone : world.milestones().values()) {
            if (milestone.kind().equals("boss") && milestone.requires().items().contains(world.goal())) return milestone;
        }

        throw new IllegalStateException("no milestone reaches the goal \"" + world.goal() + "\"");
    }
}
