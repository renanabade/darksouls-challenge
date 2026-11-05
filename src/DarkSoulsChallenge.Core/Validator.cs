using DarkSoulsChallenge.Core.Orders;

namespace DarkSoulsChallenge.Core;

/// <summary>The challenge parameters every check uses. Weapon orders also need the class and the level cap.</summary>
public sealed record Setup(Mode Mode, StartingGift Gift, string? StartingClass = null, int? LevelCap = null);

/// <summary>
/// Impossible: some order cannot be followed. Unexpected: possible only with a jump, a farm or a long detour.
/// Comfortable: possible as intended. The graph does not mark unexpected paths yet, so the validator only answers
/// impossible or comfortable.
/// </summary>
public enum Verdict
{
    Impossible,
    Unexpected,
    Comfortable,
}

/// <summary>Graph: checked on the world graph. WeightOnly: never impossible. Pending: no check exists yet.</summary>
public enum Support
{
    Graph,
    WeightOnly,
    Pending,
}

/// <param name="Id">The order's template id.</param>
/// <param name="Support">How the order was checked.</param>
/// <param name="Exceptions">Items the order must except because the game requires them (automatic exception).</param>
public sealed record OrderResult(string Id, Support Support, IReadOnlyList<string> Exceptions);

/// <param name="Verdict">The answer for the whole set.</param>
/// <param name="Problems">Why the set is impossible; empty otherwise.</param>
/// <param name="Orders">One result per order, in the order given.</param>
/// <param name="Complete">True when every order was checked; a generator must not hand out a challenge with pending orders.</param>
public sealed record ValidationResult(
    Verdict Verdict,
    IReadOnlyList<string> Problems,
    IReadOnlyList<OrderResult> Orders,
    bool Complete);

/// <summary>A programming error in the generator: an order with missing or unknown parameters, or in the wrong mode.</summary>
public sealed class InvalidOrderException(string message) : Exception(message);

public static class Validator
{
    public static IReadOnlyList<string> Bells { get; } = ["Bell of Awakening #1", "Bell of Awakening #2"];

    /// <summary>The location category of a crystal lizard's drop: one or more per lizard.</summary>
    public const string CrystalLizard = "CRYSTAL_LIZARD";

    /// <summary>
    /// What the player holds when the run starts: the starting gift and the class's own items. Both open the graph
    /// (the Master Key, from the Thief's kit or as a gift, makes the Taurus Demon optional), so which bosses are
    /// mandatory follows from the setup instead of a fixed list.
    /// </summary>
    public static IReadOnlyList<string> StartingItems(World world, Setup setup)
    {
        ArgumentNullException.ThrowIfNull(world);
        ArgumentNullException.ThrowIfNull(setup);
        var start = world.Classes.GetValueOrDefault(setup.StartingClass ?? "");

        // The kit counts too: the Pyromancer's own Pyromancy Flame is what Quelana waits for.
        return setup.Gift.Items.Select(i => i.Item)
            .Concat(start?.Kit ?? [])
            .Concat(start?.Items ?? [])
            .Distinct(StringComparer.Ordinal)
            .ToList();
    }

    /// <summary>
    /// Validates a set of orders on the world graph. The orders are checked together: every forbidden area and every
    /// forbidden pickup applies to every other check, so a combination that is impossible is refused even when each
    /// order alone is possible.
    /// </summary>
    public static ValidationResult Validate(World world, Setup setup, IReadOnlyList<OrderInstance> orders)
    {
        ArgumentNullException.ThrowIfNull(world);
        ArgumentNullException.ThrowIfNull(setup);
        ArgumentNullException.ThrowIfNull(orders);
        return new ValidationRun(world, setup, orders).Execute();
    }

    /// <summary>
    /// The place an order is about, when that place cannot be visited in <paramref name="reached"/>. Null when the
    /// order is not about a place, or the place can still be visited. An area is open when any of its regions was
    /// reached; a boss, a pickup and a bonfire need their own region; a merchant needs any of their shops.
    /// </summary>
    public static string? UnreachableTarget(World world, OrderArgs args, IReadOnlySet<string> reached)
    {
        ArgumentNullException.ThrowIfNull(world);
        ArgumentNullException.ThrowIfNull(args);
        ArgumentNullException.ThrowIfNull(reached);
        if (args.Text("area") is { } area)
        {
            var regions = world.RegionsInArea(area).ToList();
            if (regions.Count > 0 && regions.All(id => !reached.Contains(id)))
            {
                return world.Areas.GetValueOrDefault(area)?.Name ?? area;
            }
        }

        if (args.Text("boss") is { } bossId
            && world.Bosses.GetValueOrDefault(bossId) is { } boss
            && !reached.Contains(boss.Region))
        {
            return boss.Name;
        }

        if (args.Text("location") is { } locationName
            && world.LocationNamed(locationName) is { } location
            && !reached.Contains(location.Region))
        {
            return location.Item;
        }

        if (args.Text("bonfire") is { } bonfire
            && world.LocationNamed(bonfire) is { } bonfireLocation
            && !reached.Contains(bonfireLocation.Region))
        {
            return bonfireLocation.Name;
        }

        if (args.Text("merchant") is { } merchantId
            && world.Merchants.GetValueOrDefault(merchantId) is { Regions.Count: > 0 } merchant
            && merchant.Regions.All(id => !reached.Contains(id)))
        {
            return merchant.Name;
        }

        return null;
    }
}
