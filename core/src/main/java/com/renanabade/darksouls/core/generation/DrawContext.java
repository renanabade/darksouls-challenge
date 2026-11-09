package com.renanabade.darksouls.core.generation;

import com.renanabade.darksouls.core.orders.Difficulty;

/**
 * Where an order is drawn: its difficulty, and the chapter it belongs to (none for the whole journey).
 *
 * @param difficulty the difficulty the numbers are drawn at
 * @param levelsLocked true when the level cap is the class's level: no order about levels would ask anything
 * @param chapter the chapter, or null for the whole journey
 */
public record DrawContext(Difficulty difficulty, boolean levelsLocked, ChapterContext chapter) {
    public DrawContext(Difficulty difficulty, boolean levelsLocked) {
        this(difficulty, levelsLocked, null);
    }
}
