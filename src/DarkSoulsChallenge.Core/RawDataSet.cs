using System.Text.Json;

namespace DarkSoulsChallenge.Core;

/// <summary>
/// The parsed JSON of each data set file, still untrusted. Reading the files is the caller's job: from disk in the
/// CLI and the server, over HTTP in the browser. A null file means it is absent: small test worlds need no
/// milestones, weapons or area names.
/// </summary>
public sealed record RawDataSet
{
    /// <summary>The files of a data set, without their .json extension.</summary>
    public static IReadOnlyList<string> Files { get; } =
    [
        "meta", "regions", "entrances", "locations", "classes", "bosses", "merchants",
        "milestones", "weapons", "spells", "areas", "treasures", "warnings",
    ];

    public JsonElement? Meta { get; init; }

    public JsonElement? Regions { get; init; }

    public JsonElement? Entrances { get; init; }

    public JsonElement? Locations { get; init; }

    public JsonElement? Classes { get; init; }

    public JsonElement? Bosses { get; init; }

    public JsonElement? Merchants { get; init; }

    public JsonElement? Milestones { get; init; }

    public JsonElement? Weapons { get; init; }

    public JsonElement? Spells { get; init; }

    public JsonElement? Areas { get; init; }

    public JsonElement? Treasures { get; init; }

    public JsonElement? Warnings { get; init; }

    /// <summary>Builds the data set from the text of each file, given by name (see <see cref="Files"/>).</summary>
    public static RawDataSet FromText(Func<string, string> read)
    {
        ArgumentNullException.ThrowIfNull(read);
        JsonElement Parse(string file)
        {
            using var document = JsonDocument.Parse(read(file));
            return document.RootElement.Clone();
        }

        return new RawDataSet
        {
            Meta = Parse("meta"),
            Regions = Parse("regions"),
            Entrances = Parse("entrances"),
            Locations = Parse("locations"),
            Classes = Parse("classes"),
            Bosses = Parse("bosses"),
            Merchants = Parse("merchants"),
            Milestones = Parse("milestones"),
            Weapons = Parse("weapons"),
            Spells = Parse("spells"),
            Areas = Parse("areas"),
            Treasures = Parse("treasures"),
            Warnings = Parse("warnings"),
        };
    }

    /// <summary>Builds the data set from a directory holding its files.</summary>
    public static RawDataSet FromDirectory(string directory) =>
        FromText(file => File.ReadAllText(Path.Combine(directory, $"{file}.json")));
}
