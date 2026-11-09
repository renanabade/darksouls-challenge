package com.renanabade.darksouls.core.orders;

public enum ParamKind {
    AREA,
    BOSS,
    MILESTONE,
    MERCHANT,
    WEAPON,
    WEAPON_LOCATION,
    COUNT,
    CONDITION,
    RESTRICTION,
    RESTRICTION_LIST,
    EQUIPMENT_SET,
    LORD_SOUL_ORDER,

    /** A damage element other than physical: magic, fire or thunder (lightning). */
    ELEMENT,

    /** A bonfire, by the name of its location ("AL: Darkmoon Tomb Bonfire"). */
    BONFIRE,

    /** A number read from the game data, not drawn by difficulty (how many chests an area holds). */
    TALLY,

    /** An item location, by name: a corpse or chest pickup. */
    LOCATION
}
