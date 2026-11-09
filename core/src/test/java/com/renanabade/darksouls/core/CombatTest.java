package com.renanabade.darksouls.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;

class CombatTest {
    private static final Stats TENS = new Stats(10, 10, 10, 10, 10);
    private static final Stats NONE = new Stats(0, 0, 0, 0, 0);
    private static final ElementValues PHYSICAL = new ElementValues(100, 0, 0, 0);

    private static Weapon weapon(Stats requirements, ElementValues damage, String category, boolean melee, boolean twoHandable) {
        return new Weapon(1, "Test Sword", category, melee, twoHandable, requirements, damage, List.of());
    }

    private static Weapon weapon(Stats requirements) {
        return weapon(requirements, PHYSICAL, "sword", true, true);
    }

    @SafeVarargs
    private static Boss bossWithParts(List<Element>... noDamage) {
        return new Boss("b", "Boss", "r", "Boss Defeated", Arrays.stream(noDamage).map(n -> new BossPart(n, null)).toList());
    }

    // Strength counts 1.5 times with both hands, rounded down.
    @Test
    void lets_27_strength_two_hand_a_40_strength_weapon_as_the_game_does() {
        assertEquals(27, Combat.strengthNeeded(40, true));
        assertTrue(Math.floor(26 * 1.5) < 40);
    }

    @Test
    void rounds_the_effective_strength_down() {
        assertEquals(17, Combat.strengthNeeded(25, true)); // 16 * 1.5 = 24 < 25; 17 * 1.5 = 25.5, so 25
        assertEquals(16, Combat.strengthNeeded(24, true));
        assertEquals(24, Combat.strengthNeeded(24, false));
    }

    @Test
    void adds_what_each_requirement_lacks() {
        assertEquals(4 + 2, Combat.pointsToWield(List.of(weapon(new Stats(10, 14, 12, 9, 0))), TENS));
    }

    @Test
    void uses_both_hands_when_that_costs_fewer_points() {
        var requirements = new Stats(30, 0, 0, 0, 0);
        assertEquals(20 - 10, Combat.pointsToWield(List.of(weapon(requirements)), TENS));
        assertEquals(30 - 10, Combat.pointsToWield(List.of(weapon(requirements, PHYSICAL, "sword", true, false)), TENS));
    }

    @Test
    void damage_needs_some_element_that_every_part_of_the_boss_takes() {
        var magicOnly = weapon(NONE, new ElementValues(0, 80, 0, 0), "sword", true, true);
        assertTrue(Combat.damages(weapon(NONE), bossWithParts(List.of(Element.FIRE))));
        assertFalse(Combat.damages(magicOnly, bossWithParts(List.of(Element.MAGIC))));
        assertFalse(Combat.damages(magicOnly, bossWithParts(List.of(), List.of(Element.MAGIC))));
    }

    @Test
    void leaves_out_shields_catalysts_and_ammunition() {
        assertTrue(Combat.isMeleeWeapon(weapon(NONE)));
        assertFalse(Combat.isMeleeWeapon(weapon(NONE, PHYSICAL, "shield", true, true)));
        assertFalse(Combat.isMeleeWeapon(weapon(NONE, PHYSICAL, "arrow", false, true)));
    }

    private static final Weapon CATALYST =
            new Weapon(1, "Catalyst", "catalyst/talisman/flame", false, true, new Stats(6, 0, 10, 0, 0), PHYSICAL, List.of(School.SORCERY));

    private static Spell arrow(School school, int slots) {
        return new Spell("Arrow", "Sorcery: Arrow", school, 14, 0, slots, new ElementValues(0, 150, 0, 0));
    }

    @Test
    void a_spell_fights_with_its_damage_and_needs_both_requirements_and_one_slot_of_attunement() {
        var kit = Combat.spellKit(arrow(School.SORCERY, 1), CATALYST);
        assertEquals(150, kit.damage().magic());
        assertEquals(0, kit.damage().physical());
        assertEquals(new Stats(6, 0, 14, 0, 10), kit.requirements());
        assertEquals(4 + 2, Combat.pointsToWield(List.of(kit), new Stats(10, 10, 10, 10, 8)));
    }

    @Test
    void a_spell_needs_a_catalyst_of_its_school_and_two_slot_spells_are_left_out() {
        assertNull(Combat.spellKit(arrow(School.MIRACLE, 1), CATALYST));
        assertNull(Combat.spellKit(arrow(School.SORCERY, 2), CATALYST));
    }
}
