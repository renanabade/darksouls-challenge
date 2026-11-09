package com.renanabade.darksouls.server.generation;

import com.renanabade.darksouls.core.generation.Curve;
import com.renanabade.darksouls.core.generation.Length;
import com.renanabade.darksouls.core.orders.Difficulty;

/** A solo challenge: a code, or the settings to make one from. Settings left out are drawn by the seed. */
public record CreateChallengeRequest(
        String code,
        String seed,
        Difficulty difficulty,
        Length length,
        Curve curve,
        String startingClass,
        Integer giftRow,
        Integer levelCap) {
    public CreateChallengeRequest {
        difficulty = difficulty == null ? Difficulty.MEDIUM : difficulty;
        length = length == null ? Length.FULL : length;
    }
}
