package com.renanabade.darksouls.core;

import java.util.List;

/**
 * A merchant.
 *
 * @param regions regions holding this merchant's shop locations; a virtual region is shared by every merchant selling there
 */
public record Merchant(String id, String name, List<String> regions) {}
