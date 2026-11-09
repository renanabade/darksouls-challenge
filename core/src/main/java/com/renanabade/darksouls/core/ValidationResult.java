package com.renanabade.darksouls.core;

import java.util.List;

/**
 * The answer for a set of orders.
 *
 * @param problems why the set is impossible; empty otherwise
 * @param orders one result per order, in the order given
 * @param complete true when every order was checked; a generator must not hand out a challenge with pending orders
 */
public record ValidationResult(Verdict verdict, List<String> problems, List<OrderResult> orders, boolean complete) {}
