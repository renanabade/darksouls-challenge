using DarkSoulsChallenge.Core.Generation;
using DarkSoulsChallenge.Core.Orders;
using static DarkSoulsChallenge.Core.Tests.Fixtures;

namespace DarkSoulsChallenge.Core.Tests;

public class ChallengeLinkTests
{
    private static LinkReading Read(params (string Key, string Value)[] query) =>
        ChallengeLink.Read(Ds1, query.ToDictionary(q => q.Key, q => q.Value), () => "123");

    [Fact]
    public void Asks_for_nothing_without_parameters()
    {
        var reading = Read();
        Assert.Null(reading.Config);
        Assert.Empty(reading.Notices);
    }

    [Fact]
    public void Reads_a_code_and_gives_its_canonical_form()
    {
        var code = ChallengeCode.Encode(Ds1, new GeneratorConfig("9", Difficulty.Hard, Length.Epic));
        var reading = Read(("c", code.ToLowerInvariant()));
        Assert.Equal(code, reading.Code);
        Assert.Equal(Difficulty.Hard, reading.Config?.Difficulty);
        Assert.Empty(reading.Notices);
    }

    [Fact]
    public void Tells_when_a_code_cannot_be_read()
    {
        var reading = Read(("c", "nonsense"));
        Assert.Null(reading.Config);
        Assert.Contains("cannot be read", Assert.Single(reading.Notices), StringComparison.Ordinal);
    }

    [Fact]
    public void Tells_when_a_code_comes_from_another_generator_or_data_set()
    {
        Assert.Contains("generator 7", Assert.Single(Read(("c", "ds1.7.07-0000000000")).Notices), StringComparison.Ordinal);
        Assert.Contains("data 06", Assert.Single(Read(("c", "ds1.8.06-0000000000")).Notices), StringComparison.Ordinal);
    }

    [Fact]
    public void Keeps_reading_links_with_a_seed_with_the_text_hashed_into_the_code()
    {
        var reading = Read(("seed", "ashen-one"), ("difficulty", "hard"), ("length", "short"), ("class", "Knight"), ("gift", "2406"));
        var expected = new GeneratorConfig("ashen-one", Difficulty.Hard, Length.Short) { StartingClass = "Knight", GiftRow = 2406 };
        Assert.Equal(expected, reading.Config);
        Assert.Equal(ChallengeCode.Encode(Ds1, expected), reading.Code);
        Assert.Empty(reading.Notices);
    }

    // It once ignored the other parameters.
    [Fact]
    public void Honors_the_other_parameters_when_the_seed_is_empty()
    {
        var reading = Read(("seed", ""), ("difficulty", "hard"));
        Assert.Equal("123", reading.Config?.Seed);
        Assert.Equal(Difficulty.Hard, reading.Config?.Difficulty);
    }

    // They once fell back to the defaults in silence.
    [Theory]
    [InlineData("class", "Clown", "class")]
    [InlineData("gift", "1", "gift")]
    [InlineData("gift", "abc", "gift")]
    [InlineData("difficulty", "brutal", "difficulty")]
    [InlineData("length", "tiny", "length")]
    [InlineData("curve", "flat", "curve")]
    [InlineData("cap", "9000", "level cap")]
    public void Tells_about_each_invalid_parameter(string name, string value, string shown)
    {
        var reading = Read(("seed", "x"), (name, value));
        Assert.NotNull(reading.Config);
        Assert.Equal($"The link's {shown} \"{value}\" does not exist, and was ignored.", Assert.Single(reading.Notices));
    }

    [Fact]
    public void Tells_when_a_seed_link_comes_from_another_generator() =>
        Assert.Contains("generator 7", Assert.Single(Read(("seed", "x"), ("v", "7")).Notices), StringComparison.Ordinal);

    [Fact]
    public void Writes_the_link_of_a_code() => Assert.Equal("?c=ds1.8.07-AB", ChallengeLink.QueryOf("ds1.8.07-AB"));
}
