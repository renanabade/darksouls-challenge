package com.renanabade.darksouls.core.orders;

/** For counts: the range the seed draws from at each difficulty, when already known. */
public record DifficultyRanges(IntRange easy, IntRange medium, IntRange hard, IntRange extreme) {
    public IntRange of(Difficulty difficulty) {
        return switch (difficulty) {
            case EASY -> easy;
            case MEDIUM -> medium;
            case HARD -> hard;
            case EXTREME -> extreme;
        };
    }
}
