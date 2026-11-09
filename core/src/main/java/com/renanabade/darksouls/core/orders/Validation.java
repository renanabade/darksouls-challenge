package com.renanabade.darksouls.core.orders;

/**
 * WeightOnly never makes the run impossible, only costs difficulty or friction. Existence: at least one way to comply
 * exists. WorstCase: every choice the player may make still complies. AutoException: the graph lists what the order would
 * forbid but the game requires, and the manual excepts it. ActualCase: checked against what the player reported; live only.
 */
public enum Validation {
    WEIGHT_ONLY,
    EXISTENCE,
    WORST_CASE,
    AUTO_EXCEPTION,
    ACTUAL_CASE
}
