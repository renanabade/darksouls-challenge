package com.renanabade.darksouls.core.orders;

/** What fires an order. String fields name parameters. */
public sealed interface Trigger {
    record RunStart() implements Trigger {}

    record EnterArea(String area) implements Trigger {}

    /** Entering a boss's arena: the "enter area" trigger, with the area given by the boss. */
    record EnterArena(String boss) implements Trigger {}

    /** Without a boss: any boss. */
    record DefeatBoss(String boss) implements Trigger {}

    record Death() implements Trigger {}

    record PickUp() implements Trigger {}

    record MilestoneReached(MilestoneRef milestone) implements Trigger {}
}
