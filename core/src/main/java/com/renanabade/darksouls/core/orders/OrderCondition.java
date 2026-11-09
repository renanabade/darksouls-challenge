package com.renanabade.darksouls.core.orders;

/** An attribute, not a fourth piece: the order applies only when this holds. */
public sealed interface OrderCondition {
    record AttemptsAtMost(String max) implements OrderCondition {}

    /** A condition drawn by the generator, e.g. "without using Estus". */
    record Drawn(String param) implements OrderCondition {}
}
