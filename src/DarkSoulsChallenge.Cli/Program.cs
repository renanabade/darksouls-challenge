using System.CommandLine;
using System.Text.Json;
using DarkSoulsChallenge.Core;
using DarkSoulsChallenge.Core.Generation;
using DarkSoulsChallenge.Core.Orders;

// Generates a static challenge and prints its manual (Markdown, or JSON with --json).
//
//   dotnet run --project src/DarkSoulsChallenge.Cli -- --seed ashen-one --difficulty medium --length epic --curve rising
//   dotnet run --project src/DarkSoulsChallenge.Cli -- --seed ashen-one --class Knight --gift 2406 --level-cap 30 --json
//   dotnet run --project src/DarkSoulsChallenge.Cli -- --seed ashen-one --players easy,hard
//
// Without --seed, a random one is drawn and printed, so the challenge can be shared.
Console.OutputEncoding = System.Text.Encoding.UTF8;

var seed = new Option<string?>("--seed") { Description = "Same seed and settings, same challenge. Drawn when absent." };
var difficulty = new Option<Difficulty>("--difficulty") { Description = "easy, medium, hard or extreme.", DefaultValueFactory = _ => Difficulty.Medium };
var players = new Option<string?>("--players") { Description = "One difficulty per player, comma separated: a challenge for a group, with handicap." };
var length = new Option<Length>("--length") { Description = "short, full or epic.", DefaultValueFactory = _ => Length.Full };
var curve = new Option<Curve?>("--curve") { Description = "constant, rising, peaks or rollercoaster. Drawn when absent." };
var startingClass = new Option<string?>("--class") { Description = "Starting class. Drawn when absent." };
var gift = new Option<int?>("--gift") { Description = "Starting gift, by row. Drawn when absent." };
var levelCap = new Option<int?>("--level-cap") { Description = "Soul level cap. Drawn when absent." };
var data = new Option<string?>("--data") { Description = "Directory of the data set. Defaults to data/ds1 of this repository." };
var json = new Option<bool>("--json") { Description = "Print JSON instead of the manual." };

var root = new RootCommand("Generates a Dark Souls challenge.") { seed, difficulty, players, length, curve, startingClass, gift, levelCap, data, json };
root.SetAction(parsed =>
{
    try
    {
        var world = WorldParser.Parse(RawDataSet.FromDirectory(parsed.GetValue(data) ?? FindDataSet()));
        var playerList = parsed.GetValue(players);
        var request = new GenerationRequest
        {
            Seed = parsed.GetValue(seed),
            Players = playerList is null ? [parsed.GetValue(difficulty)] : ParsePlayers(playerList),
            Length = parsed.GetValue(length),
            Curve = parsed.GetValue(curve),
            StartingClass = parsed.GetValue(startingClass),
            GiftRow = parsed.GetValue(gift),
            LevelCap = parsed.GetValue(levelCap),
        };
        if (request.Problems() is { Count: > 0 } problems) throw new ArgumentException(string.Join('\n', problems));

        var documents = request.Run(world);
        if (parsed.GetValue(json))
        {
            Console.Out.WriteLine(playerList is null
                ? JsonSerializer.Serialize(documents[0], CoreJsonContext.Default.ChallengeDocument)
                : JsonSerializer.Serialize(documents, CoreJsonContext.Default.IReadOnlyListChallengeDocument));
        }
        else
        {
            Console.Out.Write(string.Join("\n---\n\n", documents.Select(d => d.Manual)));
        }

        return 0;
    }
    catch (Exception error) when (error is ArgumentException or InvalidOperationException or WorldParseException or IOException)
    {
        Console.Error.WriteLine(error.Message);
        return 1;
    }
});
return root.Parse(args).Invoke();

static List<Difficulty> ParsePlayers(string list) => list
    .Split([' ', ','], StringSplitOptions.RemoveEmptyEntries)
    .Select(name => Enum.TryParse<Difficulty>(name, ignoreCase: true, out var level)
        ? level
        : throw new ArgumentException($"unknown difficulty \"{name}\""))
    .ToList();

static string FindDataSet()
{
    for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
    {
        var candidate = Path.Combine(dir.FullName, "data", "ds1");
        if (File.Exists(Path.Combine(candidate, "meta.json"))) return candidate;
    }

    throw new InvalidOperationException("the data set was not found: pass --data");
}
