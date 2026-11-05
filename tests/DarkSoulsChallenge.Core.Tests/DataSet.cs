namespace DarkSoulsChallenge.Core.Tests;

/// <summary>Finds the DS1 data set from the test binaries, by walking up to the repository root.</summary>
internal static class DataSet
{
    public static string Root { get; } = Find();

    public static string Directory { get; } = Path.Combine(Root, "data", "ds1");

    public static string References { get; } = Path.Combine(Root, "tests", "DarkSoulsChallenge.Core.Tests", "References");

    public static string PathOf(string file) => Path.Combine(Directory, file);

    private static string Find()
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            if (File.Exists(Path.Combine(dir.FullName, "DarkSoulsChallenge.slnx")))
            {
                return dir.FullName;
            }
        }

        throw new InvalidOperationException("repository root not found");
    }
}
