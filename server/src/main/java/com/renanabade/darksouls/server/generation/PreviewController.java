package com.renanabade.darksouls.server.generation;

import com.renanabade.darksouls.core.InvalidOrderException;
import com.renanabade.darksouls.core.World;
import com.renanabade.darksouls.core.generation.ChallengeCode;
import com.renanabade.darksouls.core.generation.ChallengeLink;
import com.renanabade.darksouls.core.generation.ChallengeView;
import com.renanabade.darksouls.core.generation.GenerationRequest;
import com.renanabade.darksouls.core.generation.Generator;
import com.renanabade.darksouls.core.generation.GeneratorConfig;
import com.renanabade.darksouls.core.generation.Manual;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Challenges to read, not to keep: what the site shows while a player browses. Nothing is stored, so the same code answers on any
 * server. Unlike a stored challenge, a code from another version is read, and comes with a notice saying it now gives another one.
 */
@RestController
@RequestMapping("/api/previews")
public class PreviewController {
    private final World world;

    /**
     * A challenge as a page shows it.
     *
     * @param code the code to show and share, in its canonical form; null when there is no challenge
     * @param notices what was wrong, or what will not match what the player expects
     * @param view the challenge; null when there is none
     */
    public record PreviewResponse(String code, List<String> notices, ChallengeView view) {}

    public PreviewController(World world) {
        this.world = world;
    }

    /** The challenge a link asks for: its query, as the page's own address holds it. */
    @GetMapping
    PreviewResponse fromLink(@RequestParam Map<String, String> query) {
        var reading = ChallengeLink.read(world, query, GenerationRequest::drawSeed);
        if (reading.config() == null) return new PreviewResponse(null, reading.notices(), null);
        return draw(reading.config(), reading.notices());
    }

    /** The challenge of a form: a typed code, or settings with a new seed. */
    @PostMapping
    PreviewResponse fromForm(@RequestBody CreateChallengeRequest request) {
        List<String> notices = new ArrayList<>();
        GeneratorConfig config;
        if (request.code() != null && !request.code().isBlank()) {
            var reading = ChallengeCode.decode(world, request.code());
            if (!reading.ok()) return new PreviewResponse(null, List.of("That code cannot be read: " + reading.problem() + "."), null);
            config = reading.decoded().config();
            if (!reading.decoded().isCurrent()) notices.add(ChallengeLink.versionNotice(world, reading.decoded()));
        } else {
            config = new GeneratorConfig(
                    GenerationRequest.drawSeed(),
                    request.difficulty(),
                    request.length(),
                    request.curve(),
                    request.startingClass() == null || request.startingClass().isEmpty() ? null : request.startingClass(),
                    request.giftRow(),
                    request.levelCap());
        }

        if (config.levelCap() != null && (config.levelCap() <= 0 || config.levelCap() > ChallengeCode.MAX_LEVEL_CAP)) {
            return new PreviewResponse(null, List.of("The level cap must be from 1 to " + ChallengeCode.MAX_LEVEL_CAP + "."), null);
        }

        return draw(config, notices);
    }

    private PreviewResponse draw(GeneratorConfig config, List<String> notices) {
        try {
            var challenge = Generator.generate(world, config);
            return new PreviewResponse(challenge.code(), notices, Manual.describe(world, challenge));
        } catch (IllegalArgumentException | IllegalStateException | InvalidOrderException error) {
            List<String> all = new ArrayList<>(notices);
            all.add("No challenge could be generated: " + error.getMessage());
            return new PreviewResponse(null, all, null);
        }
    }
}
