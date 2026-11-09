package com.renanabade.darksouls.core;

/**
 * A spell.
 *
 * @param item the name the item has in the world ("Sorcery: Soul Arrow")
 * @param slots attunement slots it takes
 */
public record Spell(String name, String item, School school, int intelligence, int faith, int slots, ElementValues damage) {}
