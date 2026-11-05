namespace DarkSoulsChallenge.Core;

public sealed record ReachOptions
{
    /// <summary>What the player already holds at the start (a starting gift, for example).</summary>
    public IEnumerable<string>? Items { get; init; }

    /// <summary>Items the player never takes, milestones included ("Taurus Demon Defeated" = never kill Taurus).</summary>
    public IReadOnlySet<string>? ForbiddenItems { get; init; }

    /// <summary>Regions the player never enters.</summary>
    public IReadOnlySet<string>? ForbiddenRegions { get; init; }

    /// <summary>Locations the player never takes from, while the same item elsewhere is still allowed.</summary>
    public IReadOnlySet<Location>? ForbiddenLocations { get; init; }
}

public sealed record Reach(IReadOnlySet<string> Regions, IReadOnlySet<string> Items)
{
    /// <summary>Whether the requirement holds with what this reach holds and has reached.</summary>
    public bool Satisfies(Requirement requirement)
    {
        ArgumentNullException.ThrowIfNull(requirement);
        return requirement.Evaluate(Items.Contains, Regions.Contains);
    }
}

public static class Reachability
{
    /// <summary>
    /// Everything the player can reach from the start, by fixed point: cross every entrance whose requirement
    /// holds, take every item in the regions reached, and repeat until nothing changes. Each round only adds, so
    /// the loop ends after at most one round per region.
    /// </summary>
    public static Reach Walk(World world, ReachOptions? options = null)
    {
        ArgumentNullException.ThrowIfNull(world);
        options ??= new ReachOptions();
        var forbiddenItems = options.ForbiddenItems;
        var forbiddenRegions = options.ForbiddenRegions;
        var forbiddenLocations = options.ForbiddenLocations;
        var startingItems = options.Items?.ToList() ?? [];

        var itemsByRegion = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        foreach (var location in world.Locations)
        {
            if (forbiddenLocations?.Contains(location) == true) continue;
            if (itemsByRegion.TryGetValue(location.Region, out var inRegion)) inRegion.Add(location.Item);
            else itemsByRegion[location.Region] = [location.Item];
        }

        var regions = new HashSet<string>(StringComparer.Ordinal);
        var items = new HashSet<string>(StringComparer.Ordinal);
        void Take(string item)
        {
            if (forbiddenItems?.Contains(item) != true) items.Add(item);
        }

        bool Enter(string region)
        {
            if (regions.Contains(region) || forbiddenRegions?.Contains(region) == true) return false;
            regions.Add(region);
            if (itemsByRegion.TryGetValue(region, out var here)) here.ForEach(Take);
            return true;
        }

        startingItems.ForEach(Take);
        Enter(world.Start);

        // An entrance that must be crossed before an item is held: the player can cross it when it is open in the
        // world without that item. Every state of the walk is one the player reaches with what it holds, so an
        // entrance open while the item is not yet taken is crossable; only otherwise is the world without the item
        // walked, once per item. An item held from the start closes the entrance from the start. Each entrance is
        // judged on its own item: two entrances with different items are not asked to be crossed in one order
        // (ADR 0011).
        var held = startingItems.ToHashSet(StringComparer.Ordinal);
        var without = new Dictionary<string, Reach>(StringComparer.Ordinal);
        bool CrossableBefore(Entrance e)
        {
            if (e.Before is not { } before || forbiddenItems?.Contains(before) == true) return true;
            if (held.Contains(before)) return false;
            if (!items.Contains(before)) return true;
            if (!without.TryGetValue(before, out var early))
            {
                var stricter = new HashSet<string>(forbiddenItems ?? new HashSet<string>(), StringComparer.Ordinal) { before };
                early = Walk(world, options with { ForbiddenItems = stricter });
                without[before] = early;
            }

            return early.Regions.Contains(e.To);
        }

        Func<string, bool> has = items.Contains;
        Func<string, bool> reached = regions.Contains;
        for (var changed = true; changed;)
        {
            changed = false;
            foreach (var e in world.Entrances)
            {
                if (regions.Contains(e.From) && !regions.Contains(e.To) && e.Requires.Evaluate(has, reached) && CrossableBefore(e))
                {
                    changed = Enter(e.To) || changed;
                }
            }
        }

        return new Reach(regions, items);
    }

    /// <summary>
    /// Everything still reachable once the given regions are closed. The walk runs once per distinct set of regions
    /// and starting items; a later call with the same key returns the cached reach.
    /// </summary>
    public static Reach WithoutRegions(World world, IEnumerable<string> forbiddenRegions, IEnumerable<string>? items = null)
    {
        ArgumentNullException.ThrowIfNull(world);
        var regions = forbiddenRegions.Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToList();
        var held = (items ?? []).Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToList();
        var key = $"{string.Join('\0', regions)}\n{string.Join('\0', held)}";
        return world.ReachCache.GetOrAdd(key, _ => Walk(world, new ReachOptions
        {
            ForbiddenRegions = regions.ToHashSet(StringComparer.Ordinal),
            Items = held,
        }));
    }

    /// <summary>
    /// Everything still reachable once the given areas are closed. Uses the same cache as <see cref="WithoutRegions"/>:
    /// one walk per distinct set of areas and starting items, never one per order.
    /// </summary>
    public static Reach WithoutAreas(World world, IEnumerable<string> areas, IEnumerable<string>? items = null)
    {
        ArgumentNullException.ThrowIfNull(world);
        var regionIds = areas.Distinct(StringComparer.Ordinal).SelectMany(world.RegionsInArea);
        return WithoutRegions(world, regionIds, items);
    }
}
