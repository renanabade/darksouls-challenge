package com.renanabade.darksouls.core;

/**
 * A way between two regions.
 *
 * @param walkBack false when the way back on foot is known not to exist; the way back, when it exists, is its own entrance
 * @param before an item the entrance must be crossed before: once the player holds it, the way is gone for good unless it
 *     was crossed already (Quelana leaves if the Bed of Chaos dies before she was met)
 */
public record Entrance(String from, String to, Requirement requires, boolean walkBack, String before) {}
