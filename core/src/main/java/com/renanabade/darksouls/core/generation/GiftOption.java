package com.renanabade.darksouls.core.generation;

/**
 * A gift a player may choose.
 *
 * @param row the gift's row in the data set
 * @param label lists the gift's items ("Prism Stone x10"), or says "None"
 */
public record GiftOption(int row, String label) {}
