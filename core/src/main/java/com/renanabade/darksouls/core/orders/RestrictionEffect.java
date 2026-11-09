package com.renanabade.darksouls.core.orders;

/**
 * WeightOnly never makes a run impossible. OneHanded: Strength no longer counts 1.5 times for requirements. NoLevelUps: no
 * attribute points. NoRings: rings cannot be used; the ones the run needs become automatic exceptions.
 */
public enum RestrictionEffect {
    WEIGHT_ONLY,
    ONE_HANDED,
    NO_LEVEL_UPS,
    NO_RINGS
}
