using System.Text.Json;
using System.Text.RegularExpressions;

namespace DarkSoulsChallenge.Core;

public sealed class WorldParseException(IReadOnlyList<string> problems)
    : Exception($"invalid data set ({problems.Count} problems):\n{string.Join('\n', problems)}")
{
    public IReadOnlyList<string> Problems { get; } = problems;
}

/// <summary>
/// Turns the data set into a <see cref="World"/>, checking shapes and cross-file references: every region id points
/// to a region, every "has" names an obtainable item, start and goal exist.
/// </summary>
public static partial class WorldParser
{
    /// <summary>Throws a <see cref="WorldParseException"/> listing every problem found.</summary>
    public static World Parse(RawDataSet raw)
    {
        ArgumentNullException.ThrowIfNull(raw);
        var check = new Checker();

        var meta = check.Object(raw.Meta, "meta") ?? Checker.NoFields;
        var start = check.String(meta, "start", "meta");
        var goal = check.String(meta, "goal", "meta");

        var regions = new OrderedDictionary<string, Region>(StringComparer.Ordinal);
        foreach (var (value, i) in check.Array(raw.Regions, "regions").Select((v, i) => (v, i)))
        {
            var path = $"regions[{i}]";
            if (check.Object(value, path) is not { } fields) continue;
            var region = new Region
            {
                Id = check.String(fields, "id", path),
                Name = check.String(fields, "name", path),
                Area = check.NullableString(fields, "area", path),
                Mandatory = check.Boolean(fields, "mandatory", path),
                Virtual = check.Boolean(fields, "virtual", path, false),
            };
            if (regions.ContainsKey(region.Id)) check.Fail($"{path}.id", $"duplicate region \"{region.Id}\"");
            regions[region.Id] = region;
        }

        var entrances = new List<Entrance>();
        foreach (var (value, i) in check.Array(raw.Entrances, "entrances").Select((v, i) => (v, i)))
        {
            var path = $"entrances[{i}]";
            if (check.Object(value, path) is not { } fields) continue;
            entrances.Add(new Entrance
            {
                From = check.String(fields, "from", path),
                To = check.String(fields, "to", path),
                Requires = check.Requirement(Checker.Get(fields, "requires"), $"{path}.requires"),
                WalkBack = check.Boolean(fields, "walkBack", path, true),
                Before = Checker.Get(fields, "before") is null ? null : check.String(fields, "before", path),
            });
        }

        var locations = new List<Location>();
        foreach (var (value, i) in check.Array(raw.Locations, "locations").Select((v, i) => (v, i)))
        {
            var path = $"locations[{i}]";
            if (check.Object(value, path) is not { } fields) continue;
            locations.Add(ParseLocation(check, fields, path));
        }

        var gifts = new List<StartingGift>();
        var classes = check.Object(raw.Classes, "classes") ?? Checker.NoFields;
        foreach (var (value, i) in check.Array(Checker.Get(classes, "gifts"), "classes.gifts").Select((v, i) => (v, i)))
        {
            var path = $"classes.gifts[{i}]";
            if (check.Object(value, path) is not { } fields) continue;
            var items = new List<GiftItem>();
            var itemList = check.Array(Checker.Get(fields, "items"), $"{path}.items");
            foreach (var (text, j) in itemList.Select((t, j) => (t, j)))
            {
                if (text.ValueKind != JsonValueKind.String || text.GetString() is not { Length: > 0 } itemText)
                {
                    check.Fail($"{path}.items[{j}]", "expected a non-empty string");
                    continue;
                }

                if (ParseGiftItem(itemText) is { } item) items.Add(item);
            }

            gifts.Add(new StartingGift(check.Integer(fields, "row", path), items));
        }

        // Cross-file references. Shape problems above already have their own message, so empty ids are skipped.
        var obtainable = locations.Select(l => l.Item)
            .Concat(gifts.SelectMany(g => g.Items.Select(i => i.Item)))
            .ToHashSet(StringComparer.Ordinal);
        void CheckRegion(string id, string path)
        {
            if (id.Length > 0 && !regions.ContainsKey(id)) check.Fail(path, $"unknown region \"{id}\"");
        }

        CheckRegion(start, "meta.start");
        if (goal.Length > 0 && !locations.Any(l => l.Item == goal))
        {
            check.Fail("meta.goal", $"goal \"{goal}\" is not an item of any location");
        }

        foreach (var (e, i) in entrances.Select((e, i) => (e, i)))
        {
            var path = $"entrances[{i}]";
            CheckRegion(e.From, $"{path}.from");
            CheckRegion(e.To, $"{path}.to");
            foreach (var id in e.Requires.Regions()) CheckRegion(id, $"{path}.requires");
            foreach (var item in e.Requires.Items())
            {
                if (!obtainable.Contains(item)) check.Fail($"{path}.requires", $"item \"{item}\" cannot be obtained");
            }
        }

        foreach (var (l, i) in locations.Select((l, i) => (l, i))) CheckRegion(l.Region, $"locations[{i}].region");

        var bosses = ParseBosses(check, raw.Bosses, r =>
            locations.Where(l => l.Category == "BOSS" && l.Region == r).Select(l => l.Item).ToList());
        foreach (var (b, i) in bosses.Values.Select((b, i) => (b, i))) CheckRegion(b.Region, $"bosses[{i}].region");

        var merchants = new OrderedDictionary<string, Merchant>(StringComparer.Ordinal);
        foreach (var (value, i) in check.Array(raw.Merchants, "merchants").Select((v, i) => (v, i)))
        {
            var path = $"merchants[{i}]";
            if (check.Object(value, path) is not { } fields) continue;
            var id = check.String(fields, "id", path);
            var merchantRegions = new List<string>();
            var regionList = check.Array(Checker.Get(fields, "regions"), $"{path}.regions");
            foreach (var (r, j) in regionList.Select((r, j) => (r, j)))
            {
                if (r.ValueKind != JsonValueKind.String || r.GetString() is not { Length: > 0 } regionId)
                {
                    check.Fail($"{path}.regions[{j}]", "expected a non-empty string");
                    continue;
                }

                CheckRegion(regionId, $"{path}.regions[{j}]");
                merchantRegions.Add(regionId);
            }

            if (merchants.ContainsKey(id)) check.Fail($"{path}.id", $"duplicate merchant \"{id}\"");
            merchants[id] = new Merchant(id, check.String(fields, "name", path), merchantRegions);
        }

        var milestones = new OrderedDictionary<string, Milestone>(StringComparer.Ordinal);
        foreach (var (value, i) in check.OptionalArray(raw.Milestones, "milestones").Select((v, i) => (v, i)))
        {
            var path = $"milestones[{i}]";
            if (check.Object(value, path) is not { } fields) continue;
            var milestone = new Milestone(
                check.String(fields, "id", path),
                check.String(fields, "name", path),
                check.String(fields, "kind", path),
                check.Requirement(Checker.Get(fields, "requires"), $"{path}.requires"));
            foreach (var item in milestone.Requires.Items())
            {
                if (!obtainable.Contains(item)) check.Fail($"{path}.requires", $"item \"{item}\" cannot be obtained");
            }

            if (milestones.ContainsKey(milestone.Id)) check.Fail($"{path}.id", $"duplicate milestone \"{milestone.Id}\"");
            milestones[milestone.Id] = milestone;
        }

        var weapons = ParseWeapons(check, raw.Weapons);
        var spells = ParseSpells(check, raw.Spells);
        var classList = ParseClasses(check, Checker.Get(classes, "classes"));

        var areas = new OrderedDictionary<string, Area>(StringComparer.Ordinal);
        foreach (var (value, i) in check.OptionalArray(raw.Areas, "areas").Select((v, i) => (v, i)))
        {
            var path = $"areas[{i}]";
            if (check.Object(value, path) is not { } fields) continue;
            var area = new Area(
                check.String(fields, "id", path),
                check.String(fields, "name", path),
                check.Boolean(fields, "dlc", path));
            areas[area.Id] = area;
        }

        var chests = new List<Chest>();
        foreach (var (value, i) in check.OptionalArray(raw.Treasures, "treasures").Select((v, i) => (v, i)))
        {
            var path = $"treasures[{i}]";
            if (check.Object(value, path) is not { } fields) continue;
            if (check.String(fields, "container", path) != "chest") continue;
            if (check.Boolean(fields, "rescue", path) || check.Boolean(fields, "deathDrop", path)) continue;
            var id = check.String(fields, "region", path);
            CheckRegion(id, $"{path}.region");
            chests.Add(new Chest(id));
        }

        var warnings = new List<NpcWarning>();
        foreach (var (value, i) in check.OptionalArray(raw.Warnings, "warnings").Select((v, i) => (v, i)))
        {
            var path = $"warnings[{i}]";
            if (check.Object(value, path) is not { } fields) continue;
            warnings.Add(new NpcWarning(
                check.String(fields, "id", path),
                check.String(fields, "npc", path),
                check.String(fields, "text", path)));
        }

        if (check.Problems.Count > 0) throw new WorldParseException(check.Problems);
        return new World
        {
            DataVersion = Checker.Get(meta, "dataVersion") is { ValueKind: JsonValueKind.String } version
                ? version.GetString() ?? ""
                : "",
            Start = start,
            Goal = goal,
            Regions = regions,
            Entrances = entrances,
            Locations = locations,
            Gifts = gifts,
            Bosses = bosses,
            Merchants = merchants,
            Milestones = milestones,
            Weapons = weapons,
            Spells = spells,
            Classes = classList,
            Areas = areas,
            Chests = chests,
            Warnings = warnings,
        };
    }

    private static Location ParseLocation(Checker check, JsonElement fields, string path)
    {
        var name = check.String(fields, "name", path);
        var region = check.String(fields, "region", path);
        var item = check.String(fields, "item", path);
        var count = check.Integer(fields, "count", path);
        var category = check.String(fields, "category", path);
        var mandatory = check.Boolean(fields, "mandatory", path);
        var found = Checker.Get(fields, "found") is null ? (bool?)null : check.Boolean(fields, "found", path);
        var kind = Checker.Get(fields, "kind") is null ? null : check.String(fields, "kind", path);

        List<BonfireWindow>? unavailable = null;
        if (Checker.Get(fields, "unavailable") is { } windows)
        {
            unavailable = [];
            foreach (var (w, j) in check.Array(windows, $"{path}.unavailable").Select((w, j) => (w, j)))
            {
                var at = $"{path}.unavailable[{j}]";
                if (check.Object(w, at) is not { } window) continue;
                unavailable.Add(new BonfireWindow
                {
                    From = check.Requirement(Checker.Get(window, "from"), $"{at}.from"),
                    Until = Checker.Get(window, "until") is { ValueKind: JsonValueKind.Null }
                        ? null
                        : check.Requirement(Checker.Get(window, "until"), $"{at}.until"),
                    Why = check.String(window, "why", at),
                });
            }
        }

        return new Location
        {
            Name = name,
            Region = region,
            Item = item,
            Count = count,
            Category = category,
            Mandatory = mandatory,
            Found = found,
            Kind = kind,
            Unavailable = unavailable,
        };
    }

    /// <summary>"Black Firebomb x10" gives 10 Black Firebombs; "(none)" gives nothing.</summary>
    private static GiftItem? ParseGiftItem(string text)
    {
        if (text == "(none)") return null;
        var match = GiftCount().Match(text);
        return match.Success
            ? new GiftItem(match.Groups[1].Value, int.Parse(match.Groups[2].ValueSpan, provider: null))
            : new GiftItem(text, 1);
    }

    private static OrderedDictionary<string, Weapon> ParseWeapons(Checker check, JsonElement? raw)
    {
        var weapons = new OrderedDictionary<string, Weapon>(StringComparer.Ordinal);
        foreach (var (value, i) in check.OptionalArray(raw, "weapons").Select((v, i) => (v, i)))
        {
            var path = $"weapons[{i}]";
            if (check.Object(value, path) is not { } fields) continue;
            var req = check.Object(Checker.Get(fields, "req"), $"{path}.req") ?? Checker.NoFields;
            var damage = check.Object(Checker.Get(fields, "baseDamage"), $"{path}.baseDamage") ?? Checker.NoFields;
            var hands = check.Object(Checker.Get(fields, "hands"), $"{path}.hands") ?? Checker.NoFields;
            // Absent in small test worlds: nothing casts.
            var casts = Checker.Get(fields, "casts") is { } castFields
                ? check.Object(castFields, $"{path}.casts") ?? Checker.NoFields
                : Checker.NoFields;
            var weapon = new Weapon
            {
                Id = check.Integer(fields, "id", path),
                Name = check.String(fields, "name", path),
                Category = check.String(fields, "category", path),
                Melee = check.Boolean(fields, "melee", path),
                TwoHandable = check.Boolean(hands, "both", $"{path}.hands"),
                Requirements = new Stats(
                    check.Integer(req, "str", $"{path}.req"),
                    check.Integer(req, "dex", $"{path}.req"),
                    check.Integer(req, "int", $"{path}.req"),
                    check.Integer(req, "fth", $"{path}.req"),
                    0),
                Damage = ParseDamage(check, damage, $"{path}.baseDamage"),
                Casts = Combat.Schools.Where(s => check.Boolean(casts, s.IdOf(), $"{path}.casts", false)).ToList(),
            };
            // Unique weapons have one row per reinforcement level under the same name. The lowest id is the base
            // weapon, the one found in the world.
            if (!weapons.TryGetValue(weapon.Name, out var known) || weapon.Id < known.Id)
            {
                weapons[weapon.Name] = weapon;
            }
        }

        return weapons;
    }

    private static OrderedDictionary<string, StartingClass> ParseClasses(Checker check, JsonElement? raw)
    {
        var classes = new OrderedDictionary<string, StartingClass>(StringComparer.Ordinal);
        foreach (var (value, i) in check.OptionalArray(raw, "classes.classes").Select((v, i) => (v, i)))
        {
            var path = $"classes.classes[{i}]";
            if (check.Object(value, path) is not { } fields) continue;
            var stats = check.Object(Checker.Get(fields, "stats"), $"{path}.stats") ?? Checker.NoFields;
            var name = check.String(fields, "name", path);
            // The full kit: equipment by slot, and spells. Absent in small test worlds.
            var kit = Checker.Get(fields, "fullKit") is { } fullKit
                ? check.Object(fullKit, path) ?? Checker.NoFields
                : Checker.NoFields;
            var equipment = Checker.Get(kit, "equipment") is { } slots
                ? check.Object(slots, $"{path}.fullKit.equipment") ?? Checker.NoFields
                : Checker.NoFields;
            classes[name] = new StartingClass
            {
                Name = name,
                Level = check.Integer(fields, "level", path),
                Stats = new Stats(
                    check.Integer(stats, "strength", $"{path}.stats"),
                    check.Integer(stats, "dexterity", $"{path}.stats"),
                    check.Integer(stats, "intelligence", $"{path}.stats"),
                    check.Integer(stats, "faith", $"{path}.stats"),
                    check.Integer(stats, "attunement", $"{path}.stats")),
                Kit =
                [
                    .. check.Strings(equipment.EnumerateObject().Select(p => p.Value), $"{path}.fullKit.equipment"),
                    .. check.Strings(
                        check.OptionalArray(Checker.Get(kit, "spells"), $"{path}.fullKit.spells"),
                        $"{path}.fullKit.spells"),
                ],
                Items = check.Strings(
                    check.OptionalArray(Checker.Get(kit, "items"), $"{path}.fullKit.items"),
                    $"{path}.fullKit.items"),
            };
        }

        return classes;
    }

    private static OrderedDictionary<string, Spell> ParseSpells(Checker check, JsonElement? raw)
    {
        var spells = new OrderedDictionary<string, Spell>(StringComparer.Ordinal);
        foreach (var (value, i) in check.OptionalArray(raw, "spells").Select((v, i) => (v, i)))
        {
            var path = $"spells[{i}]";
            if (check.Object(value, path) is not { } fields) continue;
            var req = check.Object(Checker.Get(fields, "req"), $"{path}.req") ?? Checker.NoFields;
            var damage = check.Object(Checker.Get(fields, "damage"), $"{path}.damage") ?? Checker.NoFields;
            var schoolId = check.String(fields, "school", path);
            var known = Combat.Schools.Where(s => s.IdOf() == schoolId).Select(s => (School?)s).FirstOrDefault();
            if (known is null) check.Fail($"{path}.school", $"unknown school \"{schoolId}\"");
            var spell = new Spell
            {
                Name = check.String(fields, "name", path),
                Item = check.String(fields, "item", path),
                School = known ?? School.Sorcery,
                Intelligence = check.Integer(req, "int", $"{path}.req"),
                Faith = check.Integer(req, "fth", $"{path}.req"),
                Slots = check.Integer(fields, "slots", path),
                Damage = ParseDamage(check, damage, $"{path}.damage"),
            };
            spells[spell.Name] = spell;
        }

        return spells;
    }

    /// <summary>Bosses, each linked to the BOSS location of its region.</summary>
    private static OrderedDictionary<string, Boss> ParseBosses(
        Checker check,
        JsonElement? raw,
        Func<string, List<string>> deathItems)
    {
        var bosses = new OrderedDictionary<string, Boss>(StringComparer.Ordinal);
        foreach (var (value, i) in check.Array(raw, "bosses").Select((v, i) => (v, i)))
        {
            var path = $"bosses[{i}]";
            if (check.Object(value, path) is not { } fields) continue;
            var id = check.String(fields, "id", path);
            var region = check.String(fields, "region", path);
            var deaths = region.Length == 0 ? [] : deathItems(region);
            if (region.Length > 0 && deaths.Count != 1)
            {
                check.Fail($"{path}.region", $"expected one BOSS location in \"{region}\", found {deaths.Count}");
            }

            var parts = new List<BossPart>();
            var partList = check.OptionalArray(Checker.Get(fields, "parts"), $"{path}.parts");
            foreach (var (part, j) in partList.Select((p, j) => (p, j)))
            {
                var partPath = $"{path}.parts[{j}]";
                var partFields = check.Object(part, partPath) ?? Checker.NoFields;
                var noDamage = new List<Element>();
                var names = check.Strings(
                    check.OptionalArray(Checker.Get(partFields, "noDamage"), $"{partPath}.noDamage"),
                    $"{partPath}.noDamage");
                foreach (var name in names)
                {
                    if (ElementNamed(name) is { } element) noDamage.Add(element);
                    else check.Fail($"{partPath}.noDamage", $"unknown element \"{name}\"");
                }

                // Absent in small test worlds and before data 0.6.0.
                var defense = Checker.Get(partFields, "defense") is { } defenseFields
                    && check.Object(defenseFields, $"{partPath}.defense") is { } rawDefense
                        ? ParseDamage(check, rawDefense, $"{partPath}.defense")
                        : (ElementValues?)null;
                parts.Add(new BossPart { NoDamage = noDamage, Defense = defense });
            }

            if (bosses.ContainsKey(id)) check.Fail($"{path}.id", $"duplicate boss \"{id}\"");
            bosses[id] = new Boss
            {
                Id = id,
                Name = check.String(fields, "name", path),
                Region = region,
                DefeatedItem = deaths.Count > 0 ? deaths[0] : "",
                Parts = parts,
            };
        }

        return bosses;
    }

    private static ElementValues ParseDamage(Checker check, JsonElement fields, string path) => new(
        check.Number(fields, "phys", path),
        check.Number(fields, "magic", path),
        check.Number(fields, "fire", path),
        check.Number(fields, "thunder", path));

    /// <summary>Element names as bosses.json writes them.</summary>
    private static Element? ElementNamed(string name) => name switch
    {
        "phys" => Element.Physical,
        "mag" or "magic" => Element.Magic,
        "fire" => Element.Fire,
        "thunder" => Element.Thunder,
        _ => null,
    };

    [GeneratedRegex(@"^(.+) x(\d+)$", RegexOptions.CultureInvariant)]
    private static partial Regex GiftCount();
}
