package com.renanabade.darksouls.core.generation;

/**
 * What finishing a challenge is worth on the ranking: the difficulty of its rules, scaled by the difficulty chosen. A first estimate,
 * to tune by playing. It lives with the generator so a score never needs the server's opinion of a challenge.
 */
public final class ChallengeScore {
    private ChallengeScore() {}

    public static int of(Challenge challenge) {
        var rules = 0;
        for (var order : challenge.orders()) rules += order.template().weight().difficulty();
        var scale = switch (challenge.config().difficulty()) {
            case EASY -> 1.0;
            case MEDIUM -> 1.5;
            case HARD -> 2.0;
            case EXTREME -> 3.0;
        };
        return (int) Math.round(rules * scale * 10);
    }
}
