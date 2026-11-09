package com.renanabade.darksouls.core;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/**
 * The world graph the core works on, built from data/ds1 (see its SCHEMA.md). Only the fields the core uses are kept; the
 * rest of each file stays in the data set. Every map iterates in the order of its file, which the generator relies on.
 * Immutable, and safe to share between threads.
 */
public final class World {
    private final String dataVersion;
    private final String start;
    private final String goal;
    private final Map<String, Region> regions;
    private final List<Entrance> entrances;
    private final List<Location> locations;
    private final List<StartingGift> gifts;
    private final Map<String, Boss> bosses;
    private final Map<String, Merchant> merchants;
    private final Map<String, Milestone> milestones;
    private final Map<String, Weapon> weapons;
    private final Map<String, Spell> spells;
    private final Map<String, StartingClass> classes;
    private final Map<String, Area> areas;
    private final List<Chest> chests;
    private final List<NpcWarning> warnings;

    private final Map<String, List<String>> regionsByArea = new HashMap<>();
    private final Map<String, Location> locationsByName = new HashMap<>();

    /**
     * One walk per distinct set of closed regions and starting items: the combinations a world is actually asked about, not
     * an unbounded log. A challenge draws a handful of forbidden areas and one gift.
     */
    private final ConcurrentMap<String, Reach> reachCache = new ConcurrentHashMap<>();

    private final ConcurrentMap<String, Object> generatorCache = new ConcurrentHashMap<>();

    private volatile GraphIndex graph;

    World(
            String dataVersion,
            String start,
            String goal,
            Map<String, Region> regions,
            List<Entrance> entrances,
            List<Location> locations,
            List<StartingGift> gifts,
            Map<String, Boss> bosses,
            Map<String, Merchant> merchants,
            Map<String, Milestone> milestones,
            Map<String, Weapon> weapons,
            Map<String, Spell> spells,
            Map<String, StartingClass> classes,
            Map<String, Area> areas,
            List<Chest> chests,
            List<NpcWarning> warnings) {
        this.dataVersion = dataVersion;
        this.start = start;
        this.goal = goal;
        this.regions = regions;
        this.entrances = entrances;
        this.locations = locations;
        this.gifts = gifts;
        this.bosses = bosses;
        this.merchants = merchants;
        this.milestones = milestones;
        this.weapons = weapons;
        this.spells = spells;
        this.classes = classes;
        this.areas = areas;
        this.chests = chests;
        this.warnings = warnings;

        for (var region : regions.values()) {
            if (region.area() != null) {
                regionsByArea.computeIfAbsent(region.area(), a -> new ArrayList<>()).add(region.id());
            }
        }

        for (var location : locations) locationsByName.putIfAbsent(location.name(), location);
    }

    /** The game's short name, as challenge codes write it. */
    public String game() {
        return "ds1";
    }

    /** The data set's version; part of a challenge's identity. */
    public String dataVersion() {
        return dataVersion;
    }

    public String start() {
        return start;
    }

    public String goal() {
        return goal;
    }

    public Map<String, Region> regions() {
        return regions;
    }

    public List<Entrance> entrances() {
        return entrances;
    }

    public List<Location> locations() {
        return locations;
    }

    public List<StartingGift> gifts() {
        return gifts;
    }

    public Map<String, Boss> bosses() {
        return bosses;
    }

    public Map<String, Merchant> merchants() {
        return merchants;
    }

    public Map<String, Milestone> milestones() {
        return milestones;
    }

    /** By name. */
    public Map<String, Weapon> weapons() {
        return weapons;
    }

    /** By name. */
    public Map<String, Spell> spells() {
        return spells;
    }

    /** Starting classes, by name. */
    public Map<String, StartingClass> classes() {
        return classes;
    }

    public Map<String, Area> areas() {
        return areas;
    }

    /** Treasure chests placed in the world (not the Firelink rescue chest), one per chest. */
    public List<Chest> chests() {
        return chests;
    }

    /** What the manual tells the player about NPCs the scripts can lose or turn. */
    public List<NpcWarning> warnings() {
        return warnings;
    }

    /** The regions of one area, in world order. */
    public List<String> regionsInArea(String area) {
        return regionsByArea.getOrDefault(area, List.of());
    }

    /** The first location of a name, or null. */
    public Location locationNamed(String name) {
        return name == null ? null : locationsByName.get(name);
    }

    /** What the generator computes once per world. Not part of the world's meaning. */
    public ConcurrentMap<String, Object> generatorCache() {
        return generatorCache;
    }

    ConcurrentMap<String, Reach> reachCache() {
        return reachCache;
    }

    GraphIndex graph() {
        var index = graph;
        if (index == null) {
            synchronized (this) {
                index = graph;
                if (index == null) {
                    index = new GraphIndex(this);
                    graph = index;
                }
            }
        }

        return index;
    }
}
