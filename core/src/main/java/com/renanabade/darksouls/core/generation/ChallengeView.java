package com.renanabade.darksouls.core.generation;

import com.renanabade.darksouls.core.orders.Difficulty;
import java.util.List;

/**
 * The challenge as the player reads it, in plain data: what the Markdown manual prints and what a page renders, with every name
 * already resolved. A chapter with no rules is left out.
 *
 * @param code the challenge code, the one thing a player shares
 * @param gift "Prism Stone x10"
 * @param definitions only the words the challenge uses
 * @param warnings NPCs the game's scripts can lose or turn, whatever the orders: not orders, just what the game hides
 */
public record ChallengeView(
        String code,
        String generatorVersion,
        String dataVersion,
        String startingClass,
        List<String> gift,
        int levelCap,
        Difficulty difficulty,
        Curve curve,
        Length length,
        List<RuleView> journey,
        List<ChapterView> chapters,
        List<Definition> definitions,
        List<ChallengeWarning> warnings) {}
