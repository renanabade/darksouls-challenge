using System.Collections.Concurrent;

namespace DarkSoulsChallenge.Core;

public sealed record Region
{
    public required string Id { get; init; }

    public required string Name { get; init; }

    /// <summary>Null only for virtual shop-logic nodes.</summary>
    public required string? Area { get; init; }

    public required bool Mandatory { get; init; }

    public required bool Virtual { get; init; }
}

public sealed record Entrance
{
    public required string From { get; init; }

    public required string To { get; init; }

    public required Requirement Requires { get; init; }

    /// <summary>False when the way back on foot is known not to exist. The way back, when it exists, is its own entrance.</summary>
    public required bool WalkBack { get; init; }

    /// <summary>
    /// An item the entrance must be crossed before: once the player holds it, the way is gone for good unless it
    /// was crossed already (Quelana leaves if the Bed of Chaos dies before she was met).
    /// </summary>
    public string? Before { get; init; }
}

/// <summary>A stretch of the run in which a bonfire is out or missing.</summary>
public sealed record BonfireWindow
{
    /// <summary>When the bonfire goes out (true: from the start).</summary>
    public required Requirement From { get; init; }

    /// <summary>When it can be rested at again; null when it never comes back, or its return is not modeled.</summary>
    public required Requirement? Until { get; init; }

    public required string Why { get; init; }
}

/// <summary>A place holding an item. Compared by identity: two locations can hold the same item in one region.</summary>
public sealed class Location
{
    public required string Name { get; init; }

    public required string Region { get; init; }

    public required string Item { get; init; }

    public required int Count { get; init; }

    public required string Category { get; init; }

    public required bool Mandatory { get; init; }

    /// <summary>A corpse or chest pickup, joined to the game's treasures. Null when the data set does not say.</summary>
    public bool? Found { get; init; }

    /// <summary>weapon, armor, ring, spell, good, or other (graph events and renamed items).</summary>
    public string? Kind { get; init; }

    /// <summary>Bonfires only: when it cannot be rested at, from the game's scripts.</summary>
    public IReadOnlyList<BonfireWindow>? Unavailable { get; init; }

    /// <summary>
    /// A bonfire "one bonfire" may name: one with no window in which it is out or missing. The order holds for
    /// the whole run in its area, so any window would leave the player no bonfire for part of it.
    /// </summary>
    public bool AlwaysLit => Unavailable is not { Count: > 0 };
}

public sealed record GiftItem(string Item, int Count);

/// <summary>A starting gift. "(none)" is a gift with no items.</summary>
public sealed record StartingGift(int Row, IReadOnlyList<GiftItem> Items);

/// <summary>A place name of the game, grouping regions.</summary>
public sealed record Area(string Id, string Name, bool Dlc);

/// <summary>A fixed point of the progression (a boss, a bell, the Lordvessel...), as a requirement on the graph.</summary>
public sealed record Milestone(string Id, string Name, string Kind, Requirement Requires);

/// <param name="Id">The merchant's id.</param>
/// <param name="Name">The merchant's name.</param>
/// <param name="Regions">Regions holding this merchant's shop locations. A virtual region is shared by every merchant selling there.</param>
public sealed record Merchant(string Id, string Name, IReadOnlyList<string> Regions);

public sealed record NpcWarning(string Id, string Npc, string Text);

public sealed record Chest(string Region);

/// <summary>
/// The world graph the core works on, built from data/ds1 (see its SCHEMA.md). Only the fields the core uses are
/// kept; the rest of each file stays in the data set. Every dictionary enumerates in the order of its file, which
/// the generator relies on. Immutable, and safe to share between threads.
/// </summary>
public sealed class World
{
    /// <summary>The data set's version; part of a challenge's identity.</summary>
    public required string DataVersion { get; init; }

    public required string Start { get; init; }

    public required string Goal { get; init; }

    public required IReadOnlyDictionary<string, Region> Regions { get; init; }

    public required IReadOnlyList<Entrance> Entrances { get; init; }

    public required IReadOnlyList<Location> Locations { get; init; }

    public required IReadOnlyList<StartingGift> Gifts { get; init; }

    public required IReadOnlyDictionary<string, Boss> Bosses { get; init; }

    public required IReadOnlyDictionary<string, Merchant> Merchants { get; init; }

    public required IReadOnlyDictionary<string, Milestone> Milestones { get; init; }

    /// <summary>By name.</summary>
    public required IReadOnlyDictionary<string, Weapon> Weapons { get; init; }

    /// <summary>By name.</summary>
    public required IReadOnlyDictionary<string, Spell> Spells { get; init; }

    /// <summary>Starting classes, by name.</summary>
    public required IReadOnlyDictionary<string, StartingClass> Classes { get; init; }

    public required IReadOnlyDictionary<string, Area> Areas { get; init; }

    /// <summary>Treasure chests placed in the world (not the Firelink rescue chest), one per chest.</summary>
    public required IReadOnlyList<Chest> Chests { get; init; }

    /// <summary>What the manual tells the player about NPCs the scripts can lose or turn.</summary>
    public required IReadOnlyList<NpcWarning> Warnings { get; init; }

    private GraphIndex? _graph;
    private ILookup<string, string>? _regionsByArea;
    private Dictionary<string, Location>? _locationsByName;

    /// <summary>
    /// One walk per distinct set of closed regions and starting items: the combinations a world is actually asked
    /// about, not an unbounded log. A challenge draws a handful of forbidden areas and one gift.
    /// </summary>
    internal ConcurrentDictionary<string, Reach> ReachCache { get; } = new(StringComparer.Ordinal);

    internal GraphIndex Graph => _graph ??= new GraphIndex(this);

    internal ConcurrentDictionary<string, object> GeneratorCache { get; } = new(StringComparer.Ordinal);

    /// <summary>The regions of one area, in world order.</summary>
    public IEnumerable<string> RegionsInArea(string area)
    {
        _regionsByArea ??= Regions.Values
            .Where(r => r.Area is not null)
            .ToLookup(r => r.Area!, r => r.Id, StringComparer.Ordinal);
        return _regionsByArea[area];
    }

    /// <summary>The first location of a name.</summary>
    public Location? LocationNamed(string name)
    {
        if (_locationsByName is null)
        {
            var byName = new Dictionary<string, Location>(StringComparer.Ordinal);
            foreach (var location in Locations)
            {
                byName.TryAdd(location.Name, location);
            }

            _locationsByName = byName;
        }

        return _locationsByName.GetValueOrDefault(name);
    }
}
