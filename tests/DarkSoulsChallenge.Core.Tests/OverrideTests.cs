using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace DarkSoulsChallenge.Core.Tests;

/// <summary>
/// data/ds1/overrides.json: the corrections the export applies on top of the DSAP graph (SCHEMA.md). The export fails on
/// a missing target; these tests check, on the exported files, that every override still names a record and that the
/// record carries the correction, so a re-export that loses a fix fails here.
/// </summary>
public partial class OverrideTests
{
    // A source cites the game: an event, a flag, a talk script, a map, a param row, or a test in play.
    [GeneratedRegex(@"\b(Event_\d+|flags? \d+|t\d{6}|m\d{2}_\d{2}_\d{2}_\d{2}|[A-Z]\w*Param|in-game test)\b")]
    private static partial Regex GameEvidence();

    // Never a path into the private pipeline.
    [GeneratedRegex(@"\\|\b(knowledge|tools|notes|gamefiles)/|\.(py|md|json)\b")]
    private static partial Regex PrivatePath();

    private static JsonNode? Read(string file) => JsonNode.Parse(File.ReadAllText(DataSet.PathOf($"{file}.json")));

    private static bool Matches(JsonObject row, JsonObject match) => match.All(field =>
        row.TryGetPropertyValue(field.Key, out var value) && JsonNode.DeepEquals(value, field.Value));

    /// <summary>True when the requirement holds the part as itself or as a member of an "all", at any depth.</summary>
    private static bool Holds(JsonNode? requirement, JsonNode? part)
    {
        if (JsonNode.DeepEquals(requirement, part)) return true;
        return requirement is JsonObject obj
            && obj["all"] is JsonArray all
            && all.Any(r => Holds(r, part));
    }

    /// <summary>What is wrong with one override against the exported data; empty when it is applied.</summary>
    private static List<string> OverrideProblems(JsonObject o, Func<string, JsonNode?> data)
    {
        var id = (string)o["id"]!;
        var source = (string)o["source"]!;
        var op = (string)o["op"]!;
        var problems = new List<string>();
        if (!GameEvidence().IsMatch(source)) problems.Add($"{id}: source cites no game evidence");
        if (PrivatePath().IsMatch(source)) problems.Add($"{id}: source names a private path");
        var file = (string)o["file"]!;
        if (data(file) is not JsonArray rows) return [.. problems, $"{id}: {file} is not a list file"];

        // An added record is found by its match when it has one (the export recomputes derived fields such as
        // mandatory), else by all of its fields; a replaced one by its match with the new fields on top.
        JsonObject match;
        if (op == "replace")
        {
            match = o["match"]!.DeepClone().AsObject();
            foreach (var field in o["value"]!.AsObject()) match[field.Key] = field.Value?.DeepClone();
        }
        else
        {
            match = (o["match"] ?? o["value"])!.AsObject();
        }

        var hits = rows.OfType<JsonObject>().Where(r => Matches(r, match)).ToList();
        if (op == "remove")
        {
            if (hits.Count > 0) problems.Add($"{id}: the removed record is still there");
            return problems;
        }

        if (hits.Count != 1) return [.. problems, $"{id}: target matches {hits.Count} records"];
        var field2 = (string?)o["field"] ?? "requires";
        if (op == "condition" && !Holds(hits[0][field2], o["value"])) problems.Add($"{id}: condition not applied");
        return problems;
    }

    private static List<JsonObject> Overrides() =>
        Read("overrides")!["overrides"]!.AsArray().Select(o => o!.AsObject()).ToList();

    [Fact]
    public void Have_unique_ids_and_known_ops()
    {
        var overrides = Overrides();
        Assert.Equal(overrides.Count, overrides.Select(o => (string)o["id"]!).Distinct().Count());
        foreach (var o in overrides) Assert.Contains((string)o["op"]!, new[] { "add", "remove", "replace", "condition" });
    }

    [Fact]
    public void Are_all_applied_to_the_exported_data_each_citing_the_game() =>
        Assert.Empty(Overrides().SelectMany(o => OverrideProblems(o, Read)));

    private static List<string> Check(string json)
    {
        var rows = JsonNode.Parse("""
            [
              { "from": "a", "to": "b", "requires": true },
              { "from": "b", "to": "c", "requires": { "all": [{ "has": "x" }, { "has": "y" }] } }
            ]
            """);
        var o = JsonNode.Parse(json)!.AsObject();
        o["id"] ??= "T";
        o["op"] ??= "add";
        o["file"] ??= "entrances";
        o["source"] ??= "m10_00_00_00 Event_11000532";
        return OverrideProblems(o, file => file == "entrances" ? rows : null);
    }

    [Fact]
    public void Are_checked_against_the_exported_records()
    {
        Assert.Empty(Check("""{ "op": "condition", "match": { "from": "b" }, "value": { "has": "y" } }"""));
        Assert.Empty(Check("""{ "op": "replace", "match": { "from": "a" }, "value": { "requires": true } }"""));
        Assert.Empty(Check("""{ "op": "replace", "match": { "from": "x" }, "value": { "from": "a" } }"""));
        Assert.Equal(
            ["T: target matches 0 records"],
            Check("""{ "op": "replace", "match": { "from": "a" }, "value": { "requires": false } }"""));
        Assert.Empty(Check("""{ "op": "add", "value": { "from": "a", "to": "b" } }"""));
        Assert.Empty(Check("""{ "op": "add", "match": { "from": "b" }, "value": { "from": "b", "mandatory": true } }"""));
        Assert.Empty(Check("""{ "op": "remove", "match": { "from": "z" } }"""));
        Assert.Equal(["T: the removed record is still there"], Check("""{ "op": "remove", "match": { "from": "a" } }"""));
        Assert.Equal(["T: target matches 0 records"], Check("""{ "op": "condition", "match": { "from": "z" }, "value": true }"""));
        Assert.Equal(["T: condition not applied"], Check("""{ "op": "condition", "match": { "from": "a" }, "value": { "has": "y" } }"""));
        Assert.Equal(["T: meta is not a list file"], Check("""{ "file": "meta", "op": "remove", "match": {} }"""));
        Assert.Contains("T: source cites no game evidence", Check("""{ "op": "remove", "match": {}, "source": "private research notes" }"""));
        Assert.Equal(
            ["T: source names a private path"],
            Check("""{ "op": "remove", "match": { "from": "z" }, "source": "Event_1 in knowledge/notes/x.md" }"""));
    }
}
