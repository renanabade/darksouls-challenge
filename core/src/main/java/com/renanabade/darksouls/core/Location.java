package com.renanabade.darksouls.core;

import java.util.List;

/** A place holding an item. Compared by identity: two locations can hold the same item in one region. */
public final class Location {
    private final String name;
    private final String region;
    private final String item;
    private final int count;
    private final String category;
    private final boolean mandatory;
    private final Boolean found;
    private final String kind;
    private final List<BonfireWindow> unavailable;

    public Location(
            String name,
            String region,
            String item,
            int count,
            String category,
            boolean mandatory,
            Boolean found,
            String kind,
            List<BonfireWindow> unavailable) {
        this.name = name;
        this.region = region;
        this.item = item;
        this.count = count;
        this.category = category;
        this.mandatory = mandatory;
        this.found = found;
        this.kind = kind;
        this.unavailable = unavailable;
    }

    public String name() {
        return name;
    }

    public String region() {
        return region;
    }

    public String item() {
        return item;
    }

    public int count() {
        return count;
    }

    public String category() {
        return category;
    }

    public boolean mandatory() {
        return mandatory;
    }

    /** A corpse or chest pickup, joined to the game's treasures. Null when the data set does not say. */
    public Boolean found() {
        return found;
    }

    /** True only for a location the data set says is a corpse or chest pickup. */
    public boolean isFound() {
        return Boolean.TRUE.equals(found);
    }

    /** weapon, armor, ring, spell, good, or other (graph events and renamed items). */
    public String kind() {
        return kind;
    }

    /** Bonfires only: when it cannot be rested at, from the game's scripts. */
    public List<BonfireWindow> unavailable() {
        return unavailable;
    }

    /**
     * A bonfire "one bonfire" may name: one with no window in which it is out or missing. The order holds for the whole
     * run in its area, so any window would leave the player no bonfire for part of it.
     */
    public boolean alwaysLit() {
        return unavailable == null || unavailable.isEmpty();
    }
}
