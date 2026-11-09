package com.renanabade.darksouls.core;

/**
 * A stretch of the run in which a bonfire is out or missing.
 *
 * @param from when the bonfire goes out (true: from the start)
 * @param until when it can be rested at again; null when it never comes back, or its return is not modeled
 */
public record BonfireWindow(Requirement from, Requirement until, String why) {}
