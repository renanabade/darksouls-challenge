using DarkSoulsChallenge.Core.Generation;
using DarkSoulsChallenge.Core.Orders;
using static DarkSoulsChallenge.Core.Tests.Fixtures;

namespace DarkSoulsChallenge.Core.Tests;

public class ChallengeCodeTests
{
    private static GeneratorConfig Decode(string code)
    {
        Assert.True(ChallengeCode.TryDecode(Ds1, code, out var decoded, out var problem), problem);
        return decoded!.Config;
    }

    [Fact]
    public void Round_trips_every_option_combination()
    {
        var classes = Ds1.Classes.Keys.Cast<string?>().Prepend(null).ToList();
        var gifts = Ds1.Gifts.Select(g => (int?)g.Row).Prepend(null).ToList();
        var curves = Curves.All.Select(c => (Curve?)c).Prepend(null).ToList();
        var count = 0;
        foreach (var difficulty in Curves.Difficulties)
            foreach (var length in new[] { Length.Short, Length.Full, Length.Epic })
                foreach (var curve in curves)
                    foreach (var startingClass in classes)
                        foreach (var gift in gifts)
                            foreach (var levelCap in new int?[] { null, 1, 60, ChallengeCode.MaxLevelCap })
                            {
                                var config = new GeneratorConfig((count * 7919 % (1 << ChallengeCode.SeedBits)).ToString(System.Globalization.CultureInfo.InvariantCulture), difficulty, length)
                                {
                                    Curve = curve,
                                    StartingClass = startingClass,
                                    GiftRow = gift,
                                    LevelCap = levelCap,
                                };
                                Assert.Equal(config, Decode(ChallengeCode.Encode(Ds1, config)));
                                count++;
                            }

        Assert.True(count > 10000);
    }

    [Fact]
    public void Writes_the_game_both_versions_and_ten_symbols()
    {
        var code = ChallengeCode.Encode(Ds1, new GeneratorConfig("1", Difficulty.Medium, Length.Short));
        Assert.Matches(@"^ds1\.8\.07-[0-9A-HJKMNP-TV-Z]{10}$", code);
    }

    [Fact]
    public void Reads_a_code_in_any_case_and_with_look_alike_symbols()
    {
        var code = ChallengeCode.Encode(Ds1, new GeneratorConfig("12345", Difficulty.Hard, Length.Epic) { StartingClass = "Knight" });
        Assert.Equal(Decode(code), Decode(code.ToLowerInvariant()));
        Assert.Equal(Decode(code), Decode($"  {code} "));
        var ones = code[..^1] + "1";
        Assert.Equal(Decode(ones), Decode(code[..^1] + "I"));
        Assert.Equal(Decode(ones), Decode(code[..^1] + "l"));
    }

    [Fact]
    public void A_code_reproduces_the_exact_challenge_and_overrides_the_request()
    {
        var first = new GenerationRequest { Seed = "ashen-one", Players = [Difficulty.Hard], Length = Length.Short, Curve = Curve.Rising, StartingClass = "Thief" }.Run(Ds1)[0];
        var again = new GenerationRequest { Code = first.Code, Players = [Difficulty.Easy], Length = Length.Epic, StartingClass = "Knight" }.Run(Ds1)[0];
        Assert.Equal(first.Manual, again.Manual);
        Assert.Equal(first.Code, again.Code);
    }

    [Fact]
    public void Text_and_number_seeds_share_one_space_of_challenges()
    {
        var number = ChallengeCode.SeedNumber("ashen-one").ToString(System.Globalization.CultureInfo.InvariantCulture);
        var text = Generator.Generate(Ds1, new GeneratorConfig("ashen-one", Difficulty.Easy, Length.Short));
        var digits = Generator.Generate(Ds1, new GeneratorConfig(number, Difficulty.Easy, Length.Short));
        Assert.Equal(text.Code, digits.Code);
        Assert.Equal(Manual.Render(Ds1, text), Manual.Render(Ds1, digits));
    }

    [Fact]
    public void Prints_the_code_and_never_the_seed_in_the_manual()
    {
        var challenge = Generator.Generate(Ds1, new GeneratorConfig("ashen-one", Difficulty.Easy, Length.Short));
        var manual = Manual.Render(Ds1, challenge);
        Assert.StartsWith($"# Dark Souls challenge — {challenge.Code}\n", manual, StringComparison.Ordinal);
        Assert.DoesNotContain("ashen-one", manual, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("")]
    [InlineData("hello")]
    [InlineData("ds1.8.07-SHORT")]
    [InlineData("ds1.8-K3F9QX2M7T")]
    [InlineData("ds1.8.07-K3F9QX2M7U")] // U is not in the alphabet
    public void Refuses_what_is_not_a_code(string text)
    {
        Assert.False(ChallengeCode.TryDecode(Ds1, text, out _, out var problem));
        Assert.Equal("this is not a challenge code", problem);
    }

    [Fact]
    public void Refuses_another_game_and_parameters_that_do_not_exist()
    {
        Assert.False(ChallengeCode.TryDecode(Ds1, "ds3.8.07-K3F9QX2M7T", out _, out var game));
        Assert.Equal("this code is for another game (ds3)", game);

        // Length 3 does not exist: bits 2 and 3 of the payload, in the last symbol.
        Assert.False(ChallengeCode.TryDecode(Ds1, "ds1.8.07-000000000C", out _, out var parameters));
        Assert.Equal("this code holds parameters that do not exist", parameters);
    }

    [Fact]
    public void Marks_a_code_from_another_version()
    {
        var code = ChallengeCode.Encode(Ds1, new GeneratorConfig("1", Difficulty.Easy, Length.Short));
        Assert.True(ChallengeCode.TryDecode(Ds1, code, out var current, out _));
        Assert.True(current!.IsCurrent);
        Assert.True(ChallengeCode.TryDecode(Ds1, code.Replace("ds1.8.", "ds1.7.", StringComparison.Ordinal), out var oldGenerator, out _));
        Assert.False(oldGenerator!.IsCurrent);
        Assert.Equal("7", oldGenerator.GeneratorVersion);
        Assert.True(ChallengeCode.TryDecode(Ds1, code.Replace(".07-", ".06-", StringComparison.Ordinal), out var oldData, out _));
        Assert.False(oldData!.IsCurrent);
        Assert.Equal("06", oldData.DataVersion);
    }

    [Theory]
    [InlineData("0.7.0", "07")]
    [InlineData("0.7.1", "071")]
    [InlineData("1.0.0", "10")]
    public void Writes_the_data_version_without_dots(string version, string compact) =>
        Assert.Equal(compact, ChallengeCode.CompactDataVersion(version));
}
