package com.renanabade.darksouls.core.orders;

/** How long an order lasts. String fields name parameters. */
public sealed interface Scope {
    record Run() implements Scope {}

    /** Between two milestones. Without from it starts when the trigger fires; without until it lasts to the end. */
    record Phase(MilestoneRef from, MilestoneRef until) implements Scope {}

    record InArea(String area) implements Scope {}

    record Fight(String boss) implements Scope {}

    record UntilNextMilestone() implements Scope {}
}
