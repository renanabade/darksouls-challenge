package com.renanabade.darksouls.core.generation;

import com.renanabade.darksouls.core.orders.Difficulty;
import java.util.List;

/**
 * A chapter as the challenge plays it: its stretch of the run and its place on the curve.
 *
 * @param goal the milestone that ends the chapter
 * @param goals every milestone the chapter covers, the goal last: more than one in an act of a short journey
 * @param offset steps away from the challenge's difficulty (the curve); shared by every player of a group
 */
public record ChapterPlan(String goal, List<String> goals, List<String> areas, List<String> bosses, int offset, Difficulty difficulty) {
    ChapterPlan withDifficulty(Difficulty value) {
        return new ChapterPlan(goal, goals, areas, bosses, offset, value);
    }

    ChapterPlan withPlaces(List<String> newAreas, List<String> newBosses) {
        return new ChapterPlan(goal, goals, newAreas, newBosses, offset, difficulty);
    }
}
