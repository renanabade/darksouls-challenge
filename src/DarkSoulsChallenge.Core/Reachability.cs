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

public sealed class Reach
{
    internal Reach(IReadOnlySet<string> regions, IReadOnlySet<string> items)
    {
        Regions = regions;
        Items = items;
    }

    public IReadOnlySet<string> Regions { get; }

    public IReadOnlySet<string> Items { get; }

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
    /// Everything the player can reach from the start, by fixed point: cross every entrance whose requirement holds, take
    /// every item in the regions reached, and repeat until nothing changes. Each round only adds, so the loop ends after at
    /// most one round per region.
    /// </summary>
    public static Reach Walk(World world, ReachOptions? options = null)
    {
        ArgumentNullException.ThrowIfNull(world);
        options ??= new ReachOptions();
        var graph = world.Graph;
        var forbiddenLocations = options.ForbiddenLocations;
        var forbiddenItemNames = options.ForbiddenItems;

        var forbiddenRegion = new bool[graph.RegionNames.Length];
        if (options.ForbiddenRegions is { } closed)
        {
            foreach (var region in closed)
            {
                if (graph.RegionIds.TryGetValue(region, out var id)) forbiddenRegion[id] = true;
            }
        }

        var forbiddenItem = new bool[graph.ItemNames.Count];
        if (forbiddenItemNames is not null)
        {
            foreach (var item in forbiddenItemNames)
            {
                if (graph.ItemIds.TryGetValue(item, out var id)) forbiddenItem[id] = true;
            }
        }

        var regions = new bool[graph.RegionNames.Length];
        var items = new bool[graph.ItemNames.Count];
        var heldFromStart = new bool[graph.ItemNames.Count];

        // What the player starts with but the graph never mentions (most of a class's kit).
        HashSet<string>? extras = null;
        foreach (var item in options.Items ?? [])
        {
            if (graph.ItemIds.TryGetValue(item, out var id))
            {
                heldFromStart[id] = true;
                if (!forbiddenItem[id]) items[id] = true;
            }
            else if (forbiddenItemNames?.Contains(item) != true)
            {
                (extras ??= new HashSet<string>(StringComparer.Ordinal)).Add(item);
            }
        }

        bool Enter(int region)
        {
            if (regions[region] || forbiddenRegion[region]) return false;
            regions[region] = true;
            foreach (var pickup in graph.Pickups[region])
            {
                if (forbiddenLocations?.Contains(pickup.Location) == true) continue;
                if (!forbiddenItem[pickup.Item]) items[pickup.Item] = true;
            }

            return true;
        }

        if (graph.Start >= 0) Enter(graph.Start);

        // An entrance that must be crossed before an item is held: the player can cross it when it is open in the world
        // without that item. Every state of the walk is one the player reaches with what it holds, so an entrance open
        // while the item is not yet taken is crossable; only otherwise is the world without the item walked, once per item.
        // An item held from the start closes the entrance from the start. Each entrance is judged on its own item: two
        // entrances with different items are not asked to be crossed in one order (ADR 0011).
        Dictionary<int, Reach>? without = null;
        bool CrossableBefore(in GraphIndex.Edge e)
        {
            var before = e.Before;
            if (before < 0 || forbiddenItem[before]) return true;
            if (heldFromStart[before]) return false;
            if (!items[before]) return true;
            without ??= [];
            if (!without.TryGetValue(before, out var early))
            {
                var stricter = new HashSet<string>(forbiddenItemNames ?? new HashSet<string>(), StringComparer.Ordinal)
                {
                    graph.ItemNames[before],
                };
                early = Walk(world, options with { ForbiddenItems = stricter });
                without[before] = early;
            }

            return early.Regions.Contains(graph.RegionNames[e.To]);
        }

        for (var changed = true; changed;)
        {
            changed = false;
            foreach (ref readonly var e in graph.Edges.AsSpan())
            {
                if (regions[e.From] && !regions[e.To] && e.Requires.Holds(items, regions) && CrossableBefore(in e))
                {
                    changed = Enter(e.To) || changed;
                }
            }
        }

        return new Reach(
            new FlagSet(regions, graph.RegionNames, graph.RegionIds),
            new FlagSet(items, graph.ItemNames, graph.ItemIds, extras));
    }

    /// <summary>
    /// Everything still reachable once the given regions are closed. The walk runs once per distinct set of regions and
    /// starting items; a later call with the same key returns the cached reach.
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
    /// Everything still reachable once the given areas are closed. Uses the same cache as <see cref="WithoutRegions"/>: one
    /// walk per distinct set of areas and starting items, never one per order.
    /// </summary>
    public static Reach WithoutAreas(World world, IEnumerable<string> areas, IEnumerable<string>? items = null)
    {
        ArgumentNullException.ThrowIfNull(world);
        var regionIds = areas.Distinct(StringComparer.Ordinal).SelectMany(world.RegionsInArea);
        return WithoutRegions(world, regionIds, items);
    }
}
