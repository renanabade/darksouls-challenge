package com.renanabade.darksouls.core;

import java.util.List;

/**
 * A weapon.
 *
 * @param twoHandable can be held with both hands (Strength then counts 1.5 times for requirements)
 * @param damage base damage per element at +0
 * @param casts the schools of magic it casts, if it is a catalyst, a talisman or a pyromancy flame
 */
public record Weapon(
        int id,
        String name,
        String category,
        boolean melee,
        boolean twoHandable,
        Stats requirements,
        ElementValues damage,
        List<School> casts) {}
