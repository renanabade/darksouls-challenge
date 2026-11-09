package com.renanabade.darksouls.core.generation;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Locale;

/**
 * How difficulty moves across the chapters of a journey: the chosen difficulty is the level the curve moves around, not the
 * level of every chapter. Constant: every chapter at the chosen level. Rising: a step below it at the start, a step above it at
 * the end. Peaks: the chosen level, with one chapter in four two steps above it; at extreme, where nothing is above, the peaks
 * turn into valleys a step below. Rollercoaster: a step below, at or above it, the level changing from chapter to chapter.
 * Whatever the curve, the last chapter is never below the chosen level: the end of the run is its climax.
 */
public enum Curve {
    CONSTANT,
    RISING,
    PEAKS,
    ROLLERCOASTER;

    /** The lower-case name, as the manual and the API write it. */
    @JsonValue
    public String label() {
        return name().toLowerCase(Locale.ROOT);
    }

    @JsonCreator
    public static Curve named(String name) {
        for (var value : values()) {
            if (value.name().equalsIgnoreCase(name)) return value;
        }

        throw new IllegalArgumentException("unknown curve \"" + name + "\"");
    }
}
