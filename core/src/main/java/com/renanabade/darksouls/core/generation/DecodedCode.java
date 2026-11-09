package com.renanabade.darksouls.core.generation;

/**
 * What a challenge code holds, and whether it was made by this generator and data set.
 *
 * @param config the settings the code stands for, in this world
 * @param generatorVersion the generator that made the code
 * @param dataVersion the data set that made the code, as the code writes it ("07")
 * @param isCurrent false when another generator or data set made it: the same code then gives another challenge
 */
public record DecodedCode(GeneratorConfig config, String generatorVersion, String dataVersion, boolean isCurrent) {}
