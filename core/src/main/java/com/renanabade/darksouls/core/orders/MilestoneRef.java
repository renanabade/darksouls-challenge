package com.renanabade.darksouls.core.orders;

import java.util.List;

/** A milestone filled in by the generator, a fixed one, or whichever of several comes first. */
public sealed interface MilestoneRef {
    record Param(String name) implements MilestoneRef {}

    record Fixed(String id) implements MilestoneRef {}

    record FirstOf(List<String> ids) implements MilestoneRef {}
}
