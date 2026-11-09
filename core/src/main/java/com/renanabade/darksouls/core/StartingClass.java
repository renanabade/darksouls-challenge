package com.renanabade.darksouls.core;

import java.util.List;

/**
 * A starting class.
 *
 * @param level soul level at the start
 * @param kit what the class starts with: its equipment and its spells, by name
 * @param items the items the class starts with (the Thief's Master Key), by name: they open the graph like a gift
 */
public record StartingClass(String name, int level, Stats stats, List<String> kit, List<String> items) {}
