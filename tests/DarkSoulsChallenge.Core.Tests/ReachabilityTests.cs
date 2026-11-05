using DarkSoulsChallenge.Core.Orders;
using static DarkSoulsChallenge.Core.Tests.Fixtures;

namespace DarkSoulsChallenge.Core.Tests;

public class ReachabilityTests
{
    private static object Rows(params string[] ids) => ids.Select(id => new { id, name = id, area = "x", mandatory = false }).ToArray();

    private static object Row(string name, string region, string item, string category = "KEY", bool mandatory = false) =>
        new { name, region, item, count = 1, category, mandatory };

    /// <summary>start, then a (needs Key, found in start), then b (needs Gem, found in a); c needs b reached and the Gem.</summary>
    private static readonly World Small = WorldParser.Parse(new RawDataSet
    {
        Meta = J(new { start = "start", goal = "Gem" }),
        Regions = J(Rows("start", "a", "b", "c")),
        Entrances = J(L(
            new { from = "start", to = "a", requires = (object)new { has = "Key" } },
            new { from = "a", to = "b", requires = (object)new { any = L(new { has = "Gem" }, new { has = "Lockpick" }) } },
            new { from = "a", to = "c", requires = (object)new { all = L(new { region = "b" }, new { has = "Gem" }) } },
            new { from = "start", to = "c", requires = (object)false })),
        Locations = J(L(Row("1", "start", "Key", mandatory: true), Row("2", "a", "Gem", mandatory: true))),
        Classes = J(new { gifts = L(new { row = 1, items = L("Lockpick") }) }),
        Bosses = J(L()),
        Merchants = J(L()),
    });

    [Fact]
    public void Opens_paths_with_items_picked_up_on_the_way_round_after_round()
    {
        var result = Reachability.Walk(Small);
        Assert.Equal(["a", "b", "c", "start"], Sorted(result.Regions));
        Assert.Equal(["Gem", "Key"], Sorted(result.Items));
    }

    [Fact]
    public void Never_takes_forbidden_items_so_what_they_open_stays_closed()
    {
        Assert.Equal(["start"], Sorted(Reachability.Walk(Small, new ReachOptions { ForbiddenItems = Set("Key") }).Regions));
        Assert.Equal(["a", "start"], Sorted(Reachability.Walk(Small, new ReachOptions { ForbiddenItems = Set("Gem") }).Regions));
    }

    [Fact]
    public void Uses_starting_items_as_alternatives()
    {
        var result = Reachability.Walk(Small, new ReachOptions { Items = ["Lockpick"], ForbiddenItems = Set("Gem") });
        Assert.Equal(["a", "b", "start"], Sorted(result.Regions));
    }

    [Fact]
    public void Never_enters_forbidden_regions_nor_goes_through_them() =>
        Assert.Equal(["start"], Sorted(Reachability.Walk(Small, new ReachOptions { ForbiddenRegions = Set("a") }).Regions));

    /// <summary>
    /// start, boss (its death item), after; start, shop, which closes for good once the boss is dead. The shop needs a
    /// Flame, found either at the start or only past the boss.
    /// </summary>
    private static World Closing(string flameAt) => WorldParser.Parse(new RawDataSet
    {
        Meta = J(new { start = "start", goal = "Boss Defeated" }),
        Regions = J(Rows("start", "boss", "after", "shop")),
        Entrances = J(L(
            new { from = "start", to = "boss", requires = true },
            new { from = "boss", to = "after", requires = new { has = "Boss Defeated" } },
            new { from = "start", to = "shop", requires = new { has = "Flame" }, before = "Boss Defeated" })),
        Locations = J(L(Row("1", "boss", "Boss Defeated", "BOSS", true), Row("2", flameAt, "Flame"))),
        Classes = J(new { gifts = L() }),
        Bosses = J(L()),
        Merchants = J(L()),
    });

    [Fact]
    public void Crosses_an_entrance_that_closes_on_an_item_only_if_it_opens_without_that_item()
    {
        Assert.Contains("shop", Reachability.Walk(Closing("start")).Regions);
        Assert.DoesNotContain("shop", Reachability.Walk(Closing("after")).Regions);
        Assert.Contains("shop", Reachability.Walk(Closing("after"), new ReachOptions { Items = ["Flame"] }).Regions);

        // Holding the item from the start closes the entrance from the start.
        var deadFromTheStart = new ReachOptions { Items = ["Flame", "Boss Defeated"] };
        Assert.DoesNotContain("shop", Reachability.Walk(Closing("start"), deadFromTheStart).Regions);
    }

    // a needs Y and closes on X; b needs X and closes on Y. Each opens alone (take Y, cross a; take X, cross b), but no
    // single order crosses both. The walk judges each entrance on its own item (ADR 0011).
    [Fact]
    public void Judges_each_closing_entrance_on_its_own_item_not_jointly()
    {
        var crossed = WorldParser.Parse(new RawDataSet
        {
            Meta = J(new { start = "start", goal = "X" }),
            Regions = J(Rows("start", "a", "b")),
            Entrances = J(L(
                new { from = "start", to = "a", requires = new { has = "Y" }, before = "X" },
                new { from = "start", to = "b", requires = new { has = "X" }, before = "Y" })),
            Locations = J(L(Row("1", "start", "X"), Row("2", "start", "Y"))),
            Classes = J(new { gifts = L() }),
            Bosses = J(L()),
            Merchants = J(L()),
        });
        Assert.Equal(["a", "b", "start"], Sorted(Reachability.Walk(crossed).Regions));
    }

    [Fact]
    public void Reaches_every_region_and_the_goal_with_each_starting_gift()
    {
        foreach (var gift in Ds1.Gifts)
        {
            var result = Reachability.Walk(Ds1, new ReachOptions { Items = gift.Items.Select(i => i.Item).ToList() });
            Assert.Empty(Ds1.Regions.Keys.Where(id => !result.Regions.Contains(id)));
            Assert.Contains(Ds1.Goal, result.Items);
        }
    }

    // Cross-check with the pipeline's removal analysis (mandatory.json), computed in another language. The pipeline
    // leaves out what is mandatory by definition: the goal itself and the start region.
    [Fact]
    public void Finds_the_same_mandatory_items_as_the_pipeline()
    {
        var items = Ds1.Locations.Select(l => l.Item).Where(i => i != Ds1.Goal).Distinct();
        var found = items.Where(item =>
            !Reachability.Walk(Ds1, new ReachOptions { ForbiddenItems = Set(item) }).Items.Contains(Ds1.Goal));
        Assert.Equal(Sorted(ReadMandatory().Items), Sorted(found));
    }

    [Fact]
    public void Finds_the_same_mandatory_regions_as_the_pipeline()
    {
        var found = Ds1.Regions.Keys.Where(id =>
            id != Ds1.Start
            && !Reachability.Walk(Ds1, new ReachOptions { ForbiddenRegions = Set(id) }).Items.Contains(Ds1.Goal));
        Assert.Equal(Sorted(ReadMandatory().Regions), Sorted(found));
    }

    // The golem that holds Dusk appears once the Hydra is dead, and the Broken Pendant that opens the DLC drops only
    // after Dusk is freed.
    [Fact]
    public void Chains_the_Hydra_Dusk_the_Broken_Pendant_and_the_DLC()
    {
        var withoutHydra = Reachability.Walk(Ds1, new ReachOptions { ForbiddenItems = Set("Darkroot Basin Hydra Defeated") });
        Assert.Contains("darkroot-basin", withoutHydra.Regions);
        foreach (var closed in new[] { "darkroot-basin-princess-dusk", "sanctuary-garden", "oolacile-township" })
        {
            Assert.DoesNotContain(closed, withoutHydra.Regions);
        }

        Assert.DoesNotContain("Broken Pendant", withoutHydra.Items);
        Assert.Contains(Ds1.Goal, withoutHydra.Items);
    }

    // The Bell Gargoyles' and the Centipede Demon's exit fogs go only on their death.
    [Fact]
    public void Waits_for_the_Bell_Gargoyles_and_the_Centipede_Demon()
    {
        static Reach Without(string boss) =>
            Reachability.Walk(Ds1, new ReachOptions { ForbiddenItems = Set($"{boss} Defeated") });

        var gargoyles = Without("Bell Gargoyles");
        Assert.DoesNotContain("Bell of Awakening #1", gargoyles.Items);
        Assert.DoesNotContain("undead-parish-oswald-of-carim", gargoyles.Regions);
        Assert.DoesNotContain("lost-izalith", Without("Centipede Demon").Regions);
    }

    // Which bosses a run needs follows from what it starts with. The Thief starts with the Master Key.
    [Fact]
    public void Leaves_the_Taurus_Demon_optional_with_the_Master_Key_from_the_class_or_the_gift()
    {
        static bool NeedsTaurus(IReadOnlyList<string> items) => !Reachability
            .Walk(Ds1, new ReachOptions { Items = items, ForbiddenItems = Set("Taurus Demon Defeated") })
            .Items.Contains(Ds1.Goal);

        var empty = new StartingGift(0, []);
        Assert.True(NeedsTaurus(Validator.StartingItems(Ds1, new Setup(Mode.Static, empty, "Knight"))));
        Assert.False(NeedsTaurus(Validator.StartingItems(Ds1, new Setup(Mode.Static, empty, "Thief"))));
        Assert.False(NeedsTaurus(Validator.StartingItems(Ds1, new Setup(Mode.Static, MasterKeyGift, "Knight"))));
    }

    // The walk down from the Depths side of Blighttown needs no Lordvessel (a DSAP comfort rule).
    [Fact]
    public void Walks_down_Blighttown_from_the_Depths_without_the_Lordvessel()
    {
        var edge = Ds1.Entrances.Single(e => e.From == "upper-blighttown-depths-side" && e.To == "lower-blighttown");
        Assert.Equal(new Requirement.Constant(true), edge.Requires);
    }
}
