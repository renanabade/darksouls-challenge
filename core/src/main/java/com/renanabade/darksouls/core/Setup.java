package com.renanabade.darksouls.core;

import com.renanabade.darksouls.core.orders.Mode;

/** The challenge parameters every check uses. Weapon orders also need the class and the level cap. */
public record Setup(Mode mode, StartingGift gift, String startingClass, Integer levelCap) {
    public Setup(Mode mode, StartingGift gift) {
        this(mode, gift, null, null);
    }

    public Setup withLevelCap(Integer cap) {
        return new Setup(mode, gift, startingClass, cap);
    }
}
