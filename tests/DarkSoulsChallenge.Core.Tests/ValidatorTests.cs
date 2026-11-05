using DarkSoulsChallenge.Core.Orders;
using static DarkSoulsChallenge.Core.Tests.Fixtures;

namespace DarkSoulsChallenge.Core.Tests;

public class ValidatorTests
{
    private static readonly string Bell = Validator.Bells[0];

    private static readonly (string Id, string? Area)[] Areas =
    [
        ("start", "asylum"), ("hall", "hall"), ("gate", "hall"), ("side", "side"), ("tower", "tower"),
        ("a", "lords"), ("b", "lords"), ("throne", "throne"), ("forge", "hall"), ("market", "hall"), ("stall", null),
    ];

    private static object Loc(string region, string item, string category, bool found = false) =>
        new { name = $"{region}: {item}", region, item, count = 1, category, mandatory = false, found };

    private static readonly object[] LocationRows =
    [
        Loc("hall", "Key", "CORPSE_ITEM", true),
        Loc("hall", "Ring", "CHEST_ITEM", true),
        Loc("side", "Junk", "CORPSE_ITEM", true),
        Loc("gate", "Gate Boss Defeated", "BOSS"),
        Loc("tower", Bell, "EVENT"),
        Loc("a", "Soul A", "LORD_SOUL"),
        Loc("b", "Soul B", "LORD_SOUL"),
        Loc("throne", "Lord Defeated", "BOSS"),
        Loc("forge", "Lantern", "SHOP_ITEM"),
        Loc("stall", "Lantern", "SHOP_ITEM"),
    ];

    private static readonly object[] RegionRows =
        Areas.Select(r => (object)new { id = r.Id, name = r.Id, area = r.Area, mandatory = false }).ToArray();

    private static readonly object[] EntranceRows =
    [
        new { from = "start", to = "hall", requires = true },
        new { from = "hall", to = "side", requires = true },
        new { from = "hall", to = "gate", requires = true },
        new { from = "hall", to = "tower", requires = new { has = "Key" } },
        new { from = "side", to = "tower", requires = new { has = "Master Key" } },
        new { from = "tower", to = "a", requires = new { all = L(new { has = Bell }, new { has = "Lantern" }) } },
        new { from = "hall", to = "forge", requires = true },
        new { from = "hall", to = "market", requires = true },
        new { from = "forge", to = "stall", requires = true },
        new { from = "market", to = "stall", requires = true },
        new { from = "a", to = "b", requires = new { has = "Soul A" } },
        new { from = "b", to = "throne", requires = new { all = L(new { has = "Soul A" }, new { has = "Soul B" }) } },
    ];

    private static readonly object[] MerchantRows =
    [
        new { id = "smith", name = "Smith", regions = L("forge", "stall") },
        new { id = "trader", name = "Trader", regions = L("market", "stall") },
    ];

    /// <summary>
    /// start, hall; hall leads to side, gate (a boss), tower (needs Key, found in the hall); side leads to tower with the
    /// Master Key; tower leads to a (needs the first bell, rung in the tower); a to b (needs Soul A); b to throne (needs
    /// both souls), where the goal boss is. Shops: the smith sells a Lantern at the forge; the smith and the trader both
    /// sell one at a shared (virtual) stall. tower to a also needs the Lantern.
    /// </summary>
    private static readonly RawDataSet Raw = new()
    {
        Meta = J(new { start = "start", goal = "Lord Defeated" }),
        Regions = J(RegionRows),
        Entrances = J(EntranceRows),
        Locations = J(LocationRows),
        Classes = J(new { gifts = L(new { row = 1, items = L("(none)") }, new { row = 2, items = L("Master Key") }) }),
        Bosses = J(L(
            new { id = "gate-boss", name = "Gate Boss", region = "gate" },
            new { id = "lord", name = "Lord", region = "throne" })),
        Merchants = J(MerchantRows),
    };

    private static readonly World Small = WorldParser.Parse(Raw);

    private static Setup SmallSetup(int gift = 0) => new(Mode.Static, Small.Gifts[gift]);

    private static OrderArgs Area(string area) => new() { ["area"] = area };

    private static ValidationResult Check(params OrderInstance[] orders) => Validator.Validate(Small, SmallSetup(), orders);

    [Fact]
    public void Forbids_areas_refusing_one_the_goal_needs()
    {
        Assert.Equal(Verdict.Comfortable, Check(Order("forbidden-area", Area("side"))).Verdict);
        var result = Check(Order("forbidden-area", Area("tower")));
        Assert.Equal(Verdict.Impossible, result.Verdict);
        Assert.Equal(["the goal \"Lord Defeated\" cannot be reached"], result.Problems);
    }

    [Fact]
    public void Checks_that_a_boss_can_die_before_any_bell_is_rung()
    {
        Assert.Equal(Verdict.Comfortable, Check(Order("boss-before-bell", new() { ["boss"] = "gate-boss" })).Verdict);
        Assert.Equal(["Lord cannot be defeated before a bell"], Check(Order("boss-before-bell", new() { ["boss"] = "lord" })).Problems);
    }

    [Fact]
    public void Checks_that_the_Lord_Souls_can_be_taken_in_the_given_order()
    {
        Assert.Equal(Verdict.Comfortable, Check(Order("lord-order", new() { ["order"] = new[] { "Soul A", "Soul B" } })).Verdict);
        Assert.Equal(
            ["Soul B cannot be obtained before Soul A"],
            Check(Order("lord-order", new() { ["order"] = new[] { "Soul B", "Soul A" } })).Problems);
    }

    [Fact]
    public void Excepts_only_the_pickups_the_game_requires_given_the_starting_gift()
    {
        OrderInstance[] ground = [Order("nothing-from-the-ground", Area("hall"))];
        Assert.Equal(["Key"], Validator.Validate(Small, SmallSetup(), ground).Orders[0].Exceptions);
        Assert.Empty(Validator.Validate(Small, SmallSetup(1), ground).Orders[0].Exceptions);
    }

    [Fact]
    public void Validates_orders_together_one_order_can_make_anothers_exception_necessary()
    {
        var result = Validator.Validate(Small, SmallSetup(1), [
            Order("forbidden-area", Area("side")),
            Order("nothing-from-the-ground", Area("hall")),
        ]);
        Assert.Equal(Verdict.Comfortable, result.Verdict);
        Assert.Equal(["Key"], result.Orders[1].Exceptions);
    }

    [Fact]
    public void Keeps_a_merchant_who_still_has_one_reachable_shop_when_another_is_cut_off()
    {
        var world = WorldParser.Parse(Raw with
        {
            Regions = J(RegionRows.Append(new { id = "deep", name = "deep", area = "wild", mandatory = false }).ToArray()),
            Entrances = J(EntranceRows.Append(new { from = "hall", to = "deep", requires = true }).ToArray()),
            Merchants = J(MerchantRows
                .Append(new { id = "wanderer", name = "Wanderer", regions = L("market", "deep") })
                .Append(new { id = "hermit", name = "Hermit", regions = L("deep") })
                .ToArray()),
        });
        var setup = new Setup(Mode.Static, world.Gifts[0]);

        // market stays open. One reachable shop is enough: the order is about the merchant, not every stall.
        var kept = Validator.Validate(world, setup, [
            Order("forbidden-area", Area("wild")),
            Order("closed-merchant", new() { ["merchant"] = "wanderer" }),
        ]);
        Assert.Equal(Verdict.Comfortable, kept.Verdict);
        Assert.Empty(kept.Problems);
        var cut = Validator.Validate(world, setup, [
            Order("forbidden-area", Area("wild")),
            Order("closed-merchant", new() { ["merchant"] = "hermit" }),
        ]);
        Assert.Equal(Verdict.Impossible, cut.Verdict);
        Assert.Contains("closed-merchant: Hermit cannot be reached", cut.Problems);
    }

    [Fact]
    public void Closes_a_merchant_keeping_a_shared_shop_open_while_another_merchant_sells_there()
    {
        Assert.Empty(Check(Order("closed-merchant", new() { ["merchant"] = "smith" })).Orders[0].Exceptions);
        var both = Check(
            Order("closed-merchant", new() { ["merchant"] = "smith" }),
            Order("closed-merchant", new() { ["merchant"] = "trader" }));
        Assert.Equal(Verdict.Comfortable, both.Verdict);
        Assert.Equal(["Lantern"], both.Orders[0].Exceptions);
        Assert.Empty(both.Orders[1].Exceptions);
    }

    // Every static order has a check; the live-only ones wait for the live mode's state.
    [Fact]
    public void Reports_which_orders_it_cannot_check_yet()
    {
        var result = Validator.Validate(Small, SmallSetup() with { Mode = Mode.Live }, [
            Order("dry-fight", new() { ["boss"] = "gate-boss" }),
            Order("boss-inheritance", new() { ["boss"] = "gate-boss", ["weapon"] = "x" }),
        ]);
        Assert.Equal([Support.WeightOnly, Support.Pending], result.Orders.Select(o => o.Support));
        Assert.False(result.Complete);
    }

    [Fact]
    public void Leaves_order_5_pending_when_the_data_set_has_no_found_flag()
    {
        var unflagged = WorldParser.Parse(Raw with
        {
            Locations = J(new[]
            {
                new { name = "gate: Gate Boss Defeated", region = "gate", item = "Gate Boss Defeated", count = 1, category = "BOSS", mandatory = false },
                new { name = "throne: Lord Defeated", region = "throne", item = "Lord Defeated", count = 1, category = "BOSS", mandatory = false },
                new { name = "hall: Key", region = "hall", item = "Key", count = 1, category = "CORPSE_ITEM", mandatory = false },
                new { name = "tower: Bell", region = "tower", item = Bell, count = 1, category = "EVENT", mandatory = false },
                new { name = "a: Soul A", region = "a", item = "Soul A", count = 1, category = "LORD_SOUL", mandatory = false },
                new { name = "b: Soul B", region = "b", item = "Soul B", count = 1, category = "LORD_SOUL", mandatory = false },
                new { name = "forge: Lantern", region = "forge", item = "Lantern", count = 1, category = "SHOP_ITEM", mandatory = false },
            }),
        });
        var result = Validator.Validate(unflagged, new Setup(Mode.Static, unflagged.Gifts[0]), [
            Order("nothing-from-the-ground", Area("hall")),
        ]);
        Assert.Equal(Support.Pending, result.Orders[0].Support);
    }

    [Fact]
    public void Rejects_orders_the_generator_filled_in_wrong()
    {
        // The wager is live only; asking for it in a static challenge is a generator bug.
        Assert.Throws<InvalidOrderException>(() => Check(Order("wager", new() { ["boss"] = "lord", ["restriction"] = "x" })));
        Assert.Throws<InvalidOrderException>(() => Check(Order("forbidden-area", Area("nowhere"))));
        Assert.Throws<InvalidOrderException>(() => Check(Order("lord-order", new() { ["order"] = new[] { "Soul A", "Soul A" } })));
    }

    private static ValidationResult Run(StartingGift gift, params OrderInstance[] orders) =>
        Validator.Validate(Ds1, new Setup(Mode.Static, gift), orders);

    private static ValidationResult Run(params OrderInstance[] orders) => Run(NoGift, orders);

    private static List<string> Ds1Areas() =>
        Ds1.Regions.Values.Where(r => r.Area is not null).Select(r => r.Area!).Distinct().ToList();

    [Fact]
    public void Names_bells_and_Lord_Souls_that_exist_in_the_graph()
    {
        var items = Ds1.Locations.Select(l => l.Item).ToHashSet();
        Assert.Empty(Validator.Bells.Where(b => !items.Contains(b)));
        Assert.Equal(4, Ds1.Locations.Count(l => l.Category == "LORD_SOUL"));
    }

    [Fact]
    public void Refuses_to_forbid_an_area_exactly_when_it_holds_a_mandatory_region()
    {
        var mandatory = ReadMandatory().Regions.ToHashSet();
        foreach (var area in Ds1Areas())
        {
            var holdsMandatory = Ds1.Regions.Values.Any(r => r.Area == area && mandatory.Contains(r.Id));
            Assert.Equal(holdsMandatory ? Verdict.Impossible : Verdict.Comfortable, Run(Order("forbidden-area", Area(area))).Verdict);
        }
    }

    // Derived from the graph, not from memory. The Master Key opens no boss before a bell.
    [Fact]
    public void Finds_the_bosses_that_can_die_before_any_bell()
    {
        List<string> Before(StartingGift gift) => Ds1.Bosses.Keys
            .Where(boss => Run(gift, Order("boss-before-bell", new() { ["boss"] = boss })).Verdict == Verdict.Comfortable)
            .ToList();

        Assert.Equal(
            [
                "asylum-demon",
                "bell-gargoyles",
                "capra-demon",
                "ceaseless-discharge",
                "chaos-witch-quelaag",
                "gaping-dragon",
                "great-grey-wolf-sif",
                "moonlight-butterfly",
                "pinwheel",
                "stray-demon",
                "taurus-demon",
            ],
            Sorted(Before(NoGift)));
        Assert.Equal(Before(NoGift), Before(MasterKeyGift));
    }

    [Fact]
    public void Accepts_every_order_of_the_four_Lord_Souls()
    {
        static IEnumerable<string[]> Permutations(string[] xs) => xs.Length <= 1
            ? [xs]
            : xs.SelectMany((x, i) => Permutations(xs.Where((_, j) => j != i).ToArray()).Select(p => p.Prepend(x).ToArray()));

        var souls = Ds1.Locations.Where(l => l.Category == "LORD_SOUL").Select(l => l.Item).ToArray();
        foreach (var lords in Permutations(souls))
        {
            Assert.Empty(Run(Order("lord-order", new() { ["order"] = lords })).Problems);
        }
    }

    // The two found pickups the graph needs: the key on the corpse in the first cell, and the Archives chest key.
    [Fact]
    public void Excepts_in_each_area_exactly_the_pickups_the_run_cannot_do_without()
    {
        var exceptions = new Dictionary<string, IReadOnlyList<string>>();
        foreach (var area in Ds1Areas())
        {
            var result = Run(Order("nothing-from-the-ground", Area(area)));
            Assert.Equal(Verdict.Comfortable, result.Verdict);
            if (result.Orders[0].Exceptions.Count > 0) exceptions[area] = result.Orders[0].Exceptions;
        }

        Assert.Equal(2, exceptions.Count);
        Assert.Equal(["Dungeon Cell Key"], exceptions["northern-undead-asylum"]);
        Assert.Equal(["Archive Tower Giant Door Key"], exceptions["the-dukes-archives"]);
    }

    [Fact]
    public void Rejects_an_order_whose_place_lies_past_a_forbidden_area()
    {
        static ValidationResult Past(OrderInstance order) => Run(Order("forbidden-area", Area("royal-wood")), order);
        static OrderInstance Dry(string boss) => Order("dry-fight", new() { ["boss"] = boss });

        Assert.Contains("no-bonfire: Oolacile Township cannot be reached", Past(Order("no-bonfire", Area("oolacile-township"))).Problems);
        Assert.Contains("dry-fight: Manus, Father of the Abyss cannot be reached", Past(Dry("manus-father-of-the-abyss")).Problems);
        Assert.Equal(Verdict.Impossible, Past(Dry("knight-artorias")).Verdict);
        Assert.Equal(Verdict.Impossible, Past(Dry("black-dragon-kalameet")).Verdict);

        // The sanctuary is the way into the woods, so it stays open when the woods are closed.
        Assert.Equal(Verdict.Comfortable, Past(Dry("sanctuary-guardian")).Verdict);
        Assert.Contains("forbidden-area: Oolacile Township cannot be reached", Past(Order("forbidden-area", Area("oolacile-township"))).Problems);
    }

    // The game's scripts put these bonfires out, or add them late.
    [Fact]
    public void Rejects_a_one_bonfire_order_that_names_a_bonfire_out_for_part_of_the_run()
    {
        static OrderInstance One(string bonfire) => Order("one-bonfire", new() { ["area"] = "anor-londo", ["bonfire"] = bonfire });

        var windowed = Ds1.Locations.Where(l => l.Category == "BONFIRE" && !l.AlwaysLit).ToList();
        Assert.Equal(
            ["AL: Anor Londo Bonfire", "AL: Chamber of the Princess Bonfire", "FS: Firelink Shrine Bonfire"],
            Sorted(windowed.Select(l => l.Name)));
        foreach (var location in windowed)
        {
            var result = Run(One(location.Name));
            Assert.Equal(Verdict.Impossible, result.Verdict);
            Assert.Equal(location.Unavailable!.Select(w => $"{location.Name} cannot be the one bonfire: {w.Why}"), result.Problems);
        }

        Assert.Empty(Run(One("AL: Darkmoon Tomb Bonfire")).Problems);
        Assert.Equal(Verdict.Comfortable, Run(Order("no-bonfire", Area("firelink-shrine"))).Verdict);
        Assert.Equal(Verdict.Comfortable, Run(Order("no-bonfire", Area("anor-londo"))).Verdict);
    }

    [Fact]
    public void Counts_every_window_of_a_bonfire_not_only_the_first()
    {
        var raw = ReadDataSet();
        var rows = raw.Locations!.Value.EnumerateArray().Select(row =>
        {
            var node = System.Text.Json.Nodes.JsonNode.Parse(row.GetRawText())!.AsObject();
            if (node["name"]!.GetValue<string>() == "AL: Darkmoon Tomb Bonfire")
            {
                node["unavailable"] = System.Text.Json.Nodes.JsonNode.Parse(
                    """
                    [
                      { "from": true, "until": { "has": "Bell of Awakening #1" }, "why": "first" },
                      { "from": { "has": "Lordvessel" }, "until": null, "why": "second" }
                    ]
                    """);
            }

            return node;
        }).ToArray();
        var twice = WorldParser.Parse(raw with { Locations = J(rows) });
        var tomb = Order("one-bonfire", new() { ["area"] = "anor-londo", ["bonfire"] = "AL: Darkmoon Tomb Bonfire" });
        Assert.Equal(
            ["AL: Darkmoon Tomb Bonfire cannot be the one bonfire: first", "AL: Darkmoon Tomb Bonfire cannot be the one bonfire: second"],
            Validator.Validate(twice, new Setup(Mode.Static, NoGift), [tomb]).Problems);
    }

    [Fact]
    public void Can_close_any_single_merchant_with_no_exception()
    {
        foreach (var merchant in Ds1.Merchants.Keys)
        {
            var result = Run(Order("closed-merchant", new() { ["merchant"] = merchant }));
            Assert.Equal(Verdict.Comfortable, result.Verdict);
            Assert.Empty(result.Orders[0].Exceptions);
        }
    }
}
