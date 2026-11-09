package com.renanabade.darksouls.core;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

public final class Reachability {
    private Reachability() {}

    /**
     * Everything the player can reach from the start, by fixed point: cross every entrance whose requirement holds, take
     * every item in the regions reached, and repeat until nothing changes. Each round only adds, so the loop ends after at
     * most one round per region.
     */
    public static Reach walk(World world, ReachOptions options) {
        return new Walk(world, options == null ? ReachOptions.NONE : options).run();
    }

    public static Reach walk(World world) {
        return walk(world, ReachOptions.NONE);
    }

    /**
     * Everything still reachable once the given regions are closed. The walk runs once per distinct set of regions and
     * starting items; a later call with the same key returns the cached reach.
     */
    public static Reach withoutRegions(World world, Iterable<String> forbiddenRegions, Iterable<String> items) {
        var regions = sorted(forbiddenRegions);
        var held = sorted(items == null ? List.of() : items);
        var key = String.join("\0", regions) + "\n" + String.join("\0", held);
        var known = world.reachCache().get(key);
        if (known != null) return known;

        // Not computeIfAbsent: a walk is slow, and must not hold a bin of the map while it runs.
        var reach = walk(world, new ReachOptions(held, null, new HashSet<>(regions), null));
        var raced = world.reachCache().putIfAbsent(key, reach);
        return raced != null ? raced : reach;
    }

    /**
     * Everything still reachable once the given areas are closed. Uses the same cache as {@link #withoutRegions}: one walk
     * per distinct set of areas and starting items, never one per order.
     */
    public static Reach withoutAreas(World world, Iterable<String> areas, Iterable<String> items) {
        List<String> regions = new ArrayList<>();
        Set<String> distinct = new LinkedHashSet<>();
        areas.forEach(distinct::add);
        for (var area : distinct) regions.addAll(world.regionsInArea(area));
        return withoutRegions(world, regions, items);
    }

    private static List<String> sorted(Iterable<String> items) {
        var set = new TreeSet<String>();
        items.forEach(set::add);
        return new ArrayList<>(set);
    }

    private static final class Walk {
        private final World world;
        private final ReachOptions options;
        private final GraphIndex graph;
        private final boolean[] forbiddenRegion;
        private final boolean[] forbiddenItem;
        private final boolean[] regions;
        private final boolean[] items;
        private final boolean[] heldFromStart;
        private Set<String> extras;
        private Map<Integer, Reach> without;

        Walk(World world, ReachOptions options) {
            this.world = world;
            this.options = options;
            graph = world.graph();
            forbiddenRegion = new boolean[graph.regionNames.size()];
            forbiddenItem = new boolean[graph.itemNames.size()];
            regions = new boolean[graph.regionNames.size()];
            items = new boolean[graph.itemNames.size()];
            heldFromStart = new boolean[graph.itemNames.size()];
        }

        Reach run() {
            if (options.forbiddenRegions() != null) {
                for (var region : options.forbiddenRegions()) {
                    var id = graph.regionIds.get(region);
                    if (id != null) forbiddenRegion[id] = true;
                }
            }

            var forbiddenNames = options.forbiddenItems();
            if (forbiddenNames != null) {
                for (var item : forbiddenNames) {
                    var id = graph.itemIds.get(item);
                    if (id != null) forbiddenItem[id] = true;
                }
            }

            // What the player starts with but the graph never mentions (most of a class's kit).
            if (options.items() != null) {
                for (var item : options.items()) {
                    var id = graph.itemIds.get(item);
                    if (id != null) {
                        heldFromStart[id] = true;
                        if (!forbiddenItem[id]) items[id] = true;
                    } else if (forbiddenNames == null || !forbiddenNames.contains(item)) {
                        if (extras == null) extras = new HashSet<>();
                        extras.add(item);
                    }
                }
            }

            if (graph.start >= 0) enter(graph.start);

            var changed = true;
            while (changed) {
                changed = false;
                for (var e : graph.edges) {
                    if (regions[e.from()] && !regions[e.to()] && e.requires().holds(items, regions) && crossableBefore(e)) {
                        changed = enter(e.to()) || changed;
                    }
                }
            }

            return new Reach(
                    new FlagSet(regions, graph.regionNames, graph.regionIds, null),
                    new FlagSet(items, graph.itemNames, graph.itemIds, extras));
        }

        private boolean enter(int region) {
            if (regions[region] || forbiddenRegion[region]) return false;
            regions[region] = true;
            var forbiddenLocations = options.forbiddenLocations();
            for (var pickup : graph.pickups[region]) {
                if (forbiddenLocations != null && forbiddenLocations.contains(pickup.location())) continue;
                if (!forbiddenItem[pickup.item()]) items[pickup.item()] = true;
            }

            return true;
        }

        /**
         * An entrance that must be crossed before an item is held: the player can cross it when it is open in the world
         * without that item. Every state of the walk is one the player reaches with what it holds, so an entrance open
         * while the item is not yet taken is crossable; only otherwise is the world without the item walked, once per item.
         * An item held from the start closes the entrance from the start. Each entrance is judged on its own item: two
         * entrances with different items are not asked to be crossed in one order.
         */
        private boolean crossableBefore(GraphIndex.Edge e) {
            var before = e.before();
            if (before < 0 || forbiddenItem[before]) return true;
            if (heldFromStart[before]) return false;
            if (!items[before]) return true;
            if (without == null) without = new HashMap<>();
            var early = without.get(before);
            if (early == null) {
                Set<String> stricter = options.forbiddenItems() == null ? new HashSet<>() : new HashSet<>(options.forbiddenItems());
                stricter.add(graph.itemNames.get(before));
                early = walk(world, options.withForbiddenItems(stricter));
                without.put(before, early);
            }

            return early.regions().contains(graph.regionNames.get(e.to()));
        }
    }
}
