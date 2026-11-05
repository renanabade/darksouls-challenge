using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using DarkSoulsChallenge.Core.Generation;
using static DarkSoulsChallenge.Core.Tests.Fixtures;

namespace DarkSoulsChallenge.Core.Tests;

/// <summary>
/// Locks what the generator draws: twenty seeds per class, one hash per manual. A change here is a change of the challenges
/// players share, and needs a version bump. After a bump, run the tests once with UPDATE_SNAPSHOTS=1 to write the new file.
/// </summary>
public class SnapshotTests
{
    private static string SnapshotPath => Path.Combine(DataSet.References, $"generator-{Generator.Version}-class-hashes.json");

    private static string Sha256(string text) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(text)));

    private static SortedDictionary<string, List<string>> Draw()
    {
        var hashes = new SortedDictionary<string, List<string>>(StringComparer.Ordinal);
        foreach (var startingClass in Ds1.Classes.Keys)
        {
            hashes[startingClass] = Enumerable.Range(0, 20)
                .AsParallel()
                .AsOrdered()
                .Select(i => Sha256(Manual.Render(Ds1, Generator.Generate(Ds1, new GeneratorConfig($"snapshot-{i}", Curves.Difficulties[i % 4], Length.Short)
                {
                    StartingClass = startingClass,
                })))[..16])
                .ToList();
        }

        return hashes;
    }

    [Fact]
    public void Draws_the_same_manuals_for_twenty_seeds_of_each_class()
    {
        var drawn = Draw();
        if (Environment.GetEnvironmentVariable("UPDATE_SNAPSHOTS") == "1")
        {
            var text = JsonSerializer.Serialize(drawn, new JsonSerializerOptions { WriteIndented = true }).ReplaceLineEndings("\n");
            File.WriteAllText(SnapshotPath, text + "\n");
        }

        using var expected = JsonDocument.Parse(File.ReadAllText(SnapshotPath));
        foreach (var classHashes in expected.RootElement.EnumerateObject())
        {
            Assert.Equal(Strings(classHashes.Value), drawn[classHashes.Name]);
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
