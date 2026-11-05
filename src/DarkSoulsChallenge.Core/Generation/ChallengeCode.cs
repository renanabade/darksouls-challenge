using System.Text;
using DarkSoulsChallenge.Core.Orders;

namespace DarkSoulsChallenge.Core.Generation;

/// <summary>What a challenge code holds, and whether it was made by this generator and data set.</summary>
/// <param name="Config">The settings the code stands for, in this world.</param>
/// <param name="GeneratorVersion">The generator that made the code.</param>
/// <param name="DataVersion">The data set that made the code, as the code writes it ("07").</param>
/// <param name="IsCurrent">False when another generator or data set made it: the same code then gives another challenge.</param>
public sealed record DecodedCode(GeneratorConfig Config, string GeneratorVersion, string DataVersion, bool IsCurrent);

/// <summary>
/// The one thing a player shows and shares: <c>ds1.8.07-K3F9QX2M7T</c>, the game, both versions and a payload holding
/// every parameter of a solo challenge and its seed. The payload is 50 bits in Crockford base32, case-insensitive. From the
/// high bits: seed (24), level cap (10), gift (5), class (4), curve (3), length (2), difficulty (2). Level cap, gift, class
/// and curve are 0 when drawn by the seed. Group challenges stay on the CLI's --players.
/// </summary>
public static class ChallengeCode
{
    public const int SeedBits = 24;

    /// <summary>The highest level cap a code can hold. The game's own is 713.</summary>
    public const int MaxLevelCap = 713;

    private const string Alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    private const int PayloadLength = 10;

    /// <summary>The seed text as the number a code holds: digits are taken as they are, any other text is hashed.</summary>
    public static int SeedNumber(string seed)
    {
        ArgumentNullException.ThrowIfNull(seed);
        if (seed.Length is > 0 and <= 8 && seed.All(char.IsAsciiDigit) && int.Parse(seed, provider: null) < 1 << SeedBits)
        {
            return int.Parse(seed, provider: null);
        }

        return (int)(SeededRandom.Fnv1a(seed) & ((1u << SeedBits) - 1));
    }

    /// <summary>The data version as a code writes it: "0.7.0" is "07", "0.7.1" is "071".</summary>
    public static string CompactDataVersion(string dataVersion)
    {
        ArgumentNullException.ThrowIfNull(dataVersion);
        var parts = dataVersion.Split('.');
        return parts.Length == 3 && parts[2] == "0" ? $"{parts[0]}{parts[1]}" : string.Concat(parts);
    }

    public static string Encode(World world, GeneratorConfig config)
    {
        ArgumentNullException.ThrowIfNull(world);
        ArgumentNullException.ThrowIfNull(config);
        var classIndex = config.StartingClass is null ? 0 : ClassNames(world).IndexOf(config.StartingClass) + 1;
        var giftIndex = config.GiftRow is null ? 0 : GiftRows(world).IndexOf(config.GiftRow.Value) + 1;
        if (config.LevelCap is < 0 or > MaxLevelCap) throw new ArgumentException($"the level cap must be at most {MaxLevelCap}", nameof(config));

        long payload = SeedNumber(config.Seed);
        payload = (payload << 10) | (long)(config.LevelCap ?? 0);
        payload = (payload << 5) | (long)giftIndex;
        payload = (payload << 4) | (long)classIndex;
        payload = (payload << 3) | (config.Curve is { } curve ? (long)curve + 1 : 0);
        payload = (payload << 2) | (long)config.Length;
        payload = (payload << 2) | (long)config.Difficulty;

        var text = new StringBuilder(PayloadLength);
        for (var shift = (PayloadLength - 1) * 5; shift >= 0; shift -= 5)
        {
            text.Append(Alphabet[(int)((payload >> shift) & 31)]);
        }

        return $"{world.Game}.{Generator.Version}.{CompactDataVersion(world.DataVersion)}-{text}";
    }

    /// <summary>Reads a code, or says why it cannot be read. A code from another version is read, and marked as such.</summary>
    public static bool TryDecode(World world, string code, out DecodedCode? decoded, out string? problem)
    {
        ArgumentNullException.ThrowIfNull(world);
        decoded = null;
        problem = null;
        var parts = (code ?? "").Trim().Split('-');
        var head = parts[0].Split('.');
        if (parts.Length != 2 || head.Length != 3 || parts[1].Length != PayloadLength)
        {
            problem = "this is not a challenge code";
            return false;
        }

        if (!string.Equals(head[0], world.Game, StringComparison.OrdinalIgnoreCase))
        {
            problem = $"this code is for another game ({head[0]})";
            return false;
        }

        long payload = 0;
        foreach (var symbol in parts[1])
        {
            var value = ValueOf(symbol);
            if (value < 0)
            {
                problem = "this is not a challenge code";
                return false;
            }

            payload = (payload << 5) | (long)value;
        }

        var difficulty = (int)(payload & 3);
        var length = (int)((payload >> 2) & 3);
        var curve = (int)((payload >> 4) & 7);
        var classIndex = (int)((payload >> 7) & 15);
        var giftIndex = (int)((payload >> 11) & 31);
        var levelCap = (int)((payload >> 16) & 1023);
        var seed = (int)(payload >> 26);
        var classes = ClassNames(world);
        var gifts = GiftRows(world);
        if (length > (int)Length.Epic
            || curve > Curves.All.Count
            || classIndex > classes.Count
            || giftIndex > gifts.Count
            || levelCap > MaxLevelCap)
        {
            problem = "this code holds parameters that do not exist";
            return false;
        }

        var config = new GeneratorConfig(seed.ToString(System.Globalization.CultureInfo.InvariantCulture), (Difficulty)difficulty, (Length)length)
        {
            Curve = curve == 0 ? null : (Curve)(curve - 1),
            StartingClass = classIndex == 0 ? null : classes[classIndex - 1],
            GiftRow = giftIndex == 0 ? null : gifts[giftIndex - 1],
            LevelCap = levelCap == 0 ? null : levelCap,
        };
        var isCurrent = head[1] == Generator.Version && head[2] == CompactDataVersion(world.DataVersion);
        decoded = new DecodedCode(config, head[1], head[2], isCurrent);
        return true;
    }

    private static List<string> ClassNames(World world) => world.Classes.Keys.Order(StringComparer.Ordinal).ToList();

    private static List<int> GiftRows(World world) => world.Gifts.Select(g => g.Row).Order().ToList();

    private static int ValueOf(char symbol)
    {
        var upper = char.ToUpperInvariant(symbol);
        return upper switch
        {
            'O' => 0,
            'I' or 'L' => 1,
            _ => Alphabet.IndexOf(upper, StringComparison.Ordinal),
        };
    }
}
