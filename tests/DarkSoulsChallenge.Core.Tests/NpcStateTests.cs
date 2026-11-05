using System.Text.Json;
using DarkSoulsChallenge.Core.Orders;
using static DarkSoulsChallenge.Core.Tests.Fixtures;

namespace DarkSoulsChallenge.Core.Tests;

/// <summary>NPC and shop state from the game's scripts, checked on the exported data set.</summary>
public class NpcStateTests
{
    private static readonly Dictionary<string, JsonElement> Merchants =
        ReadFile("merchants").EnumerateArray().ToDictionary(m => m.GetProperty("id").GetString()!);

    private static List<int> LeaveFlags(string merchant) => Merchants[merchant].GetProperty("leaves")
        .EnumerateArray().Select(l => l.GetProperty("flag").GetInt32()).ToList();

    private static IReadOnlySet<string> Without(string item) =>
        Reachability.Walk(Ds1, new ReachOptions { ForbiddenItems = Set(item) }).Regions;

    // Domhnall sells the set of whichever of Ornstein and Smough dies last, never both.
    [Fact]
    public void Gives_Domhnalls_Ornstein_and_Smough_sets_as_exclusive_options()
    {
        var domhnall = Merchants["domhnall-of-zena"];
        var group = domhnall.GetProperty("exclusive").EnumerateArray()
            .First(g => g.GetProperty("id").GetString() == "ornstein-or-smough");
        var options = group.GetProperty("options").EnumerateArray().ToList();
        Assert.Equal([11510902, 11510903], options.Select(o => o.GetProperty("flag").GetInt32()));
        var ornstein = Strings(options[0].GetProperty("items"));
        var smough = Strings(options[1].GetProperty("items"));
        Assert.All(ornstein, i => Assert.StartsWith("Ornstein's", i, StringComparison.Ordinal));
        Assert.All(smough, i => Assert.StartsWith("Smough's", i, StringComparison.Ordinal));
        var stock = domhnall.GetProperty("stock").EnumerateArray()
            .Select(s => s.GetProperty("name").GetString()).ToHashSet();
        Assert.Empty(ornstein.Concat(smough).Where(i => !stock.Contains(i)));
    }

    // Kaathe appears after the Four Kings only while the Lordvessel is not placed, and leaves for good once refused or
    // attacked.
    [Fact]
    public void Opens_Kaathe_after_the_Four_Kings_before_the_Lordvessel_is_placed()
    {
        Assert.Equal(["the-abyss-darkstalker-kaathe"], Strings(Merchants["darkstalker-kaathe"].GetProperty("regions")));
        Assert.Equal([1677], LeaveFlags("darkstalker-kaathe"));
        Assert.Equal("Lordvessel Placed", Ds1.Entrances.First(e => e.To == "the-abyss-darkstalker-kaathe").Before);
        Assert.Contains("the-abyss-darkstalker-kaathe", Reachability.Walk(Ds1).Regions);
        var placed = Reachability.Walk(Ds1, new ReachOptions { Items = ["Lordvessel Placed"] });
        Assert.DoesNotContain("the-abyss-darkstalker-kaathe", placed.Regions);
        Assert.DoesNotContain("the-abyss-darkstalker-kaathe", Without("Four Kings Defeated"));
    }

    // Rhea is lost once two more main bosses die after she reaches the Parish, or once her stock is bought out; her
    // shop, opened by the rescue in the Tomb of the Giants, stays on the graph.
    [Fact]
    public void Records_the_two_ways_Rhea_leaves_after_the_Tomb_of_the_Giants()
    {
        Assert.Equal([1177, 1181], LeaveFlags("rhea-of-thorolund"));
        var shop = Reachability.Walk(Ds1, new ReachOptions { ForbiddenRegions = Set("tomb-of-the-giants") });
        Assert.DoesNotContain(Strings(Merchants["rhea-of-thorolund"].GetProperty("regions")), shop.Regions.Contains);
    }

    // Domhnall comes to Firelink once both bells are rung, wherever the player has been.
    [Fact]
    public void Brings_Domhnall_to_Firelink_after_both_bells()
    {
        var requires = Assert.IsType<Requirement.All>(Ds1.Entrances.First(e => e.To == "firelink-shrine-domhnall-of-zena").Requires);
        Assert.Equal<Requirement>(
            [new Requirement.Has("Bell of Awakening #1"), new Requirement.Has("Bell of Awakening #2")],
            requires.Children);
        Assert.DoesNotContain("firelink-shrine-domhnall-of-zena", Without("Bell of Awakening #2"));
    }

    // Logan sells at Firelink once rescued, and in the Archives before Seath dies.
    [Fact]
    public void Opens_Logans_shops_at_Firelink_and_in_the_Archives_without_Seath()
    {
        Assert.Equal(["firelink-shrine-big-hat-logan", "the-dukes-archives-big-hat-logan"], Ds1.Merchants["logan"].Regions);
        var noSeath = Without("Seath the Scaleless Defeated");
        Assert.Contains("the-dukes-archives-big-hat-logan", noSeath);
        Assert.Contains("firelink-shrine-big-hat-logan", noSeath);
        Assert.Contains("Sorcery: Soul Spear", Ds1.Locations.Where(l => l.Region == "firelink-shrine-big-hat-logan").Select(l => l.Item));
        var noCage = Reachability.Walk(Ds1, new ReachOptions { ForbiddenRegions = Set("sens-fortress-after-cage-key") });
        Assert.DoesNotContain("firelink-shrine-big-hat-logan", noCage.Regions);
    }

    // Quelana waits for an upgraded Pyromancy Flame (Laurentius or Eingyi upgrades it), and leaves for good if the Bed
    // of Chaos dies before she is met.
    [Fact]
    public void Opens_Quelana_with_a_Pyromancy_Flame_and_an_upgrader_before_the_Bed_of_Chaos_dies()
    {
        const string Quelana = "lower-blighttown-quelana-of-izalith";
        Assert.Equal("Bed of Chaos Defeated", Ds1.Entrances.First(e => e.To == Quelana).Before);
        var empty = new StartingGift(0, []);
        var pyromancer = Validator.StartingItems(Ds1, new Setup(Mode.Static, empty, "Pyromancer"));
        var knight = Validator.StartingItems(Ds1, new Setup(Mode.Static, empty, "Knight"));
        var noLaurentius = Set("firelink-shrine-laurentius-of-the-great-swamp");
        Assert.Contains("Pyromancy Flame", pyromancer);
        Assert.Contains(Quelana, Reachability.Walk(Ds1, new ReachOptions { Items = pyromancer, ForbiddenRegions = noLaurentius }).Regions);
        Assert.DoesNotContain(Quelana, Reachability.Walk(Ds1, new ReachOptions { Items = knight, ForbiddenRegions = noLaurentius }).Regions);
        Assert.Contains(Quelana, Reachability.Walk(Ds1, new ReachOptions { Items = knight }).Regions);
        var bedDead = Reachability.Walk(Ds1, new ReachOptions { Items = [.. knight, "Bed of Chaos Defeated"] });
        Assert.DoesNotContain(Quelana, bedDead.Regions);
    }
}
