package com.renanabade.darksouls.core.generation;

import java.util.List;

/**
 * The chapter an order is drawn in.
 *
 * @param from the milestone the chapter starts after
 * @param until the milestone that ends it
 * @param areas the chapter's areas
 * @param requiredAreas the areas its goal needs
 * @param bosses the chapter's bosses
 * @param areasSoFar areas of this chapter and the ones before it, where a weapon for it can come from
 */
public record ChapterContext(
        String from,
        String until,
        List<String> areas,
        List<String> requiredAreas,
        List<String> bosses,
        List<String> areasSoFar) {}
