package com.renanabade.darksouls.core;

/** A fixed point of the progression (a boss, a bell, the Lordvessel...), as a requirement on the graph. */
public record Milestone(String id, String name, String kind, Requirement requires) {}
