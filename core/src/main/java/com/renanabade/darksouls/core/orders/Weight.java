package com.renanabade.darksouls.core.orders;

/**
 * What an order costs in the budget of a challenge, on two separate axes: difficulty (skill it demands, 1 to 3) and friction
 * (time, repetition, searching, 0 to 3). Hand-labelled first estimates, to be recalibrated by played results.
 */
public record Weight(int difficulty, int friction) {}
