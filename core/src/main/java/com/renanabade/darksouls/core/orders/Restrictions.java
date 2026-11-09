package com.renanabade.darksouls.core.orders;

import static com.renanabade.darksouls.core.orders.RestrictionEffect.NO_LEVEL_UPS;
import static com.renanabade.darksouls.core.orders.RestrictionEffect.NO_RINGS;
import static com.renanabade.darksouls.core.orders.RestrictionEffect.ONE_HANDED;
import static com.renanabade.darksouls.core.orders.RestrictionEffect.WEIGHT_ONLY;

import java.util.List;

/**
 * Restrictions some orders hand out (accumulated curse, wager, adaptive squeeze). Drawn from restrictions players actually
 * ran in Dark Souls; interface-only ones (no HUD, alternate controller) and co-op ones are left out.
 */
public final class Restrictions {
    public static final List<Restriction> ALL = List.of(
            new Restriction("no-magic", "Do not cast sorceries, miracles or pyromancies.", WEIGHT_ONLY, Tier.LIGHT),
            new Restriction("no-upgrades", "Do not reinforce your weapons.", WEIGHT_ONLY, Tier.HEAVY),
            new Restriction("one-handed", "Never hold a weapon with both hands.", ONE_HANDED, Tier.MEDIUM),
            new Restriction("no-rings", "Do not wear rings.", NO_RINGS, Tier.LIGHT),
            new Restriction("no-level-ups", "Do not level up.", NO_LEVEL_UPS, Tier.HEAVY),
            new Restriction("no-ranged", "Do not use bows, crossbows or throwing items.", WEIGHT_ONLY, Tier.LIGHT),
            new Restriction("no-summons", "Do not summon help.", WEIGHT_ONLY, Tier.LIGHT),
            new Restriction("no-consumables", "Do not use consumable items.", WEIGHT_ONLY, Tier.MEDIUM),
            new Restriction("no-buffs", "Do not buff your weapon or yourself.", WEIGHT_ONLY, Tier.LIGHT),
            new Restriction("no-estus", "Do not drink Estus.", WEIGHT_ONLY, Tier.HEAVY),
            new Restriction("no-rolling", "Do not roll.", WEIGHT_ONLY, Tier.HEAVY),
            new Restriction("no-shield", "Do not use a shield, and do not block.", WEIGHT_ONLY, Tier.MEDIUM),
            new Restriction("no-armor", "Do not wear armor.", WEIGHT_ONLY, Tier.MEDIUM),

            // Not among the DS1 runs of the list, but run in other games of the series: variety for players who have done
            // the usual ones.
            new Restriction("no-lock-on", "Do not lock on to enemies.", WEIGHT_ONLY, Tier.MEDIUM),
            new Restriction("no-parry", "Do not parry.", WEIGHT_ONLY, Tier.LIGHT));

    private Restrictions() {}

    /** The restriction of an id, or null. */
    public static Restriction find(String id) {
        for (var restriction : ALL) {
            if (restriction.id().equals(id)) return restriction;
        }

        return null;
    }
}
