using DarkSoulsChallenge.Core.Orders;

namespace DarkSoulsChallenge.Core.Generation;

/// <summary>What the generator draws from, read once per world.</summary>
public sealed record Domains
{
    public required IReadOnlyList<string> Areas { get; init; }

    public required IReadOnlyList<string> AreasWithWeapons { get; init; }

    /// <summary>Areas with armor to pick up, the only ones where "wear what you find" asks anything.</summary>
    public required IReadOnlyList<string> AreasWithArmor { get; init; }

    public required IReadOnlyList<string> AreasWithPickups { get; init; }

    public required IReadOnlyList<string> AreasWithBonfires { get; init; }

    public required IReadOnlyList<string> AreasWithLizards { get; init; }

    /// <summary>Equipment and spells to pick up from a corpse or chest, by area (location names).</summary>
    public required IReadOnlyDictionary<string, List<string>> Errands { get; init; }

    /// <summary>How many chests each area holds, for areas with at least two.</summary>
    public required IReadOnlyDictionary<string, int> ChestsByArea { get; init; }

    /// <summary>The bonfires of each area with more than one, by location name.</summary>
    public required IReadOnlyDictionary<string, List<string>> BonfiresByArea { get; init; }

    public required IReadOnlyList<string> Bosses { get; init; }

    /// <summary>Bosses the first bell does not need: defeating one of the others before it asks nothing.</summary>
    public required IReadOnlyList<string> BossesBeforeBell { get; init; }

    /// <summary>The elements that hurt each boss, weakest defense first (bosses with none are left out).</summary>
    public required IReadOnlyDictionary<string, List<Element>> BossElements { get; init; }

    public required IReadOnlyList<string> Merchants { get; init; }

    public required IReadOnlyList<string> WeaponLocations { get; init; }

    /// <summary>The area of each weapon location, by the location's name.</summary>
    public required IReadOnlyDictionary<string, string> WeaponLocationAreas { get; init; }

    public required IReadOnlyList<string> WeaponStyles { get; init; }

    /// <summary>Schools of magic some spell of the data set belongs to.</summary>
    public required IReadOnlyList<string> Schools { get; init; }

    public required IReadOnlyList<string> LordSouls { get; init; }
}

/// <summary>The chapter an order is drawn in.</summary>
/// <param name="From">The milestone the chapter starts after.</param>
/// <param name="Until">The milestone that ends it.</param>
/// <param name="Areas">The chapter's areas.</param>
/// <param name="RequiredAreas">The areas its goal needs.</param>
/// <param name="Bosses">The chapter's bosses.</param>
/// <param name="AreasSoFar">Areas of this chapter and the ones before it, where a weapon for it can come from.</param>
public sealed record ChapterContext(
    string From,
    string Until,
    IReadOnlyList<string> Areas,
    IReadOnlyList<string> RequiredAreas,
    IReadOnlyList<string> Bosses,
    IReadOnlyList<string> AreasSoFar);

/// <summary>Where an order is drawn: its difficulty, and the chapter it belongs to (none for the whole journey).</summary>
/// <param name="Difficulty">The difficulty the numbers are drawn at.</param>
/// <param name="LevelsLocked">True when the level cap is the class's level: no order about levels would ask anything.</param>
/// <param name="Chapter">The chapter, or null for the whole journey.</param>
public sealed record DrawContext(Difficulty Difficulty, bool LevelsLocked, ChapterContext? Chapter = null);

/// <summary>
/// Draws the parameters of an order from the game data. Every list is sorted before it is drawn from, so the result
/// depends only on the seed. Count ranges live in the catalog; they and the curse budgets are first estimates, to tune
/// by playing.
/// </summary>
public static class Draw
{
    /// <summary>The ends of the five stretches of a run.</summary>
    private static readonly string[] StretchEnds =
        ["bell-undead-parish", "both-bells", "lordvessel-obtained", "lordvessel-placed", "kiln-open"];

    private const string RunStart = "boss-asylum-demon";

    private static readonly string[] Conditions =
        ["on your first attempt", "without drinking Estus", "without summoning help"];

    /// <summary>
    /// Fewest corpse and chest pickups an area needs for "nothing from the ground" to cost anything: it was once drawn
    /// for areas with two items.
    /// </summary>
    private const int MinPickups = 5;

    /// <summary>What an errand sends the player for: equipment and spells, not consumables or keys.</summary>
    private static readonly HashSet<string> ErrandKinds = new(StringComparer.Ordinal) { "weapon", "armor", "ring", "spell" };

    /// <summary>The restriction no chapter takes: levels are the level orders' business, and they last the whole run.</summary>
    private const string NotForAChapter = "no-level-ups";

    /// <summary>
    /// The accumulated curse is drawn by weight, not by size: each tier costs points, and each difficulty has a budget and
    /// the tiers it may draw from. An easy curse holds only light restrictions; an extreme one can stack the heavy ones.
    /// </summary>
    private static int TierCost(Tier tier) => tier switch
    {
        Tier.Light => 1,
        Tier.Medium => 2,
        _ => 3,
    };

    private static (int Budget, Tier[] Tiers) Curse(Difficulty difficulty) => difficulty switch
    {
        Difficulty.Easy => (2, [Tier.Light]),
        Difficulty.Medium => (4, [Tier.Light, Tier.Medium]),
        Difficulty.Hard => (7, [Tier.Light, Tier.Medium, Tier.Heavy]),
        _ => (10, [Tier.Light, Tier.Medium, Tier.Heavy]),
    };

    /// <summary>The range a count parameter is drawn from at a difficulty.</summary>
    public static IntRange RangeOf(OrderTemplate template, string param, Difficulty difficulty)
    {
        ArgumentNullException.ThrowIfNull(template);
        return template.Params.GetValueOrDefault(param)?.Ranges?.For(difficulty)
            ?? throw new InvalidOperationException($"no range for {template.Id}.{param}");
    }

    /// <summary>
    /// A curse built in layers, one per difficulty up to the given one: the easy layer first, then what the medium budget
    /// adds, and so on, each taking restrictions in the given order while they fit. So the curse grows harder boss by
    /// boss, and fitting a harder curse to an easier difficulty gives back exactly its first layers, never an empty list:
    /// what the group handicap relies on.
    /// </summary>
    public static List<string> FitCurse(IReadOnlyList<string> ids, Difficulty difficulty)
    {
        ArgumentNullException.ThrowIfNull(ids);
        var fitted = new List<string>();
        var spent = 0;
        foreach (var level in Curves.Difficulties.Where(d => d <= difficulty))
        {
            var (budget, tiers) = Curse(level);
            foreach (var id in ids)
            {
                if (Restrictions.Find(id)?.Tier is not { } tier || !tiers.Contains(tier) || fitted.Contains(id)) continue;
                if (spent + TierCost(tier) > budget) continue;
                fitted.Add(id);
                spent += TierCost(tier);
            }
        }

        return fitted;
    }

    public static Domains DomainsOf(World world)
    {
        ArgumentNullException.ThrowIfNull(world);
        return (Domains)world.GeneratorCache.GetOrAdd("domains", _ => ReadDomains(world));
    }

    private static List<string> SortedSet(IEnumerable<string> items) =>
        items.Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToList();

    private static Domains ReadDomains(World world)
    {
        string? AreaOf(string region) => world.Regions.GetValueOrDefault(region)?.Area;
        IEnumerable<string> AreasIn(IEnumerable<Location> locations) => locations.Select(l => AreaOf(l.Region)).OfType<string>();

        var found = world.Locations.Where(l => l.Found == true).ToList();
        var bonfires = world.Locations.Where(l => l.Category == "BONFIRE").ToList();
        var stableBonfires = bonfires.Where(l => l.AlwaysLit).ToList();
        var weaponLocations = found.Where(l => world.Weapons.GetValueOrDefault(l.Item) is { } w && Combat.IsMeleeWeapon(w)).ToList();
        var pickups = AreasIn(found).CountBy(a => a, StringComparer.Ordinal).ToList();
        var bell = world.Milestones.GetValueOrDefault("bell-undead-parish");

        // The graph has no boss gates yet: a bell in the same region as a boss can be rung, by the graph, without
        // defeating the boss. Such a boss is taken as one the bell needs.
        var bellRegions = world.Locations
            .Where(l => l.Item.StartsWith("Bell of Awakening", StringComparison.Ordinal))
            .Select(l => l.Region)
            .ToHashSet(StringComparer.Ordinal);
        bool Ringable(Boss boss)
        {
            if (bell is null) return true;

            // The first boss opens the run, a gate the graph does not hold either.
            if (bellRegions.Contains(boss.Region) || $"boss-{boss.Id}" == RunStart) return false;
            var forbidden = new HashSet<string>(StringComparer.Ordinal) { boss.DefeatedItem };
            return Reachability.Walk(world, new ReachOptions { ForbiddenItems = forbidden }).Satisfies(bell.Requires);
        }

        var errands = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        foreach (var area in SortedSet(AreasIn(found)))
        {
            var names = SortedSet(found.Where(l => AreaOf(l.Region) == area && ErrandKinds.Contains(l.Kind ?? "")).Select(l => l.Name));
            if (names.Count > 0) errands[area] = names;
        }

        var bonfiresByArea = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        foreach (var area in SortedSet(AreasIn(stableBonfires)))
        {
            var names = SortedSet(stableBonfires.Where(l => AreaOf(l.Region) == area).Select(l => l.Name));
            if (names.Count > 1) bonfiresByArea[area] = names;
        }

        // Not the bosses the graph lets the run pass without: what "before the boss" holds would be wrong.
        var bossElements = new Dictionary<string, List<Element>>(StringComparer.Ordinal);
        foreach (var boss in world.Bosses.Values)
        {
            if (bellRegions.Contains(boss.Region) || $"boss-{boss.Id}" == RunStart) continue;
            var elements = Combat.ElementalDefenses(boss).Select(d => d.Element).ToList();
            if (elements.Count > 0) bossElements[boss.Id] = elements;
        }

        var weaponLocationAreas = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var location in weaponLocations)
        {
            if (AreaOf(location.Region) is { } area) weaponLocationAreas[location.Name] = area;
        }

        return new Domains
        {
            Areas = SortedSet(world.Regions.Values.Select(r => r.Area).OfType<string>()),
            AreasWithWeapons = SortedSet(AreasIn(weaponLocations)),
            AreasWithArmor = SortedSet(AreasIn(found.Where(l => l.Kind == "armor"))),
            AreasWithPickups = SortedSet(pickups.Where(p => p.Value >= MinPickups).Select(p => p.Key)),
            AreasWithBonfires = SortedSet(AreasIn(bonfires)),
            AreasWithLizards = SortedSet(AreasIn(world.Locations.Where(l => l.Category == Validator.CrystalLizard))),
            Errands = errands,
            ChestsByArea = world.Chests.Select(c => AreaOf(c.Region)).OfType<string>()
                .CountBy(a => a, StringComparer.Ordinal)
                .Where(c => c.Value >= 2)
                .ToDictionary(StringComparer.Ordinal),
            BonfiresByArea = bonfiresByArea,
            Bosses = SortedSet(world.Bosses.Keys),
            BossesBeforeBell = SortedSet(world.Bosses.Values.Where(Ringable).Select(b => b.Id)),
            BossElements = bossElements,
            Merchants = SortedSet(world.Merchants.Keys),
            WeaponLocations = SortedSet(weaponLocations.Select(l => l.Name)),
            WeaponLocationAreas = weaponLocationAreas,
            WeaponStyles = SortedSet(world.Weapons.Values.Where(Combat.IsMeleeWeapon).Select(w => w.Category)),
            Schools = Combat.Schools.Where(s => world.Spells.Values.Any(spell => spell.School == s)).Select(s => s.IdOf()).ToList(),
            LordSouls = SortedSet(world.Locations.Where(l => l.Category == "LORD_SOUL").Select(l => l.Item)),
        };
    }

    /// <summary>Parameters for one order, or null when the order cannot be drawn here.</summary>
    public static OrderArgs? Args(OrderTemplate template, Domains domains, DrawContext context, SeededRandom rng)
    {
        ArgumentNullException.ThrowIfNull(template);
        ArgumentNullException.ThrowIfNull(domains);
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(rng);
        return context.Chapter is { } chapter
            ? InChapter(template, domains, context, chapter, rng)
            : ForJourney(template, domains, context, rng);
    }

    private static int Count(OrderTemplate template, string param, Difficulty difficulty, SeededRandom rng)
    {
        var range = RangeOf(template, param, difficulty);
        return rng.NextInt(range.Min, range.Max);
    }

    private static OrderArgs? ForJourney(OrderTemplate template, Domains domains, DrawContext context, SeededRandom rng)
    {
        var difficulty = context.Difficulty;
        switch (template.Id)
        {
            case "first-weapon-of-area":
                {
                    var area = rng.Pick(domains.AreasWithWeapons);
                    return new() { ["area"] = area, ["until"] = rng.Pick(StretchEnds) };
                }

            case "assigned-weapon":
                {
                    var i = rng.NextInt(0, StretchEnds.Length - 1);
                    return new()
                    {
                        ["from"] = i == 0 ? RunStart : StretchEnds[i - 1],
                        ["until"] = StretchEnds[i],
                        ["location"] = rng.Pick(domains.WeaponLocations),
                    };
                }

            case "wear-what-you-find":
            case "nothing-from-the-ground":
            case "no-bonfire":
            case "forbidden-area":
                return new() { ["area"] = rng.Pick(domains.Areas) };
            case "dry-fight":
            case "boss-before-bell":
                return new() { ["boss"] = rng.Pick(domains.Bosses) };
            case "closed-merchant":
                return new() { ["merchant"] = rng.Pick(domains.Merchants) };
            case "counted-attempts":
                {
                    var attempts = Count(template, "attempts", difficulty, rng);
                    return new() { ["attempts"] = attempts, ["boss"] = rng.Pick(domains.Bosses) };
                }

            case "run-lives":
                return new() { ["deaths"] = Count(template, "deaths", difficulty, rng) };
            case "accumulated-curse":
                {
                    var ids = Restrictions.All.Select(r => r.Id)
                        .Where(id => !(context.LevelsLocked && id == "no-level-ups"))
                        .Order(StringComparer.Ordinal);
                    return new() { ["restrictions"] = FitCurse(rng.Shuffle(ids), difficulty) };
                }

            case "phase-swap":
                {
                    // Schools of magic from medium up: switching to magic costs attributes, a catalyst and spells to buy,
                    // which punishes a casual player and is the novelty a bored veteran looks for.
                    var styles = domains.WeaponStyles
                        .Concat(difficulty == Difficulty.Easy ? [] : domains.Schools)
                        .Order(StringComparer.Ordinal);
                    var shuffled = rng.Shuffle(styles);
                    return new()
                    {
                        ["milestone"] = rng.Pick(StretchEnds[..^1]),
                        ["before"] = shuffled.Count > 0 ? shuffled[0] : "",
                        ["after"] = shuffled.Count > 1 ? shuffled[1] : "",
                    };
                }

            case "lord-order":
                return new() { ["order"] = rng.Shuffle(domains.LordSouls) };
            case "earned-levels":
                {
                    if (context.LevelsLocked) return null;
                    var condition = rng.Pick(Conditions);
                    return new() { ["condition"] = condition, ["points"] = Count(template, "points", difficulty, rng) };
                }

            case "earned-upgrades":
                return [];
            default:
                return null;
        }
    }

    /// <summary>
    /// An order of one chapter: its area or boss comes from the chapter, and a phase is the chapter itself. An easy chapter
    /// keeps to the areas its goal needs: a casual player may never visit a detour, and an order there would ask nothing
    /// of them.
    /// </summary>
    private static OrderArgs? InChapter(OrderTemplate template, Domains domains, DrawContext context, ChapterContext chapter, SeededRandom rng)
    {
        var difficulty = context.Difficulty;
        var pool = difficulty == Difficulty.Easy && chapter.RequiredAreas.Count > 0 ? chapter.RequiredAreas : chapter.Areas;
        string? AreaFrom(ICollection<string> domain)
        {
            var areas = pool.Where(domain.Contains).ToList();
            return areas.Count > 0 ? rng.Pick(areas) : null;
        }

        string? PickBoss() => chapter.Bosses.Count > 0 ? rng.Pick(chapter.Bosses) : null;
        static OrderArgs? One(string name, string? value) => value is null ? null : new() { [name] = value };

        switch (template.Id)
        {
            case "first-weapon-of-area":
                return AreaFrom(domains.AreasWithWeapons.ToList()) is { } weaponArea
                    ? new() { ["area"] = weaponArea, ["until"] = chapter.Until }
                    : null;
            case "assigned-weapon":
                {
                    var locations = domains.WeaponLocations
                        .Where(name => chapter.AreasSoFar.Contains(domains.WeaponLocationAreas.GetValueOrDefault(name) ?? ""))
                        .ToList();
                    if (locations.Count == 0) return null;
                    return new() { ["from"] = chapter.From, ["until"] = chapter.Until, ["location"] = rng.Pick(locations) };
                }

            case "wear-what-you-find":
                return One("area", AreaFrom(domains.AreasWithArmor.ToList()));
            case "nothing-from-the-ground":
                return One("area", AreaFrom(domains.AreasWithPickups.ToList()));
            case "no-bonfire":
                return One("area", AreaFrom(domains.AreasWithBonfires.ToList()));
            case "lizard-hunt":
                return AreaFrom(domains.AreasWithLizards.ToList()) is { } lizardArea
                    ? new() { ["area"] = lizardArea, ["until"] = chapter.Until }
                    : null;
            case "every-chest":
                return AreaFrom(domains.ChestsByArea.Keys.ToList()) is { } chestArea
                    ? new() { ["area"] = chestArea, ["chests"] = domains.ChestsByArea[chestArea], ["until"] = chapter.Until }
                    : null;
            case "errand":
                return AreaFrom(domains.Errands.Keys.ToList()) is { } errandArea
                    ? new() { ["location"] = rng.Pick(domains.Errands[errandArea]), ["until"] = chapter.Until }
                    : null;

            // A detour of the chapter, or a way through it that has another: the graph decides which.
            case "the-other-way":
                {
                    var areas = chapter.Areas.Where(a => !chapter.RequiredAreas.Contains(a)).ToList();
                    return areas.Count > 0 ? new() { ["area"] = rng.Pick(areas), ["until"] = chapter.Until } : null;
                }

            case "one-bonfire":
                return AreaFrom(domains.BonfiresByArea.Keys.ToList()) is { } bonfireArea
                    ? new() { ["area"] = bonfireArea, ["bonfire"] = rng.Pick(domains.BonfiresByArea[bonfireArea]) }
                    : null;
            case "dry-fight":
                return One("boss", PickBoss());
            case "counted-attempts":
                {
                    if (PickBoss() is not { } boss) return null;
                    return new() { ["attempts"] = Count(template, "attempts", difficulty, rng), ["boss"] = boss };
                }

            // The element comes from the boss: the one it defends worst, or the one it resists most (when that is another
            // element).
            case "exploit-weakness":
            case "against-the-grain":
                {
                    var weakest = template.Id == "exploit-weakness";
                    var options = chapter.Bosses
                        .Where(b => domains.BossElements.GetValueOrDefault(b)?.Count > (weakest ? 0 : 1))
                        .ToList();
                    if (options.Count == 0) return null;
                    var boss = rng.Pick(options);
                    var elements = domains.BossElements[boss];
                    return new() { ["boss"] = boss, ["element"] = (weakest ? elements[0] : elements[^1]).IdOf() };
                }

            case "boss-before-bell":
                {
                    // A boss of this chapter: with detours drawn among chapters, the others may be met later.
                    var bosses = domains.BossesBeforeBell.Where(chapter.Bosses.Contains).ToList();
                    return bosses.Count > 0 ? new() { ["boss"] = rng.Pick(bosses) } : null;
                }

            case "chapter-restriction":
                {
                    var tiers = Curse(difficulty).Tiers;
                    var ids = Restrictions.All
                        .Where(r => tiers.Contains(r.Tier) && r.Id != NotForAChapter)
                        .Select(r => r.Id)
                        .Order(StringComparer.Ordinal)
                        .ToList();
                    return new() { ["from"] = chapter.From, ["until"] = chapter.Until, ["restriction"] = rng.Pick(ids) };
                }

            default:
                return null;
        }
    }
}
