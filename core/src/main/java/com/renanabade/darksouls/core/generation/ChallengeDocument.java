package com.renanabade.darksouls.core.generation;

import com.renanabade.darksouls.core.Setup;
import com.renanabade.darksouls.core.World;
import java.util.List;

/**
 * A generated challenge as it is stored and served: plain JSON, with the manual already rendered.
 *
 * @param code what the player shares
 * @param manual the manual in Markdown
 */
public record ChallengeDocument(
        GeneratorConfig config,
        String code,
        String dataVersion,
        String generatorVersion,
        Setup setup,
        Curve curve,
        List<ChapterPlan> chapters,
        List<OrderDocument> orders,
        String manual) {
    public static ChallengeDocument from(World world, Challenge challenge) {
        return new ChallengeDocument(
                challenge.config(),
                challenge.code(),
                challenge.dataVersion(),
                Generator.VERSION,
                challenge.setup(),
                challenge.curve(),
                challenge.chapters(),
                challenge.orders().stream()
                        .map(o -> new OrderDocument(o.template().id(), o.chapter(), o.args(), o.exceptions(), Manual.orderText(world, o)))
                        .toList(),
                Manual.render(world, challenge));
    }
}
