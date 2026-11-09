package com.renanabade.darksouls.core.generation;

import java.util.List;

/**
 * A chapter of the journey: the stretch of the run that ends at a milestone, with the areas and bosses the player meets on the
 * way. Chapters are derived from the world graph, never typed in by hand.
 *
 * @param goal the milestone that ends the chapter
 * @param areas areas first met in this chapter (by id, sorted)
 * @param requiredAreas the areas of the chapter its goal cannot be reached without; the rest are detours
 * @param bosses bosses whose arena lies in the chapter (by id, sorted)
 */
public record Chapter(String goal, List<String> areas, List<String> requiredAreas, List<String> bosses) {}
