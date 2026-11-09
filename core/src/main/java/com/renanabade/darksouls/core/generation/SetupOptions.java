package com.renanabade.darksouls.core.generation;

import com.renanabade.darksouls.core.StartingGift;
import com.renanabade.darksouls.core.World;
import com.renanabade.darksouls.core.orders.Difficulty;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

/** What a client may fix before generating, from the data set; the rest is drawn by the seed. */
public record SetupOptions(
        List<ClassOption> classes,
        List<GiftOption> gifts,
        List<Difficulty> difficulties,
        List<Length> lengths,
        List<Curve> curves) {
    public static SetupOptions of(World world) {
        return new SetupOptions(
                world.classes().values().stream()
                        .sorted(Comparator.comparing(c -> c.name()))
                        .map(c -> new ClassOption(c.name(), c.level(), c.stats()))
                        .toList(),
                world.gifts().stream()
                        .sorted(Comparator.comparingInt(StartingGift::row))
                        .map(g -> new GiftOption(g.row(), labelOf(g)))
                        .toList(),
                Curves.DIFFICULTIES,
                List.of(Length.values()),
                Curves.ALL);
    }

    private static String labelOf(StartingGift gift) {
        if (gift.items().isEmpty()) return "None";
        return gift.items().stream()
                .map(i -> i.count() > 1 ? i.item() + " x" + i.count() : i.item())
                .collect(Collectors.joining(", "));
    }
}
