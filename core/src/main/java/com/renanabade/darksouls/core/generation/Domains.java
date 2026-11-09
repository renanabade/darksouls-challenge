package com.renanabade.darksouls.core.generation;

import com.renanabade.darksouls.core.Element;
import java.util.List;
import java.util.Map;

/**
 * What the generator draws from, read once per world.
 *
 * @param areasWithArmor areas with armor to pick up, the only ones where "wear what you find" asks anything
 * @param errands equipment and spells to pick up from a corpse or chest, by area (location names)
 * @param chestsByArea how many chests each area holds, for areas with at least two
 * @param bonfiresByArea the bonfires of each area with more than one, by location name
 * @param bossesBeforeBell bosses the first bell does not need: defeating one of the others before it asks nothing
 * @param bossElements the elements that hurt each boss, weakest defense first (bosses with none are left out)
 * @param weaponLocationAreas the area of each weapon location, by the location's name
 * @param schools schools of magic some spell of the data set belongs to
 */
public record Domains(
        List<String> areas,
        List<String> areasWithWeapons,
        List<String> areasWithArmor,
        List<String> areasWithPickups,
        List<String> areasWithBonfires,
        List<String> areasWithLizards,
        Map<String, List<String>> errands,
        Map<String, Integer> chestsByArea,
        Map<String, List<String>> bonfiresByArea,
        List<String> bosses,
        List<String> bossesBeforeBell,
        Map<String, List<Element>> bossElements,
        List<String> merchants,
        List<String> weaponLocations,
        Map<String, String> weaponLocationAreas,
        List<String> weaponStyles,
        List<String> schools,
        List<String> lordSouls) {}
