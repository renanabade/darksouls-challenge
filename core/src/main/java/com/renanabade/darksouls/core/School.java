package com.renanabade.darksouls.core;

public enum School {
    MIRACLE("miracle"),
    PYROMANCY("pyromancy"),
    SORCERY("sorcery");

    private final String id;

    School(String id) {
        this.id = id;
    }

    /** The id used in the data set and in order arguments. */
    public String id() {
        return id;
    }
}
