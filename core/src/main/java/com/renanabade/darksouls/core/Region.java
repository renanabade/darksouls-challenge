package com.renanabade.darksouls.core;

/** A region of the graph. The area is null only for virtual shop-logic nodes. */
public record Region(String id, String name, String area, boolean mandatory, boolean isVirtual) {}
