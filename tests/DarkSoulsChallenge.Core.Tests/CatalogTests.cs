using System.Text.RegularExpressions;
using DarkSoulsChallenge.Core.Orders;
using static DarkSoulsChallenge.Core.Tests.Fixtures;

namespace DarkSoulsChallenge.Core.Tests;

public class CatalogTests
{
    private static readonly Difficulty[] Levels = [Difficulty.Easy, Difficulty.Medium, Difficulty.Hard, Difficulty.Extreme];

    [Fact]
    public void Has_the_orders_of_the_catalog_numbered_from_1_each_once()
    {
        Assert.Equal(Enumerable.Range(1, 28), Catalog.All.Select(o => o.Number));
        Assert.Equal(Catalog.All.Count, Catalog.All.Select(o => o.Id).Distinct().Count());
    }

    [Fact]
    public void Text_placeholders_are_exactly_the_parameters_and_exceptions()
    {
        foreach (var order in Catalog.All)
        {
            var expected = order.Params.Keys.ToList();
            if (order.Exceptions is not null) expected.Add(order.Exceptions.Placeholder);
            Assert.Equal(Sorted(expected), Sorted(OrderTemplate.PlaceholdersOf(order.Text)));
        }
    }

    [Fact]
    public void Every_piece_refers_to_a_declared_parameter_of_the_right_kind()
    {
        foreach (var order in Catalog.All)
        {
            foreach (var (param, kind) in order.ParamRefs())
            {
                Assert.True(order.Params.ContainsKey(param), $"{order.Id}: {param} is not declared");
                Assert.Equal(kind, order.Params[param].Kind);
            }
        }
    }

    [Fact]
    public void Every_order_exists_in_at_least_one_mode()
    {
        foreach (var order in Catalog.All) Assert.NotEmpty(order.Modes());
    }

    // Principle: the static mode asks the player nothing.
    [Fact]
    public void Only_live_orders_ask_or_check_the_actual_case()
    {
        foreach (var order in Catalog.All)
        {
            if (order.Asks is not null || order.Command.Kind == CommandKind.OfferChoice)
            {
                Assert.Equal([Mode.Live], order.Modes());
            }

            Assert.NotEqual(Validation.ActualCase, order.Static);
        }
    }

    [Fact]
    public void Exceptions_go_with_automatic_exception_validation()
    {
        foreach (var order in Catalog.All)
        {
            var auto = order.Static == Validation.AutoException || order.Live == Validation.AutoException;
            Assert.Equal(auto, order.Exceptions is not null);
        }
    }

    [Fact]
    public void Has_exactly_four_live_only_orders() =>
        Assert.Equal([4, 12, 19, 20], Catalog.All.Where(o => o.Static is null).Select(o => o.Number));

    [Fact]
    public void Only_names_milestones_that_exist_in_the_data_set()
    {
        var ids = ReadFile("milestones").EnumerateArray().Select(m => m.GetProperty("id").GetString()).ToHashSet();
        static IEnumerable<string> Fixed(MilestoneRef? reference) => reference switch
        {
            MilestoneRef.Fixed f => [f.Id],
            MilestoneRef.FirstOf f => f.Ids,
            _ => [],
        };

        var named = Catalog.All.SelectMany(o =>
            (o.Trigger is Trigger.MilestoneReached t ? Fixed(t.Milestone) : [])
            .Concat(o.Scope is Scope.Phase s ? Fixed(s.From).Concat(Fixed(s.Until)) : [])).ToList();
        Assert.NotEmpty(named);
        Assert.Empty(named.Where(id => !ids.Contains(id)));
    }

    // The group handicap moves a number to the same relative place in an easier range; that only eases the run if
    // every bound of an easier range is at least the same bound of a harder one.
    [Fact]
    public void Gives_every_count_a_range_per_difficulty_never_harder_for_an_easier_difficulty()
    {
        foreach (var order in Catalog.All)
        {
            foreach (var (name, spec) in order.Params)
            {
                if (spec.Kind != ParamKind.Count) continue;
                if (order.Static is not null) Assert.True(spec.Ranges is not null, $"{order.Id}.{name}");
                if (spec.Ranges is not { } ranges) continue;
                foreach (var level in Levels) Assert.True(ranges.For(level).Min <= ranges.For(level).Max);
                for (var i = 0; i + 1 < Levels.Length; i++)
                {
                    Assert.True(ranges.For(Levels[i]).Min >= ranges.For(Levels[i + 1]).Min);
                    Assert.True(ranges.For(Levels[i]).Max >= ranges.For(Levels[i + 1]).Max);
                }
            }
        }
    }

    [Fact]
    public void Has_a_deathless_text_only_for_a_count_that_can_be_zero()
    {
        foreach (var order in Catalog.All)
        {
            if (order.TextIfZero is not { } zero) continue;
            Assert.Equal(0, order.Params[zero.Param].Ranges?.Extreme.Min);
            Assert.Empty(OrderTemplate.PlaceholdersOf(zero.Text));
        }
    }

    [Fact]
    public void Restrictions_have_unique_ids_and_manual_text()
    {
        Assert.Equal(Restrictions.All.Count, Restrictions.All.Select(r => r.Id).Distinct().Count());
        foreach (var r in Restrictions.All) Assert.Matches(new Regex("^[A-Z].*\\.$"), r.Text);
    }

    [Fact]
    public void Has_light_restrictions_enough_for_an_easy_curse_and_heavy_ones_for_an_extreme_curse()
    {
        Assert.True(Restrictions.All.Count(r => r.Tier == Tier.Light) >= 2);
        Assert.True(Restrictions.All.Count(r => r.Tier == Tier.Heavy) >= 3);
    }

    [Fact]
    public void Lists_each_placeholder_once_in_order()
    {
        Assert.Equal(["a", "b"], OrderTemplate.PlaceholdersOf("{a} and {b}, then {a}"));
        Assert.Empty(OrderTemplate.PlaceholdersOf("no placeholders"));
    }
}
