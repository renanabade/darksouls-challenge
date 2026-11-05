namespace DarkSoulsChallenge.Core.Tests;

/// <summary>Finds the DS1 data set from the test binaries, by walking up to the repository root.</summary>
internal static class DataSet
{
    public static string Directory { get; } = Find();

    public static string PathOf(string file) => Path.Combine(Directory, file);

    private static string Find()
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            if (File.Exists(Path.Combine(dir.FullName, "DarkSoulsChallenge.slnx")))
            {
                return Path.Combine(dir.FullName, "data", "ds1");
            }
        }

        throw new InvalidOperationException("repository root not found");
    }
}
