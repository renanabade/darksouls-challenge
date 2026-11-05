using DarkSoulsChallenge.Core.Generation;
using DarkSoulsChallenge.Core.Orders;
using static DarkSoulsChallenge.Core.Tests.Fixtures;

namespace DarkSoulsChallenge.Core.Tests;

/// <summary>Orders about what an area holds, on the DS1 data set.</summary>
public class AreaOrderTests
{
    private static Setup Knight => new(Mode.Static, Ds1.Gifts[0], "Knight", 60);

    private static ValidationResult Check(params OrderInstance[] orders) => Validator.Validate(Ds1, Knight, orders);

    private static int ChestsIn(string area) => Ds1.Chests.Count(c => Ds1.Regions[c.Region].Area == area);

    private static OrderInstance Hunt(string area, string until) => Order("lizard-hunt", new() { ["area"] = area, ["until"] = until });

    private static OrderInstance Closed(string area, string until) => Order("the-other-way", new() { ["area"] = area, ["until"] = until });

    [Fact]
    public void Reads_the_chests_of_the_world_without_the_Firelink_rescue_chest()
    {
        Assert.True(Ds1.Chests.Count > 50);
        Assert.True(ChestsIn("anor-londo") > 5);
    }

    [Fact]
    public void Needs_every_crystal_lizard_of_the_area_within_reach_before_the_milestone()
    {
        // The Crystal Cave lies past the Duke's Archives, which open once the Lordvessel is placed.
        Assert.Equal(
            ["not every crystal lizard of crystal-cave can be reached before Lordvessel placed at the Firelink Altar"],
            Check(Hunt("crystal-cave", "lordvessel-placed")).Problems);
        Assert.Equal(Verdict.Comfortable, Check(Hunt("crystal-cave", "boss-gwyn-lord-of-cinder")).Verdict);
        Assert.Throws<InvalidOrderException>(() => Check(Hunt("depths", "both-bells")));
    }

    [Fact]
    public void Counts_the_chests_in_the_text_and_refuses_a_wrong_count()
    {
        var chests = ChestsIn("anor-londo");
        OrderArgs Args(int count) => new() { ["area"] = "anor-londo", ["chests"] = count, ["until"] = "boss-gwyn-lord-of-cinder" };
        Assert.Equal(Verdict.Comfortable, Check(Order("every-chest", Args(chests))).Verdict);
        Assert.Equal(
            $"In Anor Londo: open all {chests} chests before you defeat Gwyn, Lord of Cinder.",
            Manual.OrderText(Ds1, new GeneratedOrder(Catalog.Get("every-chest"), Args(chests), [])));
        Assert.Throws<InvalidOrderException>(() => Check(Order("every-chest", Args(chests + 1))));
    }

    [Fact]
    public void Sends_the_player_for_a_pickup_only_when_it_can_be_taken_in_time()
    {
        var found = Ds1.Locations.First(l =>
            l.Found == true && l.Kind == "weapon" && l.Region.StartsWith("anor-londo", StringComparison.Ordinal));
        OrderInstance Errand(string until) => Order("errand", new() { ["location"] = found.Name, ["until"] = until });
        Assert.Equal(Verdict.Impossible, Check(Errand("both-bells")).Verdict);
        Assert.Equal(Verdict.Comfortable, Check(Errand("lordvessel-placed")).Verdict);
    }

    [Fact]
    public void Closes_an_area_until_a_milestone_only_when_another_way_exists()
    {
        Assert.Equal(Verdict.Comfortable, Check(Closed("depths", "both-bells")).Verdict);
        Assert.Equal(Verdict.Impossible, Check(Closed("undead-parish", "bell-undead-parish")).Verdict);
        Assert.Contains(
            "lizard-hunt sends you into crystal-cave, which the-other-way closes",
            Check(Hunt("crystal-cave", "boss-gwyn-lord-of-cinder"), Closed("crystal-cave", "boss-gwyn-lord-of-cinder")).Problems);
    }

    [Fact]
    public void Leaves_the_journeys_forbidden_area_out_of_every_chapter()
    {
        foreach (var seed in Enumerable.Range(1, 6).Select(i => $"forbid-{i}"))
        {
            var challenge = Generator.Generate(Ds1, new GeneratorConfig(seed, Difficulty.Medium, Length.Full));
            var area = challenge.Orders.FirstOrDefault(o => o.Template.Id == "forbidden-area")?.Args.Text("area");
            if (area is null) continue;
            Assert.All(challenge.Chapters, chapter => Assert.DoesNotContain(area, chapter.Areas));
            Assert.Contains($"Do not enter {Ds1.Areas[area].Name}", Manual.Render(Ds1, challenge), StringComparison.Ordinal);
            return;
        }

        Assert.Fail("no sample journey forbids an area");
    }

    // These bonfires are out, or missing, for part of the run. One bonfire must not name them. No bonfire still may: it
    // never asks the player to rest at one of them.
    [Fact]
    public void Draws_only_the_bonfires_that_are_always_lit()
    {
        var domains = Draw.DomainsOf(Ds1);
        var offered = domains.BonfiresByArea.Values.SelectMany(b => b).ToList();
        Assert.DoesNotContain("FS: Firelink Shrine Bonfire", offered);
        Assert.DoesNotContain("AL: Anor Londo Bonfire", offered);
        Assert.DoesNotContain("AL: Chamber of the Princess Bonfire", offered);
        Assert.Equal(["AL: Anor Londo - Residence Bonfire", "AL: Darkmoon Tomb Bonfire"], domains.BonfiresByArea["anor-londo"]);
        Assert.False(domains.BonfiresByArea.ContainsKey("firelink-shrine"));
        Assert.Contains("firelink-shrine", domains.AreasWithBonfires);
        Assert.Contains("anor-londo", domains.AreasWithBonfires);
    }

    [Fact]
    public void Names_a_bonfire_without_its_area_code() =>
        Assert.Equal(
            "In Anor Londo: rest only at the Darkmoon Tomb Bonfire.",
            Manual.OrderText(Ds1, new GeneratedOrder(
                Catalog.Get("one-bonfire"),
                new() { ["area"] = "anor-londo", ["bonfire"] = "AL: Darkmoon Tomb Bonfire" },
                [])));
}
