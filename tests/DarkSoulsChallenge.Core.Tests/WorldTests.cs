using static DarkSoulsChallenge.Core.Tests.Fixtures;

namespace DarkSoulsChallenge.Core.Tests;

public class WorldTests
{
    private static object RegionRow(string id, string? area = "a", bool isVirtual = false) =>
        new { id, name = id, area, mandatory = false, @virtual = isVirtual };

    private static object LocationRow(string region, string item, string category = "KEY") =>
        new { name = $"{region}: {item}", region, item, count = 1, category, mandatory = false };

    private static RawDataSet Raw() => new()
    {
        Meta = J(new { start = "cell", goal = "Boss Defeated" }),
        Regions = J(L(RegionRow("cell"), RegionRow("arena"), RegionRow("shop", null, true))),
        Entrances = J(L(
            new { from = "cell", to = "arena", requires = new { any = L(new { has = "Key" }, new { has = "Master Key" }) } },
            new { from = "arena", to = "cell", requires = true, walkBack = false })),
        Locations = J(L(LocationRow("cell", "Key"), LocationRow("arena", "Boss Defeated", "BOSS"))),
        Classes = J(new
        {
            classes = L(),
            gifts = L(new { row = 1, items = L("(none)") }, new { row = 2, items = L("Master Key") }),
        }),
        Bosses = J(L(new { id = "the-boss", name = "The Boss", region = "arena" })),
        Merchants = J(L(new { id = "trader", name = "Trader", regions = L("shop") })),
    };

    private static IReadOnlyList<string> ProblemsOf(RawDataSet data)
    {
        try
        {
            WorldParser.Parse(data);
            return [];
        }
        catch (WorldParseException error)
        {
            return error.Problems;
        }
    }

    [Fact]
    public void Builds_the_world_and_applies_the_schema_defaults()
    {
        var world = WorldParser.Parse(Raw());
        Assert.Equal("cell", world.Start);
        Assert.Null(world.Regions["shop"].Area);
        Assert.True(world.Regions["shop"].Virtual);
        Assert.False(world.Regions["cell"].Virtual);
        Assert.Equal([true, false], world.Entrances.Select(e => e.WalkBack));
    }

    [Fact]
    public void Links_each_boss_to_the_death_item_of_its_region_whatever_the_names() =>
        Assert.Equal("Boss Defeated", WorldParser.Parse(Raw()).Bosses["the-boss"].DefeatedItem);

    [Fact]
    public void Reads_merchants_and_checks_their_regions()
    {
        Assert.Equal(["shop"], WorldParser.Parse(Raw()).Merchants["trader"].Regions);
        var merchants = J(L(new { id = "trader", name = "Trader", regions = L("attic") }));
        Assert.Equal(
            ["unknown region \"attic\" at merchants[0].regions[0]"],
            ProblemsOf(Raw() with { Merchants = merchants }));
    }

    [Fact]
    public void Rejects_a_boss_whose_region_has_no_single_death_item()
    {
        var bosses = J(L(new { id = "a", name = "A", region = "cell" }, new { id = "a", name = "A", region = "arena" }));
        Assert.Equal(
            [
                "expected one BOSS location in \"cell\", found 0 at bosses[0].region",
                "duplicate boss \"a\" at bosses[1].id",
            ],
            ProblemsOf(Raw() with { Bosses = bosses }));
    }

    [Fact]
    public void Reads_starting_gifts_with_counts_and_the_empty_gift()
    {
        var classes = J(new
        {
            gifts = L(
                new { row = 1, items = L("(none)") },
                new { row = 2, items = L("Black Firebomb x10") },
                new { row = 3, items = L("Master Key") }),
        });
        var gifts = WorldParser.Parse(Raw() with { Classes = classes }).Gifts;
        Assert.Equal([1, 2, 3], gifts.Select(g => g.Row));
        Assert.Empty(gifts[0].Items);
        Assert.Equal(new GiftItem("Black Firebomb", 10), Assert.Single(gifts[1].Items));
        Assert.Equal(new GiftItem("Master Key", 1), Assert.Single(gifts[2].Items));
    }

    [Fact]
    public void Accepts_an_item_that_only_a_starting_gift_gives() => Assert.Empty(ProblemsOf(Raw()));

    [Fact]
    public void Reports_every_broken_reference_at_once()
    {
        var problems = ProblemsOf(Raw() with
        {
            Meta = J(new { start = "nowhere", goal = "Nothing" }),
            Entrances = J(L(new
            {
                from = "cell",
                to = "void",
                requires = new { all = L(new { has = "Ghost Key" }, new { region = "limbo" }) },
            })),
            Locations = J(L(LocationRow("cell", "Key"), LocationRow("attic", "Boss Defeated"))),
        });
        Assert.Equal(
            [
                "unknown region \"nowhere\" at meta.start",
                "goal \"Nothing\" is not an item of any location at meta.goal",
                "unknown region \"void\" at entrances[0].to",
                "unknown region \"limbo\" at entrances[0].requires",
                "item \"Ghost Key\" cannot be obtained at entrances[0].requires",
                "unknown region \"attic\" at locations[1].region",
                "expected one BOSS location in \"arena\", found 0 at bosses[0].region",
            ],
            problems);
    }

    [Fact]
    public void Reports_shape_problems_with_their_path_bad_requirements_included()
    {
        var problems = ProblemsOf(Raw() with
        {
            Regions = J(L(RegionRow("cell"), RegionRow("cell"), new { id = "arena", name = "", area = 1, mandatory = "no" })),
            Entrances = J(L(new { from = "cell", to = "arena", requires = new { has = "" } })),
        });
        Assert.Equal(
            [
                "duplicate region \"cell\" at regions[1].id",
                "expected a non-empty string at regions[2].name",
                "expected a non-empty string at regions[2].area",
                "expected a boolean at regions[2].mandatory",
                "\"has\" must be a non-empty string at entrances[0].requires.has",
                "unknown region \"shop\" at merchants[0].regions[0]",
            ],
            problems);
    }

    [Fact]
    public void Rejects_files_that_are_not_the_expected_containers()
    {
        var problems = ProblemsOf(Raw() with { Meta = J(L()), Regions = J(new { }), Classes = J(null) });
        Assert.Equal(
            [
                "expected an object at meta",
                "expected a non-empty string at meta.start",
                "expected a non-empty string at meta.goal",
                "expected an array at regions",
                "expected an object at classes",
                "expected an array at classes.gifts",
                "unknown region \"cell\" at entrances[0].from",
                "unknown region \"arena\" at entrances[0].to",
                "item \"Master Key\" cannot be obtained at entrances[0].requires",
                "unknown region \"arena\" at entrances[1].from",
                "unknown region \"cell\" at entrances[1].to",
                "unknown region \"cell\" at locations[0].region",
                "unknown region \"arena\" at locations[1].region",
                "unknown region \"arena\" at bosses[0].region",
                "unknown region \"shop\" at merchants[0].regions[0]",
            ],
            problems);
    }

    [Fact]
    public void Loads_the_DS1_data_set()
    {
        Assert.True(Ds1.Regions.Count > 100);
        Assert.Contains(Ds1.Gifts, g => g.Items.Count == 0);
    }
}
