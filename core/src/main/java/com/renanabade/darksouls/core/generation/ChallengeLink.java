package com.renanabade.darksouls.core.generation;

import com.renanabade.darksouls.core.World;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import java.util.function.Function;
import java.util.function.Supplier;

/**
 * The link of a challenge is <code>?c=&lt;code&gt;</code>. Links from before the code (<code>?seed=...&amp;difficulty=...</code>)
 * still work: their text seed is hashed into the code's seed, and every parameter counts, even with an empty seed.
 */
public final class ChallengeLink {
    private static final List<String> LEGACY_NAMES = List.of("seed", "class", "gift", "difficulty", "length", "curve", "cap");

    private ChallengeLink() {}

    public static String queryOf(String code) {
        return "?c=" + URLEncoder.encode(code, StandardCharsets.UTF_8).replace("+", "%20");
    }

    /** Reads a link's parameters. The seed drawn for a legacy link without one comes from drawSeed. */
    public static LinkReading read(World world, Map<String, String> query, Supplier<String> drawSeed) {
        return query.containsKey("c") ? readCode(world, query.get("c")) : readLegacy(world, query, drawSeed);
    }

    /** What to tell the player about a code another generator or data set made. */
    public static String versionNotice(World world, DecodedCode decoded) {
        return "This code was made with generator " + decoded.generatorVersion() + " and data " + decoded.dataVersion() + ". "
                + "This site runs generator " + Generator.VERSION + " and data " + ChallengeCode.compactDataVersion(world.dataVersion()) + ", "
                + "so it now gives a different challenge.";
    }

    private static LinkReading readCode(World world, String code) {
        var reading = ChallengeCode.decode(world, code);
        if (!reading.ok()) return new LinkReading(null, null, List.of("The link's code cannot be read: " + reading.problem() + "."));
        var decoded = reading.decoded();
        return new LinkReading(
                decoded.config(),
                ChallengeCode.encode(world, decoded.config()),
                decoded.isCurrent() ? List.of() : List.of(versionNotice(world, decoded)));
    }

    private static LinkReading readLegacy(World world, Map<String, String> query, Supplier<String> drawSeed) {
        if (LEGACY_NAMES.stream().noneMatch(query::containsKey)) return new LinkReading(null, null, List.of());

        List<String> notices = new ArrayList<>();
        var seed = query.get("seed");
        var config = new GeneratorConfig(
                seed != null && !seed.strip().isEmpty() ? seed.strip() : drawSeed.get(),
                com.renanabade.darksouls.core.orders.Difficulty.MEDIUM,
                Length.FULL);

        var startingClass = query.get("class");
        if (given(startingClass)) {
            if (world.classes().containsKey(startingClass)) config = config.withStartingClass(startingClass);
            else ignored(notices, "class", startingClass);
        }

        var gift = query.get("gift");
        if (given(gift)) {
            var row = digits(gift);
            if (row != null && world.gifts().stream().anyMatch(g -> g.row() == row)) config = config.withGiftRow(row);
            else ignored(notices, "gift", gift);
        }

        var difficulty = query.get("difficulty");
        if (given(difficulty)) {
            var level = named(difficulty, Curves.DIFFICULTIES, Enum::name);
            if (level != null) config = config.withDifficulty(level);
            else ignored(notices, "difficulty", difficulty);
        }

        var length = query.get("length");
        if (given(length)) {
            var size = named(length, List.of(Length.values()), Enum::name);
            if (size != null) config = config.withLength(size);
            else ignored(notices, "length", length);
        }

        var curve = query.get("curve");
        if (given(curve)) {
            var shape = named(curve, Curves.ALL, Enum::name);
            if (shape != null) config = config.withCurve(shape);
            else ignored(notices, "curve", curve);
        }

        var cap = query.get("cap");
        if (given(cap)) {
            var levelCap = digits(cap);
            if (levelCap != null && levelCap > 0 && levelCap <= ChallengeCode.MAX_LEVEL_CAP) config = config.withLevelCap(levelCap);
            else ignored(notices, "level cap", cap);
        }

        var version = query.get("v");
        if (version != null && !version.equals(Generator.VERSION)) {
            notices.add("This link was made with generator " + version + ". This site runs generator " + Generator.VERSION + ", so it now gives a different challenge.");
        }

        return new LinkReading(config, ChallengeCode.encode(world, config), notices);
    }

    private static boolean given(String value) {
        return value != null && !value.isEmpty();
    }

    private static void ignored(List<String> notices, String name, String value) {
        notices.add("The link's " + name + " \"" + value + "\" does not exist, and was ignored.");
    }

    /** The number of a text made only of digits, or null. */
    private static Integer digits(String text) {
        if (text.isEmpty() || !text.chars().allMatch(c -> c >= '0' && c <= '9')) return null;
        try {
            return Integer.valueOf(text);
        } catch (NumberFormatException tooLarge) {
            return null;
        }
    }

    private static <T> T named(String name, List<T> values, Function<T, String> nameOf) {
        for (var value : values) {
            if (nameOf.apply(value).equalsIgnoreCase(name)) return value;
        }

        return null;
    }
}
