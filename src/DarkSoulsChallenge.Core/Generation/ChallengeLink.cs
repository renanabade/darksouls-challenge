using System.Globalization;
using DarkSoulsChallenge.Core.Orders;

namespace DarkSoulsChallenge.Core.Generation;

/// <summary>What a link asks for: a challenge, if it can tell one, and what the player should know about the link.</summary>
/// <param name="Config">The challenge to generate; null when the link asks for none, or its code cannot be read.</param>
/// <param name="Code">The code to show and share, in its canonical form.</param>
/// <param name="Notices">What was wrong with the link, or what will not match what the player expects.</param>
public sealed record LinkReading(GeneratorConfig? Config, string? Code, IReadOnlyList<string> Notices);

/// <summary>
/// The link of a challenge is <c>?c=&lt;code&gt;</c>. Links from before the code (<c>?seed=...&amp;difficulty=...</c>) still
/// work: their text seed is hashed into the code's seed, and every parameter counts, even with an empty seed.
/// </summary>
public static class ChallengeLink
{
    public static string QueryOf(string code)
    {
        ArgumentNullException.ThrowIfNull(code);
        return $"?c={Uri.EscapeDataString(code)}";
    }

    /// <summary>Reads a link's parameters. The seed drawn for a legacy link without one comes from <paramref name="drawSeed"/>.</summary>
    public static LinkReading Read(World world, IReadOnlyDictionary<string, string> query, Func<string> drawSeed)
    {
        ArgumentNullException.ThrowIfNull(world);
        ArgumentNullException.ThrowIfNull(query);
        ArgumentNullException.ThrowIfNull(drawSeed);
        return query.TryGetValue("c", out var code) ? ReadCode(world, code) : ReadLegacy(world, query, drawSeed);
    }

    /// <summary>What to tell the player about a code another generator or data set made.</summary>
    public static string VersionNotice(World world, DecodedCode decoded)
    {
        ArgumentNullException.ThrowIfNull(world);
        ArgumentNullException.ThrowIfNull(decoded);
        return $"This code was made with generator {decoded.GeneratorVersion} and data {decoded.DataVersion}. "
            + $"This site runs generator {Generator.Version} and data {ChallengeCode.CompactDataVersion(world.DataVersion)}, "
            + "so it now gives a different challenge.";
    }

    private static LinkReading ReadCode(World world, string code)
    {
        if (!ChallengeCode.TryDecode(world, code, out var decoded, out var problem))
        {
            return new LinkReading(null, null, [$"The link's code cannot be read: {problem}."]);
        }

        return new LinkReading(
            decoded!.Config,
            ChallengeCode.Encode(world, decoded.Config),
            decoded.IsCurrent ? [] : [VersionNotice(world, decoded)]);
    }

    private static LinkReading ReadLegacy(World world, IReadOnlyDictionary<string, string> query, Func<string> drawSeed)
    {
        string[] names = ["seed", "class", "gift", "difficulty", "length", "curve", "cap"];
        if (!names.Any(query.ContainsKey)) return new LinkReading(null, null, []);

        var notices = new List<string>();
        void Ignored(string name, string value) => notices.Add($"The link's {name} \"{value}\" does not exist, and was ignored.");

        var config = new GeneratorConfig(
            query.TryGetValue("seed", out var text) && text.Trim().Length > 0 ? text.Trim() : drawSeed(),
            Difficulty.Medium,
            Length.Full);

        if (query.TryGetValue("class", out var startingClass) && startingClass.Length > 0)
        {
            if (world.Classes.ContainsKey(startingClass)) config = config with { StartingClass = startingClass };
            else Ignored("class", startingClass);
        }

        if (query.TryGetValue("gift", out var gift) && gift.Length > 0)
        {
            if (int.TryParse(gift, NumberStyles.None, CultureInfo.InvariantCulture, out var row) && world.Gifts.Any(g => g.Row == row))
            {
                config = config with { GiftRow = row };
            }
            else
            {
                Ignored("gift", gift);
            }
        }

        if (query.TryGetValue("difficulty", out var difficulty) && difficulty.Length > 0)
        {
            if (Named(difficulty, Curves.Difficulties) is { } level) config = config with { Difficulty = level };
            else Ignored("difficulty", difficulty);
        }

        if (query.TryGetValue("length", out var length) && length.Length > 0)
        {
            if (Named(length, [Length.Short, Length.Full, Length.Epic]) is { } size) config = config with { Length = size };
            else Ignored("length", length);
        }

        if (query.TryGetValue("curve", out var curve) && curve.Length > 0)
        {
            if (Named(curve, Curves.All) is { } shape) config = config with { Curve = shape };
            else Ignored("curve", curve);
        }

        if (query.TryGetValue("cap", out var cap) && cap.Length > 0)
        {
            if (int.TryParse(cap, NumberStyles.None, CultureInfo.InvariantCulture, out var levelCap) && levelCap is > 0 and <= ChallengeCode.MaxLevelCap)
            {
                config = config with { LevelCap = levelCap };
            }
            else
            {
                Ignored("level cap", cap);
            }
        }

        if (query.TryGetValue("v", out var version) && version != Generator.Version)
        {
            notices.Add($"This link was made with generator {version}. This site runs generator {Generator.Version}, so it now gives a different challenge.");
        }

        return new LinkReading(config, ChallengeCode.Encode(world, config), notices);
    }

    private static TEnum? Named<TEnum>(string name, IEnumerable<TEnum> values)
        where TEnum : struct, Enum
    {
        foreach (var value in values)
        {
            if (string.Equals(value.ToString(), name, StringComparison.OrdinalIgnoreCase)) return value;
        }

        return null;
    }
}
