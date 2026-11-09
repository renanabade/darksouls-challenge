package com.renanabade.darksouls.core.generation;

import com.renanabade.darksouls.core.orders.Difficulty;

/**
 * What a challenge is generated from.
 *
 * @param seed same config and data, same challenge
 * @param difficulty the level the curve moves around
 * @param length how long the journey is
 * @param curve how difficulty moves across the chapters; drawn by the seed when null
 * @param startingClass fixed by the player; drawn by the seed when null
 * @param giftRow fixed by the player; drawn by the seed when null
 * @param levelCap fixed by the player; drawn by the seed when null
 */
public record GeneratorConfig(
        String seed,
        Difficulty difficulty,
        Length length,
        Curve curve,
        String startingClass,
        Integer giftRow,
        Integer levelCap) {
    public GeneratorConfig(String seed, Difficulty difficulty, Length length) {
        this(seed, difficulty, length, null, null, null, null);
    }

    public GeneratorConfig withSeed(String value) {
        return new GeneratorConfig(value, difficulty, length, curve, startingClass, giftRow, levelCap);
    }

    public GeneratorConfig withDifficulty(Difficulty value) {
        return new GeneratorConfig(seed, value, length, curve, startingClass, giftRow, levelCap);
    }

    public GeneratorConfig withLength(Length value) {
        return new GeneratorConfig(seed, difficulty, value, curve, startingClass, giftRow, levelCap);
    }

    public GeneratorConfig withCurve(Curve value) {
        return new GeneratorConfig(seed, difficulty, length, value, startingClass, giftRow, levelCap);
    }

    public GeneratorConfig withStartingClass(String value) {
        return new GeneratorConfig(seed, difficulty, length, curve, value, giftRow, levelCap);
    }

    public GeneratorConfig withGiftRow(Integer value) {
        return new GeneratorConfig(seed, difficulty, length, curve, startingClass, value, levelCap);
    }

    public GeneratorConfig withLevelCap(Integer value) {
        return new GeneratorConfig(seed, difficulty, length, curve, startingClass, giftRow, value);
    }
}
