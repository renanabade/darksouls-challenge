using System.Collections;

namespace DarkSoulsChallenge.Core;

/// <summary>
/// The world graph with regions and items numbered, so a walk works on arrays instead of hashing strings. A challenge walks
/// the graph thousands of times, and this is what keeps that affordable in the browser. Built once per world.
/// </summary>
internal sealed class GraphIndex
{
    internal abstract class Condition
    {
        public abstract bool Holds(bool[] items, bool[] regions);
    }

    private sealed class Always(bool value) : Condition
    {
        public override bool Holds(bool[] items, bool[] regions) => value;
    }

    private sealed class HasItem(int item) : Condition
    {
        public override bool Holds(bool[] items, bool[] regions) => items[item];
    }

    private sealed class ReachedRegion(int region) : Condition
    {
        public override bool Holds(bool[] items, bool[] regions) => region >= 0 && regions[region];
    }

    private sealed class AllOf(Condition[] children) : Condition
    {
        public override bool Holds(bool[] items, bool[] regions)
        {
            foreach (var child in children)
            {
                if (!child.Holds(items, regions)) return false;
            }

            return true;
        }
    }

    private sealed class AnyOf(Condition[] children) : Condition
    {
        public override bool Holds(bool[] items, bool[] regions)
        {
            foreach (var child in children)
            {
                if (child.Holds(items, regions)) return true;
            }

            return false;
        }
    }

    internal readonly record struct Edge(int From, int To, Condition Requires, int Before);

    internal readonly record struct Pickup(Location Location, int Item);

    public Dictionary<string, int> RegionIds { get; } = new(StringComparer.Ordinal);

    public Dictionary<string, int> ItemIds { get; } = new(StringComparer.Ordinal);

    public List<string> ItemNames { get; } = [];

    public string[] RegionNames { get; }

    public Edge[] Edges { get; }

    public Pickup[][] Pickups { get; }

    public int Start { get; }

    public GraphIndex(World world)
    {
        RegionNames = world.Regions.Keys.ToArray();
        for (var i = 0; i < RegionNames.Length; i++) RegionIds[RegionNames[i]] = i;
        foreach (var location in world.Locations) ItemId(location.Item);

        Edges = world.Entrances
            .Select(e => new Edge(
                RegionIds[e.From],
                RegionIds[e.To],
                Compile(e.Requires),
                e.Before is null ? -1 : ItemId(e.Before)))
            .ToArray();

        var byRegion = RegionNames.Select(_ => new List<Pickup>()).ToArray();
        foreach (var location in world.Locations)
        {
            byRegion[RegionIds[location.Region]].Add(new Pickup(location, ItemIds[location.Item]));
        }

        Pickups = byRegion.Select(p => p.ToArray()).ToArray();
        Start = RegionIds.GetValueOrDefault(world.Start, -1);
    }

    private int ItemId(string item)
    {
        if (!ItemIds.TryGetValue(item, out var id))
        {
            id = ItemNames.Count;
            ItemIds[item] = id;
            ItemNames.Add(item);
        }

        return id;
    }

    private Condition Compile(Requirement requirement) => requirement switch
    {
        Requirement.Constant c => new Always(c.Value),
        Requirement.Has h => new HasItem(ItemId(h.Item)),
        Requirement.Region r => new ReachedRegion(RegionIds.GetValueOrDefault(r.Id, -1)),
        Requirement.All a => new AllOf(a.Children.Select(Compile).ToArray()),
        Requirement.Any a => new AnyOf(a.Children.Select(Compile).ToArray()),
        _ => throw new InvalidOperationException($"unknown requirement {requirement.GetType().Name}"),
    };
}

/// <summary>A set of names read from the flags of a walk, without copying them into a hash set.</summary>
internal sealed class FlagSet(bool[] flags, IReadOnlyList<string> names, Dictionary<string, int> ids, HashSet<string>? extras = null)
    : IReadOnlySet<string>
{
    private int _count = -1;

    public int Count
    {
        get
        {
            if (_count < 0) _count = flags.Count(f => f) + (extras?.Count ?? 0);
            return _count;
        }
    }

    public bool Contains(string item) =>
        ids.TryGetValue(item, out var id) ? flags[id] : extras?.Contains(item) == true;

    public IEnumerator<string> GetEnumerator()
    {
        for (var i = 0; i < flags.Length; i++)
        {
            if (flags[i]) yield return names[i];
        }

        foreach (var extra in extras ?? []) yield return extra;
    }

    IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();

    public bool IsProperSubsetOf(IEnumerable<string> other) => Copy().IsProperSubsetOf(other);

    public bool IsProperSupersetOf(IEnumerable<string> other) => Copy().IsProperSupersetOf(other);

    public bool IsSubsetOf(IEnumerable<string> other) => Copy().IsSubsetOf(other);

    public bool IsSupersetOf(IEnumerable<string> other) => Copy().IsSupersetOf(other);

    public bool Overlaps(IEnumerable<string> other) => Copy().Overlaps(other);

    public bool SetEquals(IEnumerable<string> other) => Copy().SetEquals(other);

    private HashSet<string> Copy() => new(this, StringComparer.Ordinal);
}
