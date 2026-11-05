using System.Text.Json;
using DarkSoulsChallenge.Core.Orders;

namespace DarkSoulsChallenge.Core.Tests;

/// <summary>What the tests share: the DS1 world, and short ways to write small test worlds and orders.</summary>
internal static class Fixtures
{
    private static readonly Lazy<World> Ds1World = new(() => WorldParser.Parse(ReadDataSet()));

    /// <summary>The DS1 world, parsed once: it is immutable, and parsing it for every test costs seconds.</summary>
    public static World Ds1 => Ds1World.Value;

    public static StartingGift NoGift => Ds1.Gifts.First(g => g.Items.Count == 0);

    public static StartingGift MasterKeyGift => Ds1.Gifts.First(g => g.Items.Any(i => i.Item == "Master Key"));

    public static RawDataSet ReadDataSet() => RawDataSet.FromDirectory(DataSet.Directory);

    public static JsonElement ReadFile(string file)
    {
        using var document = JsonDocument.Parse(File.ReadAllText(DataSet.PathOf($"{file}.json")));
        return document.RootElement.Clone();
    }

    public static (List<string> Items, List<string> Regions) ReadMandatory()
    {
        var mandatory = ReadFile("mandatory");
        return (Strings(mandatory.GetProperty("items")), Strings(mandatory.GetProperty("regions")));
    }

    public static List<string> Strings(JsonElement array) =>
        array.EnumerateArray().Select(e => e.GetString()!).ToList();

    /// <summary>Plain JSON from an anonymous object, as the data set files would hold it.</summary>
    public static JsonElement J(object? value) => JsonSerializer.SerializeToElement(value);

    public static object[] L(params object[] items) => items;

    public static HashSet<string> Set(params string[] items) => items.ToHashSet(StringComparer.Ordinal);

    public static List<string> Sorted(IEnumerable<string> items) => items.Order(StringComparer.Ordinal).ToList();

    public static OrderInstance Order(string id, OrderArgs? args = null, int? chapter = null) =>
        new(Catalog.Get(id), args ?? [], chapter);
}
