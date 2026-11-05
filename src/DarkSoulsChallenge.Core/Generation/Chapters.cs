namespace DarkSoulsChallenge.Core.Generation;

/// <summary>
/// A chapter of the journey: the stretch of the run that ends at a milestone, with the areas and bosses the player meets
/// on the way. Chapters are derived from the world graph, never typed in by hand.
/// </summary>
/// <param name="Goal">The milestone that ends the chapter.</param>
/// <param name="Areas">Areas first met in this chapter (by id, sorted).</param>
/// <param name="RequiredAreas">The areas of the chapter its goal cannot be reached without; the rest are detours.</param>
/// <param name="Bosses">Bosses whose arena lies in the chapter (by id, sorted).</param>
public sealed record Chapter(
    string Goal,
    IReadOnlyList<string> Areas,
    IReadOnlyList<string> RequiredAreas,
    IReadOnlyList<string> Bosses);

public static class Chapters
{
    /// <summary>The chapters before the Lord Souls, in the order the game imposes.</summary>
    private static readonly string[] OpeningGoals =
        ["boss-asylum-demon", "bell-undead-parish", "both-bells", "lordvessel-placed"];

    /// <summary>What the chapters of one Lord Soul order share, whatever the seed: the costly part, kept per world.</summary>
    /// <param name="Goals">The milestones that end the chapters.</param>
    /// <param name="Regions">The regions chapters are made of, in world order.</param>
    /// <param name="Required">The chapter of each region some goal needs.</param>
    /// <param name="Open">The first chapter in which each region can be entered at all.</param>
    /// <param name="From">Regions with an entrance into each region.</param>
    /// <param name="Exits">The chapters of the areas with required regions that each area leads into.</param>
    private sealed record Layout(
        IReadOnlyList<Milestone> Goals,
        IReadOnlyList<(string Id, string Area)> Regions,
        IReadOnlyDictionary<string, int> Required,
        IReadOnlyDictionary<string, int> Open,
        IReadOnlyDictionary<string, List<string>> From,
        IReadOnlyDictionary<string, List<int>> Exits);

    /// <summary>
    /// The chapters of a journey whose Lord Souls are taken in the given order (their item names, as in the lord-order
    /// order): the opening chapters, one chapter per Lord Soul, and the last one, to the goal.
    ///
    /// Each region goes to a chapter in two passes. A region the goal of some chapter needs (forbid it, and the goal
    /// cannot be reached) goes to the first such chapter: the Catacombs to Nito's, the Duke's Archives to Seath's. Any
    /// other region (a detour) can go to any chapter from the first one that reaches it from a region already placed, and
    /// in which it can be entered at all (what later chapters hold, their goals and their bosses' deaths, is withheld: the
    /// Painted World waits for Anor Londo's chapter), to the last one before the Kiln. A detour that leads into a later
    /// chapter's required region comes no later than that chapter (the Depths before Blighttown's). Without a generator, a
    /// detour takes its first chapter; with one, an area of detours is drawn among its chapters, smaller chapters first.
    /// </summary>
    public static IReadOnlyList<Chapter> Of(World world, IReadOnlyList<string> lordOrder, SeededRandom? rng = null)
    {
        ArgumentNullException.ThrowIfNull(world);
        ArgumentNullException.ThrowIfNull(lordOrder);
        var layout = LayoutOf(world, lordOrder);
        var (goals, regions, required, open, from, exits) = layout;
        var chapterOf = required.ToDictionary(StringComparer.Ordinal);
        var areaOf = regions.ToDictionary(r => r.Id, r => r.Area, StringComparer.Ordinal);
        var fixedAreas = required.Keys.Where(areaOf.ContainsKey).Select(r => areaOf[r]).ToHashSet(StringComparer.Ordinal);
        var sizes = goals.Select(_ => new HashSet<string>(StringComparer.Ordinal)).ToList();
        foreach (var (region, k) in required) sizes[k].Add(areaOf.GetValueOrDefault(region) ?? region);
        var lastDetour = goals.Count - 2;
        var drawn = new Dictionary<string, int>(StringComparer.Ordinal);

        for (var changed = true; changed;)
        {
            changed = false;
            foreach (var (id, area) in regions)
            {
                if (chapterOf.ContainsKey(id) || !open.TryGetValue(id, out var opens)) continue;
                var placed = from.GetValueOrDefault(id, []).Where(chapterOf.ContainsKey).Select(r => chapterOf[r]).ToList();
                if (placed.Count == 0) continue;
                var earliest = Math.Max(opens, placed.Min());
                var k = earliest;
                if (rng is not null && !fixedAreas.Contains(area))
                {
                    if (!drawn.TryGetValue(area, out var areaChapterDrawn))
                    {
                        var bounds = exits.GetValueOrDefault(area, []).Where(c => c > earliest);
                        var latest = Math.Max(earliest, bounds.Append(lastDetour).Min());
                        var options = Enumerable.Range(earliest, latest - earliest + 1);
                        areaChapterDrawn = rng.WeightedShuffle(options, c => 1 / Math.Pow(1 + sizes[c].Count, 2))[0];
                        drawn[area] = areaChapterDrawn;
                        sizes[areaChapterDrawn].Add(area);
                    }

                    k = Math.Max(earliest, areaChapterDrawn);
                }

                chapterOf[id] = k;
                changed = true;
            }
        }

        // An area belongs to the first chapter that meets it.
        var areaChapter = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var (id, area) in regions)
        {
            if (chapterOf.TryGetValue(id, out var k) && k < areaChapter.GetValueOrDefault(area, int.MaxValue))
            {
                areaChapter[area] = k;
            }
        }

        var requiredAreas = regions
            .Where(r => required.ContainsKey(r.Id) && chapterOf[r.Id] == areaChapter[r.Area])
            .Select(r => r.Area)
            .ToHashSet(StringComparer.Ordinal);

        return goals.Select((goal, k) =>
        {
            var areas = areaChapter.Where(a => a.Value == k).Select(a => a.Key).Order(StringComparer.Ordinal).ToList();
            return new Chapter(
                goal.Id,
                areas,
                areas.Where(requiredAreas.Contains).ToList(),
                world.Bosses.Values
                    .Where(b => chapterOf.TryGetValue(b.Region, out var c) && c == k)
                    .Select(b => b.Id)
                    .Order(StringComparer.Ordinal)
                    .ToList());
        }).ToList();
    }

    private static Layout LayoutOf(World world, IReadOnlyList<string> lordOrder) =>
        (Layout)world.GeneratorCache.GetOrAdd($"layout|{string.Join('|', lordOrder)}", _ => BuildLayout(world, lordOrder));

    private static Layout BuildLayout(World world, IReadOnlyList<string> lordOrder)
    {
        var goals = OpeningGoals.Select(id => MilestoneNamed(world, id))
            .Concat(lordOrder.Select(soul => LordGoal(world, soul)))
            .Append(FinalGoal(world))
            .ToList();
        var regions = world.Regions.Values
            .Where(r => !r.Virtual && r.Area is not null)
            .Select(r => (r.Id, Area: r.Area!))
            .ToList();

        var required = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var (id, _) in regions)
        {
            var without = Reachability.Walk(world, new ReachOptions { ForbiddenRegions = new HashSet<string>(StringComparer.Ordinal) { id } });
            var k = goals.FindIndex(g => !without.Satisfies(g.Requires));
            if (k >= 0) required[id] = k;
        }

        var regionOfBoss = world.Bosses.Values.ToDictionary(b => b.DefeatedItem, b => b.Region, StringComparer.Ordinal);
        var reachBy = goals.Select((_, k) =>
        {
            var withheld = goals.Skip(k + 1).SelectMany(g => g.Requires.Items()).ToHashSet(StringComparer.Ordinal);
            withheld.ExceptWith(goals.Take(k + 1).SelectMany(g => g.Requires.Items()));
            foreach (var (item, region) in regionOfBoss)
            {
                if (required.TryGetValue(region, out var chapter) && chapter > k) withheld.Add(item);
            }

            return Reachability.Walk(world, new ReachOptions { ForbiddenItems = withheld });
        }).ToList();
        var open = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var (id, _) in regions)
        {
            var k = reachBy.FindIndex(r => r.Regions.Contains(id));
            if (k >= 0) open[id] = k;
        }

        var areaOf = regions.ToDictionary(r => r.Id, r => r.Area, StringComparer.Ordinal);

        // An area with a required region is met in the first chapter that needs one of them.
        var fixedChapter = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var (region, k) in required)
        {
            var area = areaOf[region];
            if (k < fixedChapter.GetValueOrDefault(area, int.MaxValue)) fixedChapter[area] = k;
        }

        var from = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        var exits = new Dictionary<string, List<int>>(StringComparer.Ordinal);
        foreach (var e in world.Entrances)
        {
            if (!from.TryGetValue(e.To, out var sources)) from[e.To] = sources = [];
            sources.Add(e.From);
            var area = areaOf.GetValueOrDefault(e.From);
            var into = areaOf.GetValueOrDefault(e.To);
            if (area is not null && into is not null && into != area && fixedChapter.TryGetValue(into, out var k))
            {
                if (!exits.TryGetValue(area, out var chapters)) exits[area] = chapters = [];
                chapters.Add(k);
            }
        }

        return new Layout(goals, regions, required, open, from, exits);
    }

    private static Milestone MilestoneNamed(World world, string id) =>
        world.Milestones.GetValueOrDefault(id)
            ?? throw new InvalidOperationException($"the data set has no milestone \"{id}\"");

    /// <summary>The milestone of placing a Lord Soul: the lord-souls milestone that needs that soul.</summary>
    private static Milestone LordGoal(World world, string soul) =>
        world.Milestones.Values.FirstOrDefault(m => m.Kind == "lord-souls" && m.Requires.Items().Contains(soul))
            ?? throw new InvalidOperationException($"no milestone places \"{soul}\"");

    /// <summary>The milestone of the run's goal (defeating Gwyn).</summary>
    private static Milestone FinalGoal(World world) =>
        world.Milestones.Values.FirstOrDefault(m => m.Kind == "boss" && m.Requires.Items().Contains(world.Goal))
            ?? throw new InvalidOperationException($"no milestone reaches the goal \"{world.Goal}\"");
}
