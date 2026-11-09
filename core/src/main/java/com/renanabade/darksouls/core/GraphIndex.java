package com.renanabade.darksouls.core;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The world graph with regions and items numbered, so a walk works on arrays instead of hashing strings. A challenge walks
 * the graph thousands of times, and this is what keeps that affordable. Built once per world.
 */
final class GraphIndex {
    interface Condition {
        boolean holds(boolean[] items, boolean[] regions);
    }

    record Edge(int from, int to, Condition requires, int before) {}

    record Pickup(Location location, int item) {}

    final Map<String, Integer> regionIds = new HashMap<>();
    final Map<String, Integer> itemIds = new HashMap<>();
    final List<String> itemNames = new ArrayList<>();
    final List<String> regionNames;
    final Edge[] edges;
    final Pickup[][] pickups;
    final int start;

    GraphIndex(World world) {
        regionNames = List.copyOf(world.regions().keySet());
        for (var i = 0; i < regionNames.size(); i++) regionIds.put(regionNames.get(i), i);
        for (var location : world.locations()) itemId(location.item());

        var entrances = world.entrances();
        edges = new Edge[entrances.size()];
        for (var i = 0; i < edges.length; i++) {
            var e = entrances.get(i);
            edges[i] = new Edge(
                    regionIds.get(e.from()),
                    regionIds.get(e.to()),
                    compile(e.requires()),
                    e.before() == null ? -1 : itemId(e.before()));
        }

        List<List<Pickup>> byRegion = new ArrayList<>();
        for (var i = 0; i < regionNames.size(); i++) byRegion.add(new ArrayList<>());
        for (var location : world.locations()) {
            byRegion.get(regionIds.get(location.region())).add(new Pickup(location, itemIds.get(location.item())));
        }

        pickups = new Pickup[byRegion.size()][];
        for (var i = 0; i < pickups.length; i++) pickups[i] = byRegion.get(i).toArray(new Pickup[0]);
        start = regionIds.getOrDefault(world.start(), -1);
    }

    private int itemId(String item) {
        var id = itemIds.get(item);
        if (id != null) return id;
        var next = itemNames.size();
        itemIds.put(item, next);
        itemNames.add(item);
        return next;
    }

    private Condition compile(Requirement requirement) {
        return switch (requirement) {
            case Requirement.Constant c -> {
                var value = c.value();
                yield (items, regions) -> value;
            }
            case Requirement.Has h -> {
                var item = itemId(h.item());
                yield (items, regions) -> items[item];
            }
            case Requirement.Region r -> {
                var region = regionIds.getOrDefault(r.id(), -1);
                yield (items, regions) -> region >= 0 && regions[region];
            }
            case Requirement.All a -> {
                var children = a.children().stream().map(this::compile).toArray(Condition[]::new);
                yield (items, regions) -> {
                    for (var child : children) {
                        if (!child.holds(items, regions)) return false;
                    }
                    return true;
                };
            }
            case Requirement.Any a -> {
                var children = a.children().stream().map(this::compile).toArray(Condition[]::new);
                yield (items, regions) -> {
                    for (var child : children) {
                        if (child.holds(items, regions)) return true;
                    }
                    return false;
                };
            }
        };
    }
}
