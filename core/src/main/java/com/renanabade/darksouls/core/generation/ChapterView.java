package com.renanabade.darksouls.core.generation;

import com.renanabade.darksouls.core.orders.Difficulty;
import java.util.List;

/**
 * A chapter as the player reads it.
 *
 * @param heading "Chapter 2: The first bell"; an act of a short journey says "Act"
 * @param until "you ring the bell of the Undead Parish"
 * @param areas area names
 * @param bosses boss names
 * @param difficulty the chapter's place on the curve
 */
public record ChapterView(String heading, String until, List<String> areas, List<String> bosses, Difficulty difficulty, List<RuleView> rules) {}
