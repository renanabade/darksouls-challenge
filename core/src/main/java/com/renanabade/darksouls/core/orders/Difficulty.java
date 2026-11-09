package com.renanabade.darksouls.core.orders;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Locale;

/** Difficulty bands, easiest to hardest. The ordinals are the order of the bands. */
public enum Difficulty {
    EASY,
    MEDIUM,
    HARD,
    EXTREME;

    /** The lower-case name, as the manual and the API write it. */
    @JsonValue
    public String label() {
        return name().toLowerCase(Locale.ROOT);
    }

    @JsonCreator
    public static Difficulty named(String name) {
        for (var value : values()) {
            if (value.name().equalsIgnoreCase(name)) return value;
        }

        throw new IllegalArgumentException("unknown difficulty \"" + name + "\"");
    }
}
