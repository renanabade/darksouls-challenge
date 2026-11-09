package com.renanabade.darksouls.core.generation;

import com.renanabade.darksouls.core.Setup;
import java.util.List;

/**
 * A generated challenge.
 *
 * @param code what the player shares; in a group, the code of the hardest player's challenge, which holds the structure
 * @param orders the rules of the whole journey first (in catalog order), then each chapter's, chapter by chapter
 */
public record Challenge(
        GeneratorConfig config,
        String code,
        String dataVersion,
        Setup setup,
        Curve curve,
        List<ChapterPlan> chapters,
        List<GeneratedOrder> orders) {}
