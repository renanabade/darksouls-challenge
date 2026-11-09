package com.renanabade.darksouls.core.generation;

import java.util.List;

/**
 * What a link asks for: a challenge, if it can tell one, and what the player should know about the link.
 *
 * @param config the challenge to generate; null when the link asks for none, or its code cannot be read
 * @param code the code to show and share, in its canonical form
 * @param notices what was wrong with the link, or what will not match what the player expects
 */
public record LinkReading(GeneratorConfig config, String code, List<String> notices) {}
