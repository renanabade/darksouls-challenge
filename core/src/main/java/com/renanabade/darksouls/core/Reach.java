package com.renanabade.darksouls.core;

import java.util.Set;

/** What a walk of the graph reached. */
public final class Reach {
    private final Set<String> regions;
    private final Set<String> items;

    Reach(Set<String> regions, Set<String> items) {
        this.regions = regions;
        this.items = items;
    }

    public Set<String> regions() {
        return regions;
    }

    public Set<String> items() {
        return items;
    }

    /** Whether the requirement holds with what this reach holds and has reached. */
    public boolean satisfies(Requirement requirement) {
        return requirement.evaluate(items::contains, regions::contains);
    }
}
