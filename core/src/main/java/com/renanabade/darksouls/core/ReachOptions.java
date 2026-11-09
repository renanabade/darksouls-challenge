package com.renanabade.darksouls.core;

import java.util.Set;

/**
 * What a walk of the graph starts from. Any of these may be null.
 *
 * @param items what the player already holds at the start (a starting gift, for example)
 * @param forbiddenItems items the player never takes, milestones included ("Taurus Demon Defeated" = never kill Taurus)
 * @param forbiddenRegions regions the player never enters
 * @param forbiddenLocations locations the player never takes from, while the same item elsewhere is still allowed
 */
public record ReachOptions(
        Iterable<String> items,
        Set<String> forbiddenItems,
        Set<String> forbiddenRegions,
        Set<Location> forbiddenLocations) {
    public static final ReachOptions NONE = new ReachOptions(null, null, null, null);

    public static ReachOptions forbidItems(Set<String> items) {
        return new ReachOptions(null, items, null, null);
    }

    public static ReachOptions forbidRegions(Set<String> regions) {
        return new ReachOptions(null, null, regions, null);
    }

    ReachOptions withForbiddenItems(Set<String> items) {
        return new ReachOptions(this.items, items, forbiddenRegions, forbiddenLocations);
    }
}
