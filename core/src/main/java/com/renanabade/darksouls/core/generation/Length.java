package com.renanabade.darksouls.core.generation;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Locale;

/** How long a journey is. */
public enum Length {
    SHORT,
    FULL,
    EPIC;

    /** The lower-case name, as the manual and the API write it. */
    @JsonValue
    public String label() {
        return name().toLowerCase(Locale.ROOT);
    }

    @JsonCreator
    public static Length named(String name) {
        for (var value : values()) {
            if (value.name().equalsIgnoreCase(name)) return value;
        }

        throw new IllegalArgumentException("unknown length \"" + name + "\"");
    }
}
