using System.Text.Json;
using DarkSoulsChallenge.Core;

namespace DarkSoulsChallenge.Core.Tests;

public class RequirementTests
{
    private static Requirement Parse(string json)
    {
        using var document = JsonDocument.Parse(json);
        return Requirement.Parse(document.RootElement);
    }

    private static bool Evaluate(Requirement requirement, string[] items, string[]? regions = null) =>
        requirement.Evaluate(items.Contains, id => (regions ?? []).Contains(id));

    [Fact]
    public void Constants_evaluate_to_themselves()
    {
        Assert.True(Evaluate(Parse("true"), []));
        Assert.False(Evaluate(Parse("false"), []));
    }

    [Fact]
    public void Items_and_regions_are_checked_against_the_context()
    {
        Assert.True(Evaluate(Parse("""{"has":"Master Key"}"""), ["Master Key"]));
        Assert.False(Evaluate(Parse("""{"has":"Master Key"}"""), []));
        Assert.True(Evaluate(Parse("""{"region":"firelink-shrine"}"""), [], ["firelink-shrine"]));
    }

    [Fact]
    public void All_and_any_combine_including_nesting()
    {
        var requirement = Parse("""
            {"all":[{"region":"sens-fortress"},{"any":[{"has":"Cage Key"},{"has":"Master Key"}]}]}
            """);

        Assert.True(Evaluate(requirement, ["Master Key"], ["sens-fortress"]));
        Assert.False(Evaluate(requirement, ["Master Key"]));
        Assert.False(Evaluate(requirement, [], ["sens-fortress"]));
    }

    [Fact]
    public void Items_collects_every_item_named_anywhere()
    {
        var requirement = Parse("""{"all":[{"has":"A"},{"any":[{"has":"B"},{"region":"r"}]}]}""");

        Assert.Equal(["A", "B"], requirement.Items());
        Assert.Equal(["r"], requirement.Regions());
    }

    [Theory]
    [InlineData("null", "$")]
    [InlineData("[]", "$")]
    [InlineData("{}", "$")]
    [InlineData("""{"has":"A","region":"r"}""", "$")]
    [InlineData("""{"has":""}""", "$.has")]
    [InlineData("""{"all":[]}""", "$.all")]
    [InlineData("""{"any":[{"has":"A"},{"nope":1}]}""", "$.any[1]")]
    public void Bad_input_is_rejected_with_the_path_of_the_bad_node(string json, string path)
    {
        var error = Assert.Throws<RequirementParseException>(() => Parse(json));

        Assert.Equal(path, error.Path);
    }

    [Fact]
    public void Every_requirement_of_the_data_set_parses()
    {
        using var document = JsonDocument.Parse(File.ReadAllBytes(DataSet.PathOf("entrances.json")));
        var entrances = document.RootElement.EnumerateArray().ToList();

        Assert.NotEmpty(entrances);
        foreach (var (entrance, i) in entrances.Select((e, i) => (e, i)))
        {
            Requirement.Parse(entrance.GetProperty("requires"), $"entrances[{i}]");
        }
    }
}
