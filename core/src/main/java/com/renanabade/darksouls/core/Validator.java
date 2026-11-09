package com.renanabade.darksouls.core;

import com.renanabade.darksouls.core.orders.OrderArgs;
import com.renanabade.darksouls.core.orders.OrderInstance;
import java.util.LinkedHashSet;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

public final class Validator {
    public static final List<String> BELLS = List.of("Bell of Awakening #1", "Bell of Awakening #2");

    /** The location category of a crystal lizard's drop: one or more per lizard. */
    public static final String CRYSTAL_LIZARD = "CRYSTAL_LIZARD";

    private Validator() {}

    /**
     * What the player holds when the run starts: the starting gift and the class's own items. Both open the graph (the
     * Master Key, from the Thief's kit or as a gift, makes the Taurus Demon optional), so which bosses are mandatory follows
     * from the setup instead of a fixed list.
     */
    public static List<String> startingItems(World world, Setup setup) {
        Set<String> items = new LinkedHashSet<>();
        setup.gift().items().forEach(item -> items.add(item.item()));
        var start = setup.startingClass() == null ? null : world.classes().get(setup.startingClass());
        if (start != null) {
            // The kit counts too: the Pyromancer's own Pyromancy Flame is what Quelana waits for.
            items.addAll(start.kit());
            items.addAll(start.items());
        }

        return new ArrayList<>(items);
    }

    /**
     * Validates a set of orders on the world graph. The orders are checked together: every forbidden area and every
     * forbidden pickup applies to every other check, so a combination that is impossible is refused even when each order
     * alone is possible.
     */
    public static ValidationResult validate(World world, Setup setup, List<? extends OrderInstance> orders) {
        return new ValidationRun(world, setup, orders).execute();
    }

    /**
     * The place an order is about, when that place cannot be visited in the given reach. Null when the order is not about a
     * place, or the place can still be visited. An area is open when any of its regions was reached; a boss, a pickup and a
     * bonfire need their own region; a merchant needs any of their shops.
     */
    public static String unreachableTarget(World world, OrderArgs args, Set<String> reached) {
        var area = args.text("area");
        if (area != null) {
            var regions = world.regionsInArea(area);
            if (!regions.isEmpty() && regions.stream().noneMatch(reached::contains)) {
                var known = world.areas().get(area);
                return known == null ? area : known.name();
            }
        }

        var bossId = args.text("boss");
        if (bossId != null) {
            var boss = world.bosses().get(bossId);
            if (boss != null && !reached.contains(boss.region())) return boss.name();
        }

        var location = world.locationNamed(args.text("location"));
        if (location != null && !reached.contains(location.region())) return location.item();

        var bonfire = world.locationNamed(args.text("bonfire"));
        if (bonfire != null && !reached.contains(bonfire.region())) return bonfire.name();

        var merchantId = args.text("merchant");
        if (merchantId != null) {
            var merchant = world.merchants().get(merchantId);
            if (merchant != null && !merchant.regions().isEmpty() && merchant.regions().stream().noneMatch(reached::contains)) {
                return merchant.name();
            }
        }

        return null;
    }
}
