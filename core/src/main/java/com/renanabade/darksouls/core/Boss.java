package com.renanabade.darksouls.core;

import java.util.List;

/** Bosses are compared by identity: each one exists once in a world. */
public final class Boss {
    private final String id;
    private final String name;
    private final String region;
    private final String defeatedItem;
    private final List<BossPart> parts;

    public Boss(String id, String name, String region, String defeatedItem, List<BossPart> parts) {
        this.id = id;
        this.name = name;
        this.region = region;
        this.defeatedItem = defeatedItem;
        this.parts = parts;
    }

    public String id() {
        return id;
    }

    public String name() {
        return name;
    }

    public String region() {
        return region;
    }

    /**
     * The graph item for this boss's death: the BOSS location of its region. Matched by region, not by name, because the
     * names can differ between sources.
     */
    public String defeatedItem() {
        return defeatedItem;
    }

    public List<BossPart> parts() {
        return parts;
    }
}
