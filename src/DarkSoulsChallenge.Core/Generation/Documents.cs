using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using DarkSoulsChallenge.Core.Orders;

namespace DarkSoulsChallenge.Core.Generation;

/// <summary>An order as it leaves the system: the template's id, its arguments and its manual text.</summary>
public sealed record OrderDocument(string Id, int? Chapter, OrderArgs Args, IReadOnlyList<string> Exceptions, string Text);

/// <summary>A generated challenge as it is stored and served: plain JSON, with the manual already rendered.</summary>
public sealed record ChallengeDocument
{
    public required GeneratorConfig Config { get; init; }

    public required string DataVersion { get; init; }

    public required string GeneratorVersion { get; init; }

    public required Setup Setup { get; init; }

    public required Curve Curve { get; init; }

    public required IReadOnlyList<ChapterPlan> Chapters { get; init; }

    public required IReadOnlyList<OrderDocument> Orders { get; init; }

    /// <summary>The manual in Markdown.</summary>
    public required string Manual { get; init; }

    public static ChallengeDocument From(World world, Challenge challenge)
    {
        ArgumentNullException.ThrowIfNull(world);
        ArgumentNullException.ThrowIfNull(challenge);
        return new ChallengeDocument
        {
            Config = challenge.Config,
            DataVersion = challenge.DataVersion,
            GeneratorVersion = Generator.Version,
            Setup = challenge.Setup,
            Curve = challenge.Curve,
            Chapters = challenge.Chapters,
            Orders = challenge.Orders
                .Select(o => new OrderDocument(o.Template.Id, o.Chapter, o.Args, o.Exceptions, Generation.Manual.OrderText(world, o)))
                .ToList(),
            Manual = Generation.Manual.Render(world, challenge),
        };
    }
}

/// <summary>
/// What a client asks for. One difficulty per player: a single player gets the solo challenge, several get one challenge
/// for the group, with handicap. Class, gift, level cap and curve are drawn from the seed when absent; whether a class or
/// gift exists is the generator's to check.
/// </summary>
public sealed record GenerationRequest
{
    public const int MaxSeedLength = 64;
    public const int MaxPlayers = 8;

    public string? Seed { get; init; }

    public IReadOnlyList<Difficulty> Players { get; init; } = [Difficulty.Medium];

    public Length Length { get; init; } = Length.Full;

    public Curve? Curve { get; init; }

    public string? StartingClass { get; init; }

    public int? GiftRow { get; init; }

    public int? LevelCap { get; init; }

    /// <summary>What is wrong with the request; empty when it can be generated.</summary>
    public IReadOnlyList<string> Problems()
    {
        var problems = new List<string>();
        if (Seed is not null && Seed.Trim() is not { Length: > 0 and <= MaxSeedLength })
        {
            problems.Add($"the seed must have 1 to {MaxSeedLength} characters");
        }

        if (Players.Count is 0 or > MaxPlayers) problems.Add($"a challenge has 1 to {MaxPlayers} players");
        if (StartingClass is not null && StartingClass.Trim() is not { Length: > 0 and <= 32 })
        {
            problems.Add("the class must have 1 to 32 characters");
        }

        if (GiftRow < 0) problems.Add("the gift row cannot be negative");
        if (LevelCap <= 0) problems.Add("the level cap must be positive");
        return problems;
    }

    /// <summary>Generates the request's challenges, one per player, in the order of its players.</summary>
    public IReadOnlyList<ChallengeDocument> Run(World world)
    {
        var config = new GeneratorConfig(Seed?.Trim() ?? DrawSeed(), Players[0], Length)
        {
            Curve = Curve,
            StartingClass = StartingClass?.Trim(),
            GiftRow = GiftRow,
            LevelCap = LevelCap,
        };
        return Generator.GenerateGroup(world, config, Players).Select(c => ChallengeDocument.From(world, c)).ToList();
    }

    /// <summary>Draws a short seed, so a challenge asked without one can still be shared.</summary>
    public static string DrawSeed() => Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(4));
}

/// <summary>Writes order arguments as plain JSON values: an id, a number, or a list of ids.</summary>
public sealed class OrderArgsConverter : JsonConverter<OrderArgs>
{
    public override OrderArgs Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var args = new OrderArgs();
        using var document = JsonDocument.ParseValue(ref reader);
        foreach (var property in document.RootElement.EnumerateObject())
        {
            args[property.Name] = property.Value.ValueKind switch
            {
                JsonValueKind.String => property.Value.GetString() ?? "",
                JsonValueKind.Number => property.Value.GetInt32(),
                JsonValueKind.Array => property.Value.EnumerateArray().Select(e => e.GetString() ?? "").ToList(),
                _ => throw new JsonException($"unexpected argument \"{property.Name}\""),
            };
        }

        return args;
    }

    public override void Write(Utf8JsonWriter writer, OrderArgs value, JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(writer);
        ArgumentNullException.ThrowIfNull(value);
        writer.WriteStartObject();
        foreach (var (name, arg) in value)
        {
            switch (arg)
            {
                case ArgValue.Text text:
                    writer.WriteString(name, text.Value);
                    break;
                case ArgValue.Number number:
                    writer.WriteNumber(name, number.Value);
                    break;
                case ArgValue.TextList list:
                    writer.WriteStartArray(name);
                    foreach (var item in list.Values) writer.WriteStringValue(item);
                    writer.WriteEndArray();
                    break;
            }
        }

        writer.WriteEndObject();
    }
}

/// <summary>The JSON shape of what leaves the core. Generated at compile time, so it also works trimmed in the browser.</summary>
[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    UseStringEnumConverter = true,
    WriteIndented = true,
    Converters = [typeof(OrderArgsConverter), typeof(LowerCaseEnumConverter<Difficulty>), typeof(LowerCaseEnumConverter<Curve>), typeof(LowerCaseEnumConverter<Length>), typeof(LowerCaseEnumConverter<Mode>)])]
[JsonSerializable(typeof(ChallengeDocument))]
[JsonSerializable(typeof(IReadOnlyList<ChallengeDocument>))]
[JsonSerializable(typeof(ChallengeView))]
public sealed partial class CoreJsonContext : JsonSerializerContext;

/// <summary>Enums as the lower-case names the manual uses.</summary>
public sealed class LowerCaseEnumConverter<TEnum> : JsonStringEnumConverter<TEnum>
    where TEnum : struct, Enum
{
    public LowerCaseEnumConverter()
        : base(JsonNamingPolicy.CamelCase)
    {
    }
}
