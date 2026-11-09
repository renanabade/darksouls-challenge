package com.renanabade.darksouls.core;

import java.util.List;

/**
 * A part of a boss.
 *
 * @param noDamage elements that deal this part no damage at all
 * @param defense flat defense per element: the higher, the less of it gets through; may be null
 */
public record BossPart(List<Element> noDamage, ElementValues defense) {}
