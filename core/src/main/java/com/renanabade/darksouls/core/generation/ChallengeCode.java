package com.renanabade.darksouls.core.generation;

import com.renanabade.darksouls.core.World;
import com.renanabade.darksouls.core.orders.Difficulty;
import java.util.ArrayList;
import java.util.List;
import java.util.TreeSet;

/**
 * The one thing a player shows and shares: <code>ds1.8.07-K39ZA00001</code>, the game, both versions and a payload holding every
 * parameter of a solo challenge and its seed. The payload is 50 bits in Crockford base32, case-insensitive. From the high bits:
 * seed (24), level cap (10), gift (5), class (4), curve (3), length (2), difficulty (2). Level cap, gift, class and curve are 0
 * when drawn by the seed. Group challenges stay on the CLI's --players.
 */
public final class ChallengeCode {
    public static final int SEED_BITS = 24;

    /** The highest level cap a code can hold. The game's own is 713. */
    public static final int MAX_LEVEL_CAP = 713;

    private static final String ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    private static final int PAYLOAD_LENGTH = 10;

    private ChallengeCode() {}

    /** The seed text as the number a code holds: digits are taken as they are, any other text is hashed. */
    public static int seedNumber(String seed) {
        if (!seed.isEmpty() && seed.length() <= 8 && seed.chars().allMatch(c -> c >= '0' && c <= '9')) {
            var number = Integer.parseInt(seed);
            if (number < 1 << SEED_BITS) return number;
        }

        return SeededRandom.fnv1a(seed) & ((1 << SEED_BITS) - 1);
    }

    /** The data version as a code writes it: "0.7.0" is "07", "0.7.1" is "071". */
    public static String compactDataVersion(String dataVersion) {
        var parts = dataVersion.split("\\.", -1);
        return parts.length == 3 && parts[2].equals("0") ? parts[0] + parts[1] : String.join("", parts);
    }

    public static String encode(World world, GeneratorConfig config) {
        var classIndex = config.startingClass() == null ? 0 : classNames(world).indexOf(config.startingClass()) + 1;
        var giftIndex = config.giftRow() == null ? 0 : giftRows(world).indexOf(config.giftRow()) + 1;
        if (config.levelCap() != null && (config.levelCap() < 0 || config.levelCap() > MAX_LEVEL_CAP)) {
            throw new IllegalArgumentException("the level cap must be at most " + MAX_LEVEL_CAP);
        }

        long payload = seedNumber(config.seed());
        payload = (payload << 10) | (config.levelCap() == null ? 0 : config.levelCap());
        payload = (payload << 5) | giftIndex;
        payload = (payload << 4) | classIndex;
        payload = (payload << 3) | (config.curve() == null ? 0 : config.curve().ordinal() + 1);
        payload = (payload << 2) | config.length().ordinal();
        payload = (payload << 2) | config.difficulty().ordinal();

        var text = new StringBuilder(PAYLOAD_LENGTH);
        for (var shift = (PAYLOAD_LENGTH - 1) * 5; shift >= 0; shift -= 5) {
            text.append(ALPHABET.charAt((int) ((payload >> shift) & 31)));
        }

        return world.game() + "." + Generator.VERSION + "." + compactDataVersion(world.dataVersion()) + "-" + text;
    }

    /** Reads a code, or says why it cannot be read. A code from another version is read, and marked as such. */
    public static CodeReading decode(World world, String code) {
        var parts = (code == null ? "" : code).strip().split("-", -1);
        var head = parts[0].split("\\.", -1);
        if (parts.length != 2 || head.length != 3 || parts[1].length() != PAYLOAD_LENGTH) {
            return CodeReading.failed("this is not a challenge code");
        }

        if (!head[0].equalsIgnoreCase(world.game())) {
            return CodeReading.failed("this code is for another game (" + head[0] + ")");
        }

        long payload = 0;
        for (var i = 0; i < parts[1].length(); i++) {
            var value = valueOf(parts[1].charAt(i));
            if (value < 0) return CodeReading.failed("this is not a challenge code");
            payload = (payload << 5) | value;
        }

        var difficulty = (int) (payload & 3);
        var length = (int) ((payload >> 2) & 3);
        var curve = (int) ((payload >> 4) & 7);
        var classIndex = (int) ((payload >> 7) & 15);
        var giftIndex = (int) ((payload >> 11) & 31);
        var levelCap = (int) ((payload >> 16) & 1023);
        var seed = (int) (payload >> 26);
        var classes = classNames(world);
        var gifts = giftRows(world);
        if (length > Length.EPIC.ordinal()
                || curve > Curves.ALL.size()
                || classIndex > classes.size()
                || giftIndex > gifts.size()
                || levelCap > MAX_LEVEL_CAP) {
            return CodeReading.failed("this code holds parameters that do not exist");
        }

        var config = new GeneratorConfig(
                Integer.toString(seed),
                Difficulty.values()[difficulty],
                Length.values()[length],
                curve == 0 ? null : Curve.values()[curve - 1],
                classIndex == 0 ? null : classes.get(classIndex - 1),
                giftIndex == 0 ? null : gifts.get(giftIndex - 1),
                levelCap == 0 ? null : levelCap);
        var isCurrent = head[1].equals(Generator.VERSION) && head[2].equals(compactDataVersion(world.dataVersion()));
        return new CodeReading(new DecodedCode(config, head[1], head[2], isCurrent), null);
    }

    private static List<String> classNames(World world) {
        return new ArrayList<>(new TreeSet<>(world.classes().keySet()));
    }

    private static List<Integer> giftRows(World world) {
        return world.gifts().stream().map(g -> g.row()).sorted().toList();
    }

    private static int valueOf(char symbol) {
        var upper = symbol >= 'a' && symbol <= 'z' ? (char) (symbol - 'a' + 'A') : symbol;
        return switch (upper) {
            case 'O' -> 0;
            case 'I', 'L' -> 1;
            default -> ALPHABET.indexOf(upper);
        };
    }
}
