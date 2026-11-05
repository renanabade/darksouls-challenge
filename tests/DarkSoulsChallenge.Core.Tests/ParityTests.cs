using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using DarkSoulsChallenge.Core.Generation;
using DarkSoulsChallenge.Core.Orders;
using static DarkSoulsChallenge.Core.Tests.Fixtures;

namespace DarkSoulsChallenge.Core.Tests;

/// <summary>
/// Generator 7 draws exactly what the TypeScript generator 7 drew. The files in References/ were produced by that
/// generator once, and are the proof that the move to .NET changed no challenge. They go away with generator 8.
/// </summary>
public class ParityTests
{
    private static readonly JsonElement References = ReadReference("generator-7.json");

    private static JsonElement ReadReference(string file)
    {
        using var document = JsonDocument.Parse(File.ReadAllText(Path.Combine(DataSet.References, file)));
        return document.RootElement.Clone();
    }

    private static string Sha256(string text) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(text)));

    private static string? Text(JsonElement config, string name) =>
        config.TryGetProperty(name, out var value) ? value.GetString() : null;

    private static int? Number(JsonElement config, string name) =>
        config.TryGetProperty(name, out var value) ? value.GetInt32() : null;

    private static TEnum Named<TEnum>(string name)
        where TEnum : struct, Enum => Enum.Parse<TEnum>(name, ignoreCase: true);

    private static GeneratorConfig ConfigOf(JsonElement config, Difficulty? difficulty = null) =>
        new(Text(config, "seed")!, difficulty ?? Named<Difficulty>(Text(config, "difficulty")!), Named<Length>(Text(config, "length")!))
        {
            Curve = Text(config, "curve") is { } curve ? Named<Curve>(curve) : null,
            StartingClass = Text(config, "startingClass"),
            GiftRow = Number(config, "giftRow"),
            LevelCap = Number(config, "levelCap"),
        };

    private static void AssertMatches(JsonElement reference, Challenge challenge)
    {
        var seed = challenge.Config.Seed;
        Assert.Equal(reference.GetProperty("dataVersion").GetString(), challenge.DataVersion);
        Assert.Equal(reference.GetProperty("curve").GetString(), challenge.Curve.Name());
        var setup = reference.GetProperty("setup");
        Assert.Equal(setup.GetProperty("startingClass").GetString(), challenge.Setup.StartingClass);
        Assert.Equal(setup.GetProperty("levelCap").GetInt32(), challenge.Setup.LevelCap);
        Assert.Equal(setup.GetProperty("gift").GetProperty("row").GetInt32(), challenge.Setup.Gift.Row);
        Assert.Equal(Strings(reference.GetProperty("orders")), challenge.Orders.Select(o => o.Template.Id));
        Assert.True(
            reference.GetProperty("sha256").GetString() == Sha256(Manual.Render(Ds1, challenge)),
            $"the manual of {seed} differs from generator 7's");
    }

    [Fact]
    public void Is_on_the_reference_version() =>
        Assert.Equal(Generator.Version, References.GetProperty("generatorVersion").GetString());

    [Fact]
    public void Draws_the_reference_solo_challenges()
    {
        var solo = References.GetProperty("solo").EnumerateArray().ToList();
        Assert.Equal(92, solo.Count);
        foreach (var reference in solo)
        {
            AssertMatches(reference, Generator.Generate(Ds1, ConfigOf(reference.GetProperty("config"))));
        }
    }

    [Fact]
    public void Draws_the_reference_group_challenges()
    {
        foreach (var reference in References.GetProperty("group").EnumerateArray())
        {
            var players = Strings(reference.GetProperty("players")).Select(Named<Difficulty>).ToList();
            var group = Generator.GenerateGroup(Ds1, ConfigOf(reference.GetProperty("config"), Difficulty.Medium), players);
            var challenges = reference.GetProperty("challenges").EnumerateArray().ToList();
            Assert.Equal(challenges.Count, group.Count);
            for (var i = 0; i < group.Count; i++) AssertMatches(challenges[i], group[i]);
        }
    }

    // A failure here is read as text: which line of the manual moved.
    [Theory]
    [InlineData("short-0")]
    [InlineData("short-1")]
    [InlineData("short-2")]
    [InlineData("short-3")]
    [InlineData("full-0")]
    [InlineData("full-1")]
    [InlineData("epic-0")]
    public void Prints_the_reference_manuals(string seed)
    {
        var config = References.GetProperty("solo").EnumerateArray()
            .Select(r => r.GetProperty("config"))
            .First(c => c.GetProperty("seed").GetString() == seed);
        var expected = File.ReadAllText(Path.Combine(DataSet.References, "manuals", $"{seed}.md"));
        Assert.Equal(expected, Manual.Render(Ds1, Generator.Generate(Ds1, ConfigOf(config))));
    }

    /// <summary>Twenty seeds per class, one hash per manual, from the TypeScript project's own snapshot.</summary>
    [Fact]
    public void Draws_the_same_manuals_for_twenty_seeds_of_each_class()
    {
        var levels = Curves.Difficulties;
        foreach (var classHashes in ReadReference("generator-7-class-hashes.json").EnumerateObject())
        {
            var expected = Strings(classHashes.Value);
            for (var i = 0; i < 20; i++)
            {
                var challenge = Generator.Generate(Ds1, new GeneratorConfig($"snapshot-{i}", levels[i % 4], Length.Short)
                {
                    StartingClass = classHashes.Name,
                });
                Assert.Equal(expected[i], Sha256(Manual.Render(Ds1, challenge))[..16]);
            }
        }
    }

    // Across 1000 seeds, every challenge passes the validator, reachability included.
    [Fact]
    public void Validates_the_challenge_of_every_one_of_1000_seeds()
    {
        var failed = new List<string>();
        Parallel.For(0, 1000, i =>
        {
            var seed = $"property-{i}";
            try
            {
                var challenge = Generator.Generate(Ds1, new GeneratorConfig(seed, Curves.Difficulties[i % 4], Length.Short));
                var result = Validator.Validate(Ds1, challenge.Setup, challenge.Orders);
                if (result.Verdict != Verdict.Comfortable)
                {
                    lock (failed) failed.Add($"{seed}: {string.Join("; ", result.Problems)}");
                }
            }
            catch (InvalidOperationException error)
            {
                lock (failed) failed.Add($"{seed}: {error.Message}");
            }
        });
        Assert.Empty(failed);
    }
}
