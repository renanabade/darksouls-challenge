using System.Text.Json;
using DarkSoulsChallenge.Core.Generation;
using DarkSoulsChallenge.Core.Orders;
using static DarkSoulsChallenge.Core.Tests.Fixtures;

namespace DarkSoulsChallenge.Core.Tests;

public class DocumentTests
{
    [Fact]
    public void Writes_a_challenge_as_plain_json_with_its_manual()
    {
        var request = new GenerationRequest { Seed = "doc", Players = [Difficulty.Hard], Length = Length.Short };
        var document = request.Run(Ds1)[0];
        using var json = JsonDocument.Parse(JsonSerializer.Serialize(document, CoreJsonContext.Default.ChallengeDocument));
        var root = json.RootElement;
        Assert.Equal("doc", root.GetProperty("config").GetProperty("seed").GetString());
        Assert.Equal("hard", root.GetProperty("config").GetProperty("difficulty").GetString());
        Assert.Equal("short", root.GetProperty("config").GetProperty("length").GetString());
        Assert.Equal(document.Manual, root.GetProperty("manual").GetString());
        var lord = root.GetProperty("orders").EnumerateArray().First(o => o.GetProperty("id").GetString() == "lord-order");
        Assert.Equal(4, lord.GetProperty("args").GetProperty("order").GetArrayLength());
        Assert.False(lord.TryGetProperty("chapter", out _));
    }

    [Fact]
    public void Reads_back_the_arguments_it_writes()
    {
        var args = new OrderArgs { ["area"] = "depths", ["chests"] = 3, ["order"] = new[] { "a", "b" } };
        var options = new JsonSerializerOptions { Converters = { new OrderArgsConverter() } };
        var back = JsonSerializer.Deserialize<OrderArgs>(JsonSerializer.Serialize(args, options), options)!;
        Assert.Equal("depths", back.Text("area"));
        Assert.Equal(3, back.Number("chests"));
        Assert.Equal(["a", "b"], back.List("order"));
    }

    [Fact]
    public void Gives_one_document_per_player_in_their_order()
    {
        var request = new GenerationRequest { Seed = "doc", Players = [Difficulty.Easy, Difficulty.Hard], Length = Length.Short };
        var documents = request.Run(Ds1);
        Assert.Equal([Difficulty.Easy, Difficulty.Hard], documents.Select(d => d.Config.Difficulty));
    }

    [Fact]
    public void Draws_a_seed_when_none_is_given() =>
        Assert.NotEmpty(new GenerationRequest { Length = Length.Short }.Run(Ds1)[0].Config.Seed);

    [Fact]
    public void Reports_what_is_wrong_with_a_request()
    {
        Assert.Empty(new GenerationRequest().Problems());
        Assert.Equal(
            [
                "the seed must have 1 to 64 characters",
                "a challenge has 1 to 8 players",
                "the class must have 1 to 32 characters",
                "the gift row cannot be negative",
                "the level cap must be positive",
            ],
            new GenerationRequest { Seed = " ", Players = [], StartingClass = "", GiftRow = -1, LevelCap = 0 }.Problems());
    }
}
