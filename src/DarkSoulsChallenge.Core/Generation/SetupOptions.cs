using DarkSoulsChallenge.Core.Orders;

namespace DarkSoulsChallenge.Core.Generation;

public sealed record ClassOption(string Name, int Level, Stats Stats);

/// <param name="Row">The gift's row in the data set.</param>
/// <param name="Label">Lists the gift's items ("Prism Stone x10"), or says "None".</param>
public sealed record GiftOption(int Row, string Label);

/// <summary>What a client may fix before generating, from the data set; the rest is drawn by the seed.</summary>
public sealed record SetupOptions(
    IReadOnlyList<ClassOption> Classes,
    IReadOnlyList<GiftOption> Gifts,
    IReadOnlyList<Difficulty> Difficulties,
    IReadOnlyList<Length> Lengths,
    IReadOnlyList<Curve> Curves)
{
    public static SetupOptions Of(World world)
    {
        ArgumentNullException.ThrowIfNull(world);
        return new SetupOptions(
            world.Classes.Values
                .OrderBy(c => c.Name, StringComparer.Ordinal)
                .Select(c => new ClassOption(c.Name, c.Level, c.Stats))
                .ToList(),
            world.Gifts
                .OrderBy(g => g.Row)
                .Select(g => new GiftOption(
                    g.Row,
                    g.Items.Count == 0
                        ? "None"
                        : string.Join(", ", g.Items.Select(i => i.Count > 1 ? $"{i.Item} x{i.Count}" : i.Item))))
                .ToList(),
            Generation.Curves.Difficulties,
            [Length.Short, Length.Full, Length.Epic],
            Generation.Curves.All);
    }
}

/// <summary>
/// What finishing a challenge is worth on the ranking: the difficulty of its rules, scaled by the difficulty chosen. A first
/// estimate, to tune by playing. It lives with the generator so a score never needs the server's opinion of a challenge.
/// </summary>
public static class ChallengeScore
{
    public static int Of(Challenge challenge)
    {
        ArgumentNullException.ThrowIfNull(challenge);
        var rules = challenge.Orders.Sum(o => o.Template.Weight.Difficulty);
        var scale = challenge.Config.Difficulty switch
        {
            Difficulty.Easy => 1.0,
            Difficulty.Medium => 1.5,
            Difficulty.Hard => 2.0,
            _ => 3.0,
        };
        return (int)Math.Round(rules * scale * 10, MidpointRounding.AwayFromZero);
    }
}
