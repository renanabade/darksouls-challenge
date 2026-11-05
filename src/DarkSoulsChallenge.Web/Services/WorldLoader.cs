using System.Reflection;
using DarkSoulsChallenge.Core;

namespace DarkSoulsChallenge.Web.Services;

/// <summary>
/// Parses the data set once: the world then lives in the browser, and generating needs no server. The files are embedded in
/// this assembly, so the site and its data can never be of different versions.
/// </summary>
public sealed class WorldLoader
{
    private Task<World>? _world;

    public Task<World> GetAsync() => _world ??= LoadAsync();

    private static async Task<World> LoadAsync()
    {
        // Parsing runs on the browser's only thread: let "Kindling the bonfire" paint first.
        await Task.Delay(30);
        return WorldParser.Parse(RawDataSet.FromText(Read));
    }

    private static string Read(string file)
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream($"data.{file}.json")
            ?? throw new InvalidOperationException($"the data file \"{file}\" is not embedded");
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
