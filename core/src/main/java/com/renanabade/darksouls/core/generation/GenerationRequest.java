package com.renanabade.darksouls.core.generation;

import com.renanabade.darksouls.core.World;
import com.renanabade.darksouls.core.orders.Difficulty;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;

/**
 * What a client asks for. One difficulty per player: a single player gets the solo challenge, several get one challenge for the
 * group, with handicap. Class, gift, level cap and curve are drawn from the seed when absent; whether a class or gift exists is the
 * generator's to check.
 *
 * @param code a challenge code: it fixes everything, and overrides the rest of the request but its players
 */
public record GenerationRequest(
        String code,
        String seed,
        List<Difficulty> players,
        Length length,
        Curve curve,
        String startingClass,
        Integer giftRow,
        Integer levelCap) {
    public static final int MAX_SEED_LENGTH = 64;
    public static final int MAX_PLAYERS = 8;

    private static final SecureRandom RANDOM = new SecureRandom();

    public GenerationRequest {
        players = players == null ? List.of(Difficulty.MEDIUM) : players;
        length = length == null ? Length.FULL : length;
    }

    /** What is wrong with the request; empty when it can be generated. */
    public List<String> problems() {
        List<String> problems = new ArrayList<>();
        if (seed != null && (seed.strip().isEmpty() || seed.strip().length() > MAX_SEED_LENGTH)) {
            problems.add("the seed must have 1 to " + MAX_SEED_LENGTH + " characters");
        }

        if (players.isEmpty() || players.size() > MAX_PLAYERS) problems.add("a challenge has 1 to " + MAX_PLAYERS + " players");
        if (startingClass != null && (startingClass.strip().isEmpty() || startingClass.strip().length() > 32)) {
            problems.add("the class must have 1 to 32 characters");
        }

        if (giftRow != null && giftRow < 0) problems.add("the gift row cannot be negative");
        if (levelCap != null && levelCap <= 0) problems.add("the level cap must be positive");
        if (levelCap != null && levelCap > ChallengeCode.MAX_LEVEL_CAP) problems.add("the level cap must be at most " + ChallengeCode.MAX_LEVEL_CAP);
        return problems;
    }

    /** Generates the request's challenges, one per player, in the order of its players. */
    public List<ChallengeDocument> run(World world) {
        if (code != null) {
            var reading = ChallengeCode.decode(world, code);
            if (!reading.ok()) throw new IllegalArgumentException(reading.problem());
            var config = reading.decoded().config();
            var group = players.size() == 1 ? List.of(config.difficulty()) : players;
            return Generator.generateGroup(world, config, group).stream().map(c -> ChallengeDocument.from(world, c)).toList();
        }

        var config = new GeneratorConfig(
                seed != null ? seed.strip() : drawSeed(),
                players.get(0),
                length,
                curve,
                startingClass == null ? null : startingClass.strip(),
                giftRow,
                levelCap);
        return Generator.generateGroup(world, config, players).stream().map(c -> ChallengeDocument.from(world, c)).toList();
    }

    /** Draws a short seed, so a challenge asked without one can still be shared. */
    public static String drawSeed() {
        return Integer.toString(RANDOM.nextInt(1 << ChallengeCode.SEED_BITS));
    }
}
