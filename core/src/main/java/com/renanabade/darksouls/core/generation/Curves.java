package com.renanabade.darksouls.core.generation;

import com.renanabade.darksouls.core.orders.Difficulty;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.stream.IntStream;

public final class Curves {
    /** One peak per this many chapters after the first (two in a journey of nine). */
    private static final int CHAPTERS_PER_PEAK = 4;

    public static final List<Curve> ALL = List.of(Curve.CONSTANT, Curve.RISING, Curve.PEAKS, Curve.ROLLERCOASTER);

    /** Easiest to hardest. */
    public static final List<Difficulty> DIFFICULTIES = List.of(Difficulty.EASY, Difficulty.MEDIUM, Difficulty.HARD, Difficulty.EXTREME);

    private Curves() {}

    /**
     * Each chapter's distance from the chosen difficulty, in steps. Kept apart from the difficulty so a group shares one curve:
     * each player adds their own difficulty to the same offsets (a group's curve is drawn for its hardest player).
     */
    public static List<Integer> offsets(Curve curve, int chapters, Difficulty difficulty, SeededRandom rng) {
        return switch (curve) {
            case CONSTANT -> IntStream.range(0, chapters).mapToObj(k -> 0).toList();
            case RISING -> IntStream.range(0, chapters)
                    .mapToObj(k -> chapters == 1 ? 0 : jsRound(-1 + (2.0 * k / (chapters - 1))))
                    .toList();
            case PEAKS -> {
                var height = shifted(difficulty, 1) == difficulty ? -1 : 2;

                // Never the first chapter (the Asylum is a tutorial), and a valley never the last.
                var places = IntStream.range(1, 1 + Math.max(0, chapters - (height < 0 ? 2 : 1))).boxed().toList();
                var count = Math.max(1, jsRound((chapters - 1) / (double) CHAPTERS_PER_PEAK));
                var shuffled = rng.shuffle(places);
                Set<Integer> peaks = new HashSet<>(shuffled.subList(0, Math.min(count, shuffled.size())));
                yield IntStream.range(0, chapters).mapToObj(k -> peaks.contains(k) ? height : 0).toList();
            }
            case ROLLERCOASTER -> {
                // The level changes, not just the offset: at easy or extreme two offsets give the same level.
                List<Integer> offsets = new ArrayList<>();
                for (var k = 0; k < chapters; k++) {
                    Integer previous = k > 0 ? offsets.get(k - 1) : null;
                    List<Integer> allowed = new ArrayList<>();
                    for (var o : new int[] {-1, 0, 1}) {
                        if (k < chapters - 1 || o >= 0) allowed.add(o);
                    }

                    List<Integer> changing = new ArrayList<>();
                    for (var o : allowed) {
                        if (previous == null || shifted(difficulty, o) != shifted(difficulty, previous)) changing.add(o);
                    }

                    var options = !changing.isEmpty()
                            ? changing
                            : allowed.stream().filter(o -> !Objects.equals(o, previous)).toList();
                    offsets.add(rng.pick(options));
                }

                yield offsets;
            }
        };
    }

    /** The difficulty a step offset away, held within easy and extreme. */
    public static Difficulty shifted(Difficulty difficulty, int offset) {
        var index = Math.clamp(difficulty.ordinal() + offset, Difficulty.EASY.ordinal(), Difficulty.EXTREME.ordinal());
        return Difficulty.values()[index];
    }

    /** What the challenges were first drawn with: halves round up. */
    static int jsRound(double value) {
        return (int) Math.floor(value + 0.5);
    }
}
