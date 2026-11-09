package com.renanabade.darksouls.core.orders;

/** A text that replaces the order's when a count parameter is zero ("Do not die." for 0 deaths). */
public record TextIfZero(String param, String text) {}
