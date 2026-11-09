package com.renanabade.darksouls.core;

import java.util.List;

/**
 * How one order was checked.
 *
 * @param id the order's template id
 * @param exceptions items the order must except because the game requires them (automatic exception)
 */
public record OrderResult(String id, Support support, List<String> exceptions) {}
