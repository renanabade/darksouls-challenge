package com.renanabade.darksouls.core;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.function.ToIntFunction;

/** Character builds: whether a weapon can be wielded within a level cap, and whether it hurts a boss. */
public final class Combat {
    /** Attunement a character needs for one spell slot. */
    public static final int ATTUNEMENT_FOR_ONE_SLOT = 10;

    /** The elements besides physical damage. */
    public static final List<Element> ELEMENTAL = List.of(Element.MAGIC, Element.FIRE, Element.THUNDER);

    /** In the order the data set and the challenges rely on. */
    public static final List<School> SCHOOLS = List.of(School.MIRACLE, School.PYROMANCY, School.SORCERY);

    private static final Set<String> NOT_A_WEAPON =
            Set.of("shield", "catalyst/talisman/flame", "bow", "crossbow", "arrow", "bolt");

    /** An element and how well a boss defends against it. */
    public record ElementDefense(Element element, double defense) {}

    private Combat() {}

    /** Weapons that can be "your weapon": melee, and not a shield, a catalyst or ammunition. */
    public static boolean isMeleeWeapon(Weapon weapon) {
        return weapon.melee() && !NOT_A_WEAPON.contains(weapon.category());
    }

    /**
     * Strength a character needs to meet a requirement. With both hands, Strength counts 1.5 times, rounded down: the
     * least s with floor(1.5 s) >= r is ceil(2r / 3).
     */
    public static int strengthNeeded(int requirement, boolean twoHanded) {
        return twoHanded ? (int) Math.ceil(2.0 * requirement / 3) : requirement;
    }

    /**
     * Attribute points a character must still spend to wield every one of the weapons (one build for all of them:
     * attributes only grow, so each needs its highest requirement). Each weapon is held with both hands when that needs
     * less Strength, unless twoHanding is off.
     */
    public static int pointsToWield(Collection<Weapon> weapons, Stats stats, boolean twoHanding) {
        return lacking(weapons, w -> strengthNeeded(w.requirements().strength(), twoHanding && w.twoHandable()), stats.strength())
                + lacking(weapons, w -> w.requirements().dexterity(), stats.dexterity())
                + lacking(weapons, w -> w.requirements().intelligence(), stats.intelligence())
                + lacking(weapons, w -> w.requirements().faith(), stats.faith())
                + lacking(weapons, w -> w.requirements().attunement(), stats.attunement());
    }

    public static int pointsToWield(Collection<Weapon> weapons, Stats stats) {
        return pointsToWield(weapons, stats, true);
    }

    private static int lacking(Collection<Weapon> weapons, ToIntFunction<Weapon> need, int have) {
        var highest = 0;
        for (var weapon : weapons) highest = Math.max(highest, need.applyAsInt(weapon));
        return Math.max(0, highest - have);
    }

    /**
     * A boss's defense against each element that hurts every part of it (the mean over its parts), weakest first. Empty
     * when the data set has no defenses for it.
     */
    public static List<ElementDefense> elementalDefenses(Boss boss) {
        var parts = boss.parts();
        if (parts.isEmpty() || parts.stream().anyMatch(p -> p.defense() == null)) return List.of();

        List<ElementDefense> defenses = new ArrayList<>();
        for (var element : ELEMENTAL) {
            if (parts.stream().anyMatch(p -> p.noDamage().contains(element))) continue;

            // A plain loop: DoubleStream.sum compensates its rounding, and would not give the same number.
            var sum = 0.0;
            for (var part : parts) sum += part.defense().of(element);
            defenses.add(new ElementDefense(element, sum / parts.size()));
        }

        defenses.sort(Comparator.comparingDouble(ElementDefense::defense));
        return defenses;
    }

    /** True when the weapon hurts every part of the boss: some element of its damage is not nullified there. */
    public static boolean damages(Weapon weapon, Boss boss) {
        for (var part : boss.parts()) {
            var hurts = false;
            for (var element : Element.values()) {
                if (weapon.damage().of(element) > 0 && !part.noDamage().contains(element)) {
                    hurts = true;
                    break;
                }
            }

            if (!hurts) return false;
        }

        return true;
    }

    /**
     * A spell cast with a catalyst, as something to fight with: the requirements of both, the attunement for one slot, and
     * the spell's damage. Only one-slot spells: the attunement needed for two slots is not confirmed, and leaving them out
     * can only refuse a possible challenge, never accept an impossible one. Null when the catalyst cannot cast the spell.
     */
    public static Weapon spellKit(Spell spell, Weapon catalyst) {
        if (spell.slots() != 1 || !catalyst.casts().contains(spell.school())) return null;
        var requirements = catalyst.requirements();
        return new Weapon(
                catalyst.id(),
                spell.name() + " (with " + catalyst.name() + ")",
                spell.school().id(),
                false,
                catalyst.twoHandable(),
                new Stats(
                        requirements.strength(),
                        requirements.dexterity(),
                        Math.max(requirements.intelligence(), spell.intelligence()),
                        Math.max(requirements.faith(), spell.faith()),
                        ATTUNEMENT_FOR_ONE_SLOT),
                spell.damage(),
                List.of());
    }
}
