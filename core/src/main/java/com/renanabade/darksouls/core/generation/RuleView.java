package com.renanabade.darksouls.core.generation;

/** A rule as the player reads it, numbered across the manual so players can refer to "rule 14". */
public record RuleView(int number, String title, String text, String advice) {}
