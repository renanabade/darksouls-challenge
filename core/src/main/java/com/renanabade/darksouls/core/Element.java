package com.renanabade.darksouls.core;

public enum Element {
    PHYSICAL("phys"),
    MAGIC("magic"),
    FIRE("fire"),
    THUNDER("thunder");

    private final String id;

    Element(String id) {
        this.id = id;
    }

    /** The id used in the data set and in order arguments. */
    public String id() {
        return id;
    }
}
