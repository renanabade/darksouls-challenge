package com.renanabade.darksouls.core;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.regex.Pattern;
import tools.jackson.databind.JsonNode;

/**
 * Turns the data set into a {@link World}, checking shapes and cross-file references: every region id points to a region,
 * every "has" names an obtainable item, start and goal exist.
 */
public final class WorldParser {
    private static final Pattern GIFT_COUNT = Pattern.compile("^(.+) x(\\d+)$");

    private WorldParser() {}

    /** Throws a {@link WorldParseException} listing every problem found. */
    public static World parse(RawDataSet raw) {
        var check = new Checker();

        var meta = check.objectOrNone(raw.meta(), "meta");
        var start = check.string(meta, "start", "meta");
        var goal = check.string(meta, "goal", "meta");

        Map<String, Region> regions = new LinkedHashMap<>();
        var regionList = check.array(raw.regions(), "regions");
        for (var i = 0; i < regionList.size(); i++) {
            var path = "regions[" + i + "]";
            var fields = check.object(regionList.get(i), path);
            if (fields == null) continue;
            var region = new Region(
                    check.string(fields, "id", path),
                    check.string(fields, "name", path),
                    check.nullableString(fields, "area", path),
                    check.bool(fields, "mandatory", path),
                    check.bool(fields, "virtual", path, false));
            if (regions.containsKey(region.id())) check.fail(path + ".id", "duplicate region \"" + region.id() + "\"");
            regions.put(region.id(), region);
        }

        List<Entrance> entrances = new ArrayList<>();
        var entranceList = check.array(raw.entrances(), "entrances");
        for (var i = 0; i < entranceList.size(); i++) {
            var path = "entrances[" + i + "]";
            var fields = check.object(entranceList.get(i), path);
            if (fields == null) continue;
            entrances.add(new Entrance(
                    check.string(fields, "from", path),
                    check.string(fields, "to", path),
                    check.requirement(Checker.get(fields, "requires"), path + ".requires"),
                    check.bool(fields, "walkBack", path, true),
                    Checker.get(fields, "before") == null ? null : check.string(fields, "before", path)));
        }

        List<Location> locations = new ArrayList<>();
        var locationList = check.array(raw.locations(), "locations");
        for (var i = 0; i < locationList.size(); i++) {
            var path = "locations[" + i + "]";
            var fields = check.object(locationList.get(i), path);
            if (fields == null) continue;
            locations.add(parseLocation(check, fields, path));
        }

        List<StartingGift> gifts = new ArrayList<>();
        var classes = check.objectOrNone(raw.classes(), "classes");
        var giftList = check.array(Checker.get(classes, "gifts"), "classes.gifts");
        for (var i = 0; i < giftList.size(); i++) {
            var path = "classes.gifts[" + i + "]";
            var fields = check.object(giftList.get(i), path);
            if (fields == null) continue;
            List<GiftItem> items = new ArrayList<>();
            var itemList = check.array(Checker.get(fields, "items"), path + ".items");
            for (var j = 0; j < itemList.size(); j++) {
                var text = itemList.get(j);
                if (!text.isString() || text.stringValue().isEmpty()) {
                    check.fail(path + ".items[" + j + "]", "expected a non-empty string");
                    continue;
                }

                var item = parseGiftItem(text.stringValue());
                if (item != null) items.add(item);
            }

            gifts.add(new StartingGift(check.integer(fields, "row", path), List.copyOf(items)));
        }

        // Cross-file references. Shape problems above already have their own message, so empty ids are skipped.
        Set<String> obtainable = new HashSet<>();
        for (var location : locations) obtainable.add(location.item());
        for (var gift : gifts) gift.items().forEach(item -> obtainable.add(item.item()));

        checkRegion(check, regions, start, "meta.start");
        if (!goal.isEmpty() && locations.stream().noneMatch(l -> l.item().equals(goal))) {
            check.fail("meta.goal", "goal \"" + goal + "\" is not an item of any location");
        }

        for (var i = 0; i < entrances.size(); i++) {
            var path = "entrances[" + i + "]";
            var e = entrances.get(i);
            checkRegion(check, regions, e.from(), path + ".from");
            checkRegion(check, regions, e.to(), path + ".to");
            for (var id : e.requires().regions()) checkRegion(check, regions, id, path + ".requires");
            for (var item : e.requires().items()) {
                if (!obtainable.contains(item)) check.fail(path + ".requires", "item \"" + item + "\" cannot be obtained");
            }
        }

        for (var i = 0; i < locations.size(); i++) {
            checkRegion(check, regions, locations.get(i).region(), "locations[" + i + "].region");
        }

        var bosses = parseBosses(check, raw.bosses(), r -> locations.stream()
                .filter(l -> l.category().equals("BOSS") && l.region().equals(r))
                .map(Location::item)
                .toList());
        var bossIndex = 0;
        for (var boss : bosses.values()) {
            checkRegion(check, regions, boss.region(), "bosses[" + bossIndex + "].region");
            bossIndex++;
        }

        Map<String, Merchant> merchants = new LinkedHashMap<>();
        var merchantList = check.array(raw.merchants(), "merchants");
        for (var i = 0; i < merchantList.size(); i++) {
            var path = "merchants[" + i + "]";
            var fields = check.object(merchantList.get(i), path);
            if (fields == null) continue;
            var id = check.string(fields, "id", path);
            List<String> merchantRegions = new ArrayList<>();
            var list = check.array(Checker.get(fields, "regions"), path + ".regions");
            for (var j = 0; j < list.size(); j++) {
                var r = list.get(j);
                if (!r.isString() || r.stringValue().isEmpty()) {
                    check.fail(path + ".regions[" + j + "]", "expected a non-empty string");
                    continue;
                }

                checkRegion(check, regions, r.stringValue(), path + ".regions[" + j + "]");
                merchantRegions.add(r.stringValue());
            }

            if (merchants.containsKey(id)) check.fail(path + ".id", "duplicate merchant \"" + id + "\"");
            merchants.put(id, new Merchant(id, check.string(fields, "name", path), List.copyOf(merchantRegions)));
        }

        Map<String, Milestone> milestones = new LinkedHashMap<>();
        var milestoneList = check.optionalArray(raw.milestones(), "milestones");
        for (var i = 0; i < milestoneList.size(); i++) {
            var path = "milestones[" + i + "]";
            var fields = check.object(milestoneList.get(i), path);
            if (fields == null) continue;
            var milestone = new Milestone(
                    check.string(fields, "id", path),
                    check.string(fields, "name", path),
                    check.string(fields, "kind", path),
                    check.requirement(Checker.get(fields, "requires"), path + ".requires"));
            for (var item : milestone.requires().items()) {
                if (!obtainable.contains(item)) check.fail(path + ".requires", "item \"" + item + "\" cannot be obtained");
            }

            if (milestones.containsKey(milestone.id())) check.fail(path + ".id", "duplicate milestone \"" + milestone.id() + "\"");
            milestones.put(milestone.id(), milestone);
        }

        var weapons = parseWeapons(check, raw.weapons());
        var spells = parseSpells(check, raw.spells());
        var classMap = parseClasses(check, Checker.get(classes, "classes"));

        Map<String, Area> areas = new LinkedHashMap<>();
        var areaList = check.optionalArray(raw.areas(), "areas");
        for (var i = 0; i < areaList.size(); i++) {
            var path = "areas[" + i + "]";
            var fields = check.object(areaList.get(i), path);
            if (fields == null) continue;
            var area = new Area(check.string(fields, "id", path), check.string(fields, "name", path), check.bool(fields, "dlc", path));
            areas.put(area.id(), area);
        }

        List<Chest> chests = new ArrayList<>();
        var treasureList = check.optionalArray(raw.treasures(), "treasures");
        for (var i = 0; i < treasureList.size(); i++) {
            var path = "treasures[" + i + "]";
            var fields = check.object(treasureList.get(i), path);
            if (fields == null) continue;
            if (!check.string(fields, "container", path).equals("chest")) continue;
            if (check.bool(fields, "rescue", path) || check.bool(fields, "deathDrop", path)) continue;
            var id = check.string(fields, "region", path);
            checkRegion(check, regions, id, path + ".region");
            chests.add(new Chest(id));
        }

        List<NpcWarning> warnings = new ArrayList<>();
        var warningList = check.optionalArray(raw.warnings(), "warnings");
        for (var i = 0; i < warningList.size(); i++) {
            var path = "warnings[" + i + "]";
            var fields = check.object(warningList.get(i), path);
            if (fields == null) continue;
            warnings.add(new NpcWarning(
                    check.string(fields, "id", path),
                    check.string(fields, "npc", path),
                    check.string(fields, "text", path)));
        }

        if (!check.problems.isEmpty()) throw new WorldParseException(check.problems);
        var version = Checker.get(meta, "dataVersion");
        return new World(
                version != null && version.isString() ? version.stringValue() : "",
                start,
                goal,
                regions,
                entrances,
                locations,
                gifts,
                bosses,
                merchants,
                milestones,
                weapons,
                spells,
                classMap,
                areas,
                chests,
                warnings);
    }

    private static void checkRegion(Checker check, Map<String, Region> regions, String id, String path) {
        if (!id.isEmpty() && !regions.containsKey(id)) check.fail(path, "unknown region \"" + id + "\"");
    }

    private static Location parseLocation(Checker check, JsonNode fields, String path) {
        var name = check.string(fields, "name", path);
        var region = check.string(fields, "region", path);
        var item = check.string(fields, "item", path);
        var count = check.integer(fields, "count", path);
        var category = check.string(fields, "category", path);
        var mandatory = check.bool(fields, "mandatory", path);
        Boolean found = Checker.get(fields, "found") == null ? null : check.bool(fields, "found", path);
        var kind = Checker.get(fields, "kind") == null ? null : check.string(fields, "kind", path);

        List<BonfireWindow> unavailable = null;
        var windows = Checker.get(fields, "unavailable");
        if (windows != null) {
            unavailable = new ArrayList<>();
            var list = check.array(windows, path + ".unavailable");
            for (var j = 0; j < list.size(); j++) {
                var at = path + ".unavailable[" + j + "]";
                var window = check.object(list.get(j), at);
                if (window == null) continue;
                var until = Checker.get(window, "until");
                unavailable.add(new BonfireWindow(
                        check.requirement(Checker.get(window, "from"), at + ".from"),
                        until != null && until.isNull() ? null : check.requirement(until, at + ".until"),
                        check.string(window, "why", at)));
            }
        }

        return new Location(name, region, item, count, category, mandatory, found, kind, unavailable);
    }

    /** "Black Firebomb x10" gives 10 Black Firebombs; "(none)" gives nothing. */
    private static GiftItem parseGiftItem(String text) {
        if (text.equals("(none)")) return null;
        var match = GIFT_COUNT.matcher(text);
        return match.matches() ? new GiftItem(match.group(1), Integer.parseInt(match.group(2))) : new GiftItem(text, 1);
    }

    private static Map<String, Weapon> parseWeapons(Checker check, JsonNode raw) {
        Map<String, Weapon> weapons = new LinkedHashMap<>();
        var list = check.optionalArray(raw, "weapons");
        for (var i = 0; i < list.size(); i++) {
            var path = "weapons[" + i + "]";
            var fields = check.object(list.get(i), path);
            if (fields == null) continue;
            var req = check.objectOrNone(Checker.get(fields, "req"), path + ".req");
            var damage = check.objectOrNone(Checker.get(fields, "baseDamage"), path + ".baseDamage");
            var hands = check.objectOrNone(Checker.get(fields, "hands"), path + ".hands");

            // Absent in small test worlds: nothing casts.
            var castFields = Checker.get(fields, "casts");
            var casts = castFields != null ? check.objectOrNone(castFields, path + ".casts") : Checker.NO_FIELDS;
            var id = check.integer(fields, "id", path);
            var name = check.string(fields, "name", path);
            var category = check.string(fields, "category", path);
            var melee = check.bool(fields, "melee", path);
            var twoHandable = check.bool(hands, "both", path + ".hands");
            var requirements = new Stats(
                    check.integer(req, "str", path + ".req"),
                    check.integer(req, "dex", path + ".req"),
                    check.integer(req, "int", path + ".req"),
                    check.integer(req, "fth", path + ".req"),
                    0);
            var values = parseDamage(check, damage, path + ".baseDamage");
            List<School> schools = new ArrayList<>();
            for (var school : Combat.SCHOOLS) {
                if (check.bool(casts, school.id(), path + ".casts", false)) schools.add(school);
            }

            var weapon = new Weapon(id, name, category, melee, twoHandable, requirements, values, List.copyOf(schools));

            // Unique weapons have one row per reinforcement level under the same name. The lowest id is the base
            // weapon, the one found in the world.
            var known = weapons.get(name);
            if (known == null || id < known.id()) weapons.put(name, weapon);
        }

        return weapons;
    }

    private static Map<String, StartingClass> parseClasses(Checker check, JsonNode raw) {
        Map<String, StartingClass> classes = new LinkedHashMap<>();
        var list = check.optionalArray(raw, "classes.classes");
        for (var i = 0; i < list.size(); i++) {
            var path = "classes.classes[" + i + "]";
            var fields = check.object(list.get(i), path);
            if (fields == null) continue;
            var stats = check.objectOrNone(Checker.get(fields, "stats"), path + ".stats");
            var name = check.string(fields, "name", path);

            // The full kit: equipment by slot, and spells. Absent in small test worlds.
            var fullKit = Checker.get(fields, "fullKit");
            var kit = fullKit != null ? check.objectOrNone(fullKit, path) : Checker.NO_FIELDS;
            var slots = Checker.get(kit, "equipment");
            var equipment = slots != null ? check.objectOrNone(slots, path + ".fullKit.equipment") : Checker.NO_FIELDS;
            var level = check.integer(fields, "level", path);
            var values = new Stats(
                    check.integer(stats, "strength", path + ".stats"),
                    check.integer(stats, "dexterity", path + ".stats"),
                    check.integer(stats, "intelligence", path + ".stats"),
                    check.integer(stats, "faith", path + ".stats"),
                    check.integer(stats, "attunement", path + ".stats"));
            List<String> kitList = new ArrayList<>(check.strings(equipment.values(), path + ".fullKit.equipment"));
            kitList.addAll(check.strings(check.optionalArray(Checker.get(kit, "spells"), path + ".fullKit.spells"), path + ".fullKit.spells"));
            var items = check.strings(check.optionalArray(Checker.get(kit, "items"), path + ".fullKit.items"), path + ".fullKit.items");
            classes.put(name, new StartingClass(name, level, values, List.copyOf(kitList), List.copyOf(items)));
        }

        return classes;
    }

    private static Map<String, Spell> parseSpells(Checker check, JsonNode raw) {
        Map<String, Spell> spells = new LinkedHashMap<>();
        var list = check.optionalArray(raw, "spells");
        for (var i = 0; i < list.size(); i++) {
            var path = "spells[" + i + "]";
            var fields = check.object(list.get(i), path);
            if (fields == null) continue;
            var req = check.objectOrNone(Checker.get(fields, "req"), path + ".req");
            var damage = check.objectOrNone(Checker.get(fields, "damage"), path + ".damage");
            var schoolId = check.string(fields, "school", path);
            School known = null;
            for (var school : Combat.SCHOOLS) {
                if (school.id().equals(schoolId)) {
                    known = school;
                    break;
                }
            }

            if (known == null) check.fail(path + ".school", "unknown school \"" + schoolId + "\"");
            var spell = new Spell(
                    check.string(fields, "name", path),
                    check.string(fields, "item", path),
                    known == null ? School.SORCERY : known,
                    check.integer(req, "int", path + ".req"),
                    check.integer(req, "fth", path + ".req"),
                    check.integer(fields, "slots", path),
                    parseDamage(check, damage, path + ".damage"));
            spells.put(spell.name(), spell);
        }

        return spells;
    }

    /** Bosses, each linked to the BOSS location of its region. */
    private static Map<String, Boss> parseBosses(Checker check, JsonNode raw, Function<String, List<String>> deathItems) {
        Map<String, Boss> bosses = new LinkedHashMap<>();
        var list = check.array(raw, "bosses");
        for (var i = 0; i < list.size(); i++) {
            var path = "bosses[" + i + "]";
            var fields = check.object(list.get(i), path);
            if (fields == null) continue;
            var id = check.string(fields, "id", path);
            var region = check.string(fields, "region", path);
            List<String> deaths = region.isEmpty() ? List.of() : deathItems.apply(region);
            if (!region.isEmpty() && deaths.size() != 1) {
                check.fail(path + ".region", "expected one BOSS location in \"" + region + "\", found " + deaths.size());
            }

            List<BossPart> parts = new ArrayList<>();
            var partList = check.optionalArray(Checker.get(fields, "parts"), path + ".parts");
            for (var j = 0; j < partList.size(); j++) {
                var partPath = path + ".parts[" + j + "]";
                var partFields = check.objectOrNone(partList.get(j), partPath);
                List<Element> noDamage = new ArrayList<>();
                var names = check.strings(check.optionalArray(Checker.get(partFields, "noDamage"), partPath + ".noDamage"), partPath + ".noDamage");
                for (var name : names) {
                    var element = elementNamed(name);
                    if (element != null) noDamage.add(element);
                    else check.fail(partPath + ".noDamage", "unknown element \"" + name + "\"");
                }

                // Absent in small test worlds and before data 0.6.0.
                ElementValues defense = null;
                var defenseFields = Checker.get(partFields, "defense");
                if (defenseFields != null) {
                    var rawDefense = check.object(defenseFields, partPath + ".defense");
                    if (rawDefense != null) defense = parseDamage(check, rawDefense, partPath + ".defense");
                }

                parts.add(new BossPart(List.copyOf(noDamage), defense));
            }

            if (bosses.containsKey(id)) check.fail(path + ".id", "duplicate boss \"" + id + "\"");
            bosses.put(id, new Boss(id, check.string(fields, "name", path), region, deaths.isEmpty() ? "" : deaths.get(0), List.copyOf(parts)));
        }

        return bosses;
    }

    private static ElementValues parseDamage(Checker check, JsonNode fields, String path) {
        return new ElementValues(
                check.number(fields, "phys", path),
                check.number(fields, "magic", path),
                check.number(fields, "fire", path),
                check.number(fields, "thunder", path));
    }

    /** Element names as bosses.json writes them. */
    private static Element elementNamed(String name) {
        return switch (name) {
            case "phys" -> Element.PHYSICAL;
            case "mag", "magic" -> Element.MAGIC;
            case "fire" -> Element.FIRE;
            case "thunder" -> Element.THUNDER;
            default -> null;
        };
    }
}
