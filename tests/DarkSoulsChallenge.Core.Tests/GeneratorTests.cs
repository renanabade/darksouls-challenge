using System.Text.RegularExpressions;
using DarkSoulsChallenge.Core.Generation;
using DarkSoulsChallenge.Core.Orders;
using static DarkSoulsChallenge.Core.Tests.Fixtures;

namespace DarkSoulsChallenge.Core.Tests;

public class GeneratorTests
{
    private static GeneratorConfig Config(string seed, Difficulty difficulty, Length length) => new(seed, difficulty, length);

    private static readonly Lazy<List<Challenge>> Sample = new(() => Enumerable.Range(0, 24)
        .AsParallel()
        .AsOrdered()
        .Select(i => Generator.Generate(Ds1, Config($"seed-{i}", Curves.Difficulties[i % 4], (Length)(i / 4 % 3))))
        .ToList());

    private static ChapterPlan Everything() => new()
    {
        Goal = "kiln-open",
        Goals = ["kiln-open"],
        Areas = Ds1.Areas.Keys.ToList(),
        Bosses = Ds1.Bosses.Keys.ToList(),
        Offset = 0,
        Difficulty = Difficulty.Medium,
    };

    [Fact]
    public void Random_repeats_the_same_sequence_for_the_same_seed_and_only_for_it()
    {
        static double[] Draw(string seed)
        {
            var rng = new SeededRandom(seed);
            return Enumerable.Range(0, 5).Select(_ => rng.Next()).ToArray();
        }

        Assert.Equal(Draw("a"), Draw("a"));
        Assert.NotEqual(Draw("a"), Draw("b"));
    }

    [Fact]
    public void Random_keeps_integers_in_range_and_shuffles_without_losing_items()
    {
        var rng = new SeededRandom("range");
        var ints = Enumerable.Range(0, 500).Select(_ => rng.NextInt(3, 5)).ToHashSet();
        Assert.Equal(new HashSet<int> { 3, 4, 5 }, ints);
        string[] list = ["a", "b", "c", "d", "e"];
        Assert.Equal(list, Sorted(rng.Shuffle(list)));
    }

    [Fact]
    public void Random_puts_heavier_items_first_more_often_in_a_weighted_shuffle()
    {
        var rng = new SeededRandom("weights");
        string[] list = ["light", "heavy"];
        var heavyFirst = Enumerable.Range(0, 1000).Count(_ => rng.WeightedShuffle(list, x => x == "heavy" ? 9 : 1)[0] == "heavy");
        Assert.True(heavyFirst > 850); // 9 / (9 + 1) of the time
    }

    [Fact]
    public void Gives_the_same_challenge_for_the_same_seed_and_settings()
    {
        var config = Config("ashen-one", Difficulty.Medium, Length.Full);
        var manual = Manual.Render(Ds1, Generator.Generate(Ds1, config));
        Assert.Equal(manual, Manual.Render(Ds1, Generator.Generate(Ds1, config)));
        Assert.NotEqual(manual, Manual.Render(Ds1, Generator.Generate(Ds1, config with { Seed = "other" })));
    }

    // Royal Wood is the only way into the Township and the Chasm. Forbidding it must not leave those places, or their
    // bosses, anywhere in the manual. Built by hand, so no seed has to draw it.
    [Fact]
    public void Does_not_send_the_player_past_a_forbidden_area()
    {
        var forbid = Order("forbidden-area", new() { ["area"] = "royal-wood" });
        var fight = Order("dry-fight", new() { ["boss"] = "sanctuary-guardian" });
        var chapter = Generator.ReachableChapters(Ds1, [Everything()], [forbid, fight], [])[0];
        Assert.DoesNotContain("royal-wood", chapter.Areas);
        Assert.Contains("oolacile-sanctuary", chapter.Areas);
        foreach (var area in new[] { "oolacile-township", "chasm-of-the-abyss" }) Assert.DoesNotContain(area, chapter.Areas);
        foreach (var boss in new[] { "manus-father-of-the-abyss", "knight-artorias", "black-dragon-kalameet" })
        {
            Assert.DoesNotContain(boss, chapter.Bosses);
        }

        Assert.Contains("sanctuary-guardian", chapter.Bosses);
        var challenge = Generator.Generate(Ds1, Config("ashen-one", Difficulty.Medium, Length.Full));
        Assert.Equal(Verdict.Comfortable, Validator.Validate(Ds1, challenge.Setup, [forbid, fight]).Verdict);
        var manual = Manual.Render(Ds1, challenge with
        {
            Chapters = [chapter],
            Orders = [new(forbid.Template, forbid.Args, []), new(fight.Template, fight.Args, [], 0)],
        });
        foreach (var name in new[] { "Oolacile Township", "Chasm of the Abyss", "Manus", "Kalameet" })
        {
            Assert.DoesNotContain(name, manual, StringComparison.Ordinal);
        }

        Assert.DoesNotContain("**Areas:** Royal Wood", manual, StringComparison.Ordinal);
        Assert.Contains("Oolacile Sanctuary", manual, StringComparison.Ordinal);
    }

    // An area "the other way" closes for a chapter is not listed in that chapter, nor what lies past it; the next chapter
    // lists it again.
    [Fact]
    public void Leaves_out_of_a_chapter_the_area_its_other_way_closes()
    {
        var other = Order("the-other-way", new() { ["area"] = "royal-wood", ["until"] = "kiln-open" }, 0);
        var chapters = Generator.ReachableChapters(Ds1, [Everything(), Everything()], [other], []);
        Assert.DoesNotContain("royal-wood", chapters[0].Areas);
        Assert.DoesNotContain("oolacile-township", chapters[0].Areas);
        Assert.DoesNotContain("knight-artorias", chapters[0].Bosses);
        Assert.Contains("royal-wood", chapters[1].Areas);
        Assert.Contains("knight-artorias", chapters[1].Bosses);
    }

    [Fact]
    public void Ends_every_manual_with_what_the_scripts_do_to_NPCs()
    {
        var manual = Manual.Render(Ds1, Generator.Generate(Ds1, Config("ashen-one", Difficulty.Medium, Length.Full)));
        var before = manual[manual.IndexOf("## Before you go", StringComparison.Ordinal)..];
        foreach (var npc in new[] { "Lautrec of Carim", "Rhea of Thorolund", "Trusty Patches", "Solaire of Astora", "Darkstalker Kaathe" })
        {
            Assert.Contains($"- **{npc}:**", before, StringComparison.Ordinal);
        }
    }

    [Fact]
    public void Respects_a_class_gift_and_level_cap_the_player_fixes()
    {
        var challenge = Generator.Generate(Ds1, Config("fixed", Difficulty.Hard, Length.Short) with
        {
            StartingClass = "Pyromancer",
            GiftRow = 2406,
            LevelCap = 1,
        });
        Assert.Equal("Pyromancer", challenge.Setup.StartingClass);
        Assert.Equal(["Master Key"], challenge.Setup.Gift.Items.Select(i => i.Item));
        Assert.Equal(1, challenge.Setup.LevelCap);
    }

    // Many seeds, every challenge possible, and each chapter's rules about the chapter's own areas and bosses.
    [Fact]
    public void Only_generates_journeys_that_validate_longer_as_the_length_grows()
    {
        var sizes = new Dictionary<Length, List<int>> { [Length.Short] = [], [Length.Full] = [], [Length.Epic] = [] };
        foreach (var challenge in Sample.Value)
        {
            var result = Validator.Validate(Ds1, challenge.Setup, challenge.Orders);
            Assert.Equal(Verdict.Comfortable, result.Verdict);
            Assert.True(result.Complete);
            sizes[challenge.Config.Length].Add(challenge.Orders.Count);
            foreach (var order in challenge.Orders)
            {
                if (order.Chapter is not { } k) continue;
                var chapter = challenge.Chapters[k];

                // The area the other way closes is the one place of the chapter the player is not sent.
                if (order.Args.Text("area") is { } area)
                {
                    if (order.Template.Id == "the-other-way") Assert.DoesNotContain(area, chapter.Areas);
                    else Assert.Contains(area, chapter.Areas);
                }
                else if (order.Template.Id == "the-other-way")
                {
                    Assert.Fail("the other way without an area");
                }

                if (order.Args.Text("boss") is { } boss) Assert.Contains(boss, chapter.Bosses);
            }

            int Count(string id) => challenge.Orders.Count(o => o.Template.Id == id);
            Assert.True(Count("errand") <= 2);
            Assert.True(Count("every-chest") <= 1);
            Assert.True(Count("counted-attempts") <= 3);
        }

        Assert.True(sizes[Length.Short].Max() <= 10);
        Assert.True(sizes[Length.Full].Max() <= 18);
        Assert.True(sizes[Length.Epic].Max() <= 25);
        Assert.True(sizes[Length.Short].Average() < sizes[Length.Full].Average());
        Assert.True(sizes[Length.Full].Average() < sizes[Length.Epic].Average());
        Assert.True(sizes[Length.Epic].Min() >= 20);
    }

    [Fact]
    public void Draws_no_order_that_asks_nothing()
    {
        static int Pickups(string? area, string? kind = null) => Ds1.Locations.Count(l =>
            l.Found == true
            && Ds1.Regions[l.Region].Area == area
            && (kind is null || l.Kind == kind));

        foreach (var challenge in Sample.Value)
        {
            var classLevel = Ds1.Classes[challenge.Setup.StartingClass!].Level;
            OrderArgs? Args(string id) => challenge.Orders.FirstOrDefault(o => o.Template.Id == id)?.Args;
            var curse = Args("accumulated-curse")?.List("restrictions") ?? [];
            if (challenge.Setup.LevelCap == classLevel)
            {
                Assert.Null(Args("earned-levels"));
                Assert.DoesNotContain("no-level-ups", curse);
            }

            var deaths = Args("run-lives")?.Number("deaths");
            var forbidden = Args("forbidden-area")?.Text("area");
            var noEstus = challenge.Orders
                .Where(o => o.Template.Id == "chapter-restriction" && o.Args.Text("restriction") == "no-estus")
                .Select(o => o.Chapter)
                .ToHashSet();
            foreach (var order in challenge.Orders)
            {
                var (id, args) = (order.Template.Id, order.Args);
                var area = args.Text("area");
                var boss = args.Text("boss") is { } bossId ? Ds1.Bosses.GetValueOrDefault(bossId) : null;
                if (forbidden is not null && id != "forbidden-area")
                {
                    Assert.NotEqual(forbidden, area);
                    if (boss is not null) Assert.NotEqual(forbidden, Ds1.Regions[boss.Region].Area);
                }

                if (id == "dry-fight") Assert.DoesNotContain(order.Chapter, noEstus);

                // The element follows the boss's defenses, never the first boss of the run.
                if (id is "exploit-weakness" or "against-the-grain")
                {
                    Assert.NotEqual("asylum-demon", boss?.Id);
                    var defenses = Combat.ElementalDefenses(boss!).Select(d => d.Element.IdOf()).ToList();
                    Assert.Equal(id == "exploit-weakness" ? defenses[0] : defenses[^1], args.Text("element"));
                }

                if (id == "wear-what-you-find") Assert.True(Pickups(area, "armor") > 0);
                if (id == "nothing-from-the-ground") Assert.True(Pickups(area) >= 5);
                if (id == "boss-before-bell") Assert.DoesNotContain(args.Text("boss"), new[] { "asylum-demon", "bell-gargoyles" });
                if (id == "counted-attempts" && deaths is { } limit) Assert.True(args.Number("attempts") - 1 < limit);
                if (id == "chapter-restriction") Assert.DoesNotContain(args.Text("restriction"), curse);
            }
        }
    }

    private static readonly string[] Lords =
    [
        "Lord Soul (Nito)",
        "Bequeathed Lord Soul Shard (Seath)",
        "Bequeathed Lord Soul Shard (Four Kings)",
        "Lord Soul (Bed of Chaos)",
    ];

    [Fact]
    public void Cuts_the_run_at_the_Asylum_the_bells_the_Lordvessel_each_Lord_Soul_and_the_Kiln() =>
        Assert.Equal(
            [
                "boss-asylum-demon",
                "bell-undead-parish",
                "both-bells",
                "lordvessel-placed",
                "lord-souls-placed-1",
                "lord-souls-placed-4",
                "lord-souls-placed-3",
                "lord-souls-placed-2",
                "boss-gwyn-lord-of-cinder",
            ],
            Chapters.Of(Ds1, Lords).Select(c => c.Goal));

    // Derived from the data set, not typed in: what each goal cannot be reached without.
    [Fact]
    public void Puts_each_area_and_boss_where_the_run_meets_it()
    {
        var chapters = Chapters.Of(Ds1, Lords);
        Assert.Equal(["northern-undead-asylum"], chapters[0].Areas);
        Assert.Contains("undead-burg", chapters[1].RequiredAreas);
        Assert.Contains("undead-parish", chapters[1].RequiredAreas);
        Assert.Contains("blighttown", chapters[2].Areas);
        Assert.Contains("quelaags-domain", chapters[2].Areas);
        Assert.Contains("sens-fortress", chapters[3].Areas);
        Assert.Contains("anor-londo", chapters[3].Areas);
        Assert.Contains("painted-world-of-ariamis", chapters[3].Areas);
        Assert.Equal(["the-catacombs", "tomb-of-the-giants"], chapters[4].Areas);
        Assert.Contains("the-dukes-archives", chapters[5].Areas);
        Assert.Equal(["four-kings", "great-grey-wolf-sif"], chapters[6].Bosses);
        Assert.Equal(["kiln-of-the-first-flame"], chapters[8].Areas);
        Assert.Equal(Sorted(Ds1.Bosses.Keys), Sorted(chapters.SelectMany(c => c.Bosses)));
    }

    // Every detour in its first chapter gave chapters of 1 to 9 areas, the same for every seed.
    [Fact]
    public void Draws_detours_among_their_chapters_balancing_the_chapters_and_keeping_the_way_in_order()
    {
        var first = Chapters.Of(Ds1, Lords);
        var drawn = Enumerable.Range(0, 30).Select(i => Chapters.Of(Ds1, Lords, new SeededRandom($"balance-{i}"))).ToList();
        static int Widest(IReadOnlyList<Chapter> chapters) => chapters.Max(c => c.Areas.Count);
        static int ChapterOf(IReadOnlyList<Chapter> chapters, string area) =>
            chapters.Select((c, k) => (c, k)).First(x => x.c.Areas.Contains(area)).k;

        Assert.True(drawn.Average(Widest) < Widest(first));
        Assert.True(drawn.Select(cs => string.Join('/', cs.Select(c => string.Join(',', c.Areas)))).Distinct().Count() > 5);
        foreach (var chapters in drawn)
        {
            Assert.Equal(Sorted(Ds1.Bosses.Keys), Sorted(chapters.SelectMany(c => c.Bosses)));

            // What each goal needs never moves; a detour never comes before its way in, nor after the Lord Souls.
            for (var k = 0; k < first.Count; k++) Assert.Equal(first[k].RequiredAreas, chapters[k].RequiredAreas);
            Assert.True(ChapterOf(chapters, "depths") <= ChapterOf(chapters, "blighttown"));
            Assert.True(ChapterOf(chapters, "ash-lake") >= ChapterOf(chapters, "the-great-hollow"));
            Assert.Equal(["kiln-of-the-first-flame"], chapters[^1].Areas);
        }
    }

    [Fact]
    public void Keeps_every_offset_within_two_steps_rising_for_the_rising_curve()
    {
        foreach (var curve in Curves.All)
        {
            var offsets = Curves.Offsets(curve, 9, Difficulty.Medium, new SeededRandom(curve.Name()));
            Assert.Equal(9, offsets.Count);
            Assert.All(offsets, o => Assert.True(Math.Abs(o) <= 2));
            if (curve == Curve.Constant) Assert.All(offsets, o => Assert.Equal(0, o));
            for (var k = 1; k < 9; k++)
            {
                if (curve == Curve.Rising) Assert.True(offsets[k] >= offsets[k - 1]);
                if (curve == Curve.Rollercoaster) Assert.NotEqual(offsets[k], offsets[k - 1]);
            }

            if (curve == Curve.Peaks) Assert.Equal(2, offsets.Count(o => o == 2));
        }
    }

    [Fact]
    public void Turns_peaks_into_valleys_at_extreme_and_never_ends_below_the_chosen_level()
    {
        Difficulty[] edges = [Difficulty.Easy, Difficulty.Extreme];
        for (var i = 0; i < 50; i++)
        {
            var valleys = Curves.Offsets(Curve.Peaks, 9, Difficulty.Extreme, new SeededRandom($"valley-{i}"));
            Assert.Equal(2, valleys.Count(o => o == -1));
            Assert.All(valleys.Where(o => o != -1), o => Assert.Equal(0, o));

            // The rollercoaster changes level at the edges too, but for the last step back up.
            foreach (var level in edges)
            {
                var ride = Curves.Offsets(Curve.Rollercoaster, 9, level, new SeededRandom($"ride-{i}")).Select(o => Curves.Shifted(level, o)).ToList();
                for (var k = 1; k < 8; k++) Assert.NotEqual(ride[k], ride[k - 1]);
            }

            foreach (var curve in Curves.All)
            {
                foreach (var chapters in new[] { 4, 9 })
                {
                    foreach (var level in edges)
                    {
                        Assert.True(Curves.Offsets(curve, chapters, level, new SeededRandom($"end-{i}"))[^1] >= 0);
                    }
                }
            }
        }
    }

    [Fact]
    public void Holds_a_shifted_difficulty_within_easy_and_extreme()
    {
        Assert.Equal(Difficulty.Easy, Curves.Shifted(Difficulty.Easy, -1));
        Assert.Equal(Difficulty.Hard, Curves.Shifted(Difficulty.Medium, 1));
        Assert.Equal(Difficulty.Extreme, Curves.Shifted(Difficulty.Hard, 2));
    }

    [Fact]
    public void Gives_a_chapter_on_a_peak_harder_numbers_than_the_rest()
    {
        var challenge = Generator.Generate(Ds1, Config("peaks", Difficulty.Easy, Length.Epic) with { Curve = Curve.Peaks });
        Assert.Equal(2, challenge.Chapters.Count(c => c.Difficulty == Difficulty.Hard));
        Assert.Equal(7, challenge.Chapters.Count(c => c.Difficulty == Difficulty.Easy));
    }

    [Fact]
    public void Gives_the_easy_level_light_orders_and_curses_and_the_extreme_level_heavy_ones()
    {
        static List<Challenge> Budget(Difficulty difficulty) => Enumerable.Range(0, 12)
            .AsParallel()
            .Select(i => Generator.Generate(Ds1, Config($"budget-{i}", difficulty, Length.Full) with { Curve = Curve.Constant }))
            .ToList();

        static Tier? TierOf(string? id) => id is null ? null : Restrictions.Find(id)?.Tier;
        static double MeanWeight(List<Challenge> challenges) =>
            challenges.SelectMany(c => c.Orders).Average(o => o.Template.Weight.Difficulty);

        var easy = Budget(Difficulty.Easy);
        Assert.True(MeanWeight(easy) < MeanWeight(Budget(Difficulty.Extreme)));
        foreach (var challenge in easy)
        {
            var curse = challenge.Orders.FirstOrDefault(o => o.Template.Id == "accumulated-curse")?.Args.List("restrictions") ?? [];
            Assert.All(curse, id => Assert.Equal(Tier.Light, TierOf(id)));
            foreach (var order in challenge.Orders.Where(o => o.Template.Id == "chapter-restriction"))
            {
                Assert.Equal(Tier.Light, TierOf(order.Args.Text("restriction")));
            }
        }

        Assert.True(easy.SelectMany(c => c.Orders).Average(o => o.Template.Weight.Friction) <= 1);
    }

    [Fact]
    public void Gives_every_player_the_same_orders_with_numbers_that_ease_with_the_difficulty()
    {
        static List<int> Counts(Challenge challenge) => challenge.Orders
            .SelectMany(o => o.Template.Params.Where(p => p.Value.Kind == ParamKind.Count).Select(p => o.Args.Number(p.Key) ?? 0))
            .ToList();

        static IReadOnlyList<string> Curse(Challenge challenge) =>
            challenge.Orders.FirstOrDefault(o => o.Template.Id == "accumulated-curse")?.Args.List("restrictions") ?? [];

        foreach (var seed in new[] { "group-1", "group-2", "group-3", "group-4" })
        {
            var group = Generator.GenerateGroup(Ds1, Config(seed, Difficulty.Medium, Length.Full), Curves.Difficulties);
            var extreme = group[3];

            // The hardest player gets exactly the solo challenge.
            Assert.Equal(
                Manual.Render(Ds1, Generator.Generate(Ds1, Config(seed, Difficulty.Extreme, Length.Full))),
                Manual.Render(Ds1, extreme));
            foreach (var challenge in group)
            {
                Assert.Equal(extreme.Setup.StartingClass, challenge.Setup.StartingClass);
                Assert.Equal(extreme.Orders.Select(o => o.Template.Id), challenge.Orders.Select(o => o.Template.Id));
                Assert.Equal(Verdict.Comfortable, Validator.Validate(Ds1, challenge.Setup, challenge.Orders).Verdict);
            }

            for (var i = 0; i < 3; i++)
            {
                var (easier, harder) = (group[i], group[i + 1]);
                Assert.True(easier.Setup.LevelCap >= harder.Setup.LevelCap);
                Assert.All(Counts(easier).Zip(Counts(harder)), pair => Assert.True(pair.First >= pair.Second));
                Assert.Empty(Curse(easier).Except(Curse(harder)));
            }
        }
    }

    [Fact]
    public void Refuses_an_empty_group() =>
        Assert.Throws<ArgumentException>(() => Generator.GenerateGroup(Ds1, Config("x", Difficulty.Medium, Length.Short), []));

    private static GeneratedOrder Generated(string id, OrderArgs args) => new(Catalog.Get(id), args, []);

    [Fact]
    public void Says_do_not_die_for_no_deaths_and_defines_what_a_death_is()
    {
        var lives = Generated("run-lives", new() { ["deaths"] = 0 });
        Assert.StartsWith("Do not die for the whole run.", Manual.OrderText(Ds1, lives), StringComparison.Ordinal);
        Assert.StartsWith("You have 1 death ", Manual.OrderText(Ds1, lives with { Args = new() { ["deaths"] = 1 } }), StringComparison.Ordinal);
        var challenge = Generator.Generate(Ds1, Config("manual", Difficulty.Medium, Length.Short));
        var manual = Manual.Render(Ds1, challenge with { Orders = [lives] });
        Assert.Contains("## Definitions", manual, StringComparison.Ordinal);
        Assert.Contains("- **Death:**", manual, StringComparison.Ordinal);
        Assert.DoesNotContain("- **Attempt:**", manual, StringComparison.Ordinal);
    }

    [Fact]
    public void Lays_the_journey_out_in_chapters_numbering_rules_across_the_manual()
    {
        var challenge = Generator.Generate(Ds1, Config("chapters", Difficulty.Hard, Length.Epic));
        var manual = Manual.Render(Ds1, challenge);
        Assert.Contains("## Rules of the journey\n\n1. **", manual, StringComparison.Ordinal);
        Assert.Contains("## Chapter 1: The Asylum", manual, StringComparison.Ordinal);
        Assert.Matches(@"## Chapter \d: Lord Soul: Nito\n\nUntil you place the Lord Soul \(Nito\)", manual);
        var numbers = Regex.Matches(manual, @"^(\d+)\. \*\*", RegexOptions.Multiline).Select(m => int.Parse(m.Groups[1].Value, provider: null)).ToList();
        Assert.Equal(Enumerable.Range(1, numbers.Count), numbers);
        Assert.Equal(challenge.Orders.Count, numbers.Count);
    }

    [Fact]
    public void Groups_a_short_journey_in_four_acts_with_rules_in_each()
    {
        foreach (var seed in new[] { "act-1", "act-2", "act-3" })
        {
            var challenge = Generator.Generate(Ds1, Config(seed, Difficulty.Medium, Length.Short));
            Assert.Equal([2, 2, 4, 1], challenge.Chapters.Select(c => c.Goals.Count));
            Assert.Contains("northern-undead-asylum", challenge.Chapters[0].Areas);
            foreach (var k in new int?[] { 0, 1, 2, 3 }) Assert.Contains(k, challenge.Orders.Select(o => o.Chapter));
            var manual = Manual.Render(Ds1, challenge);
            Assert.Contains("## Act 1: The first bell", manual, StringComparison.Ordinal);
            Assert.Contains("## Act 3: The Lord Souls", manual, StringComparison.Ordinal);
            Assert.DoesNotContain("## Chapter", manual, StringComparison.Ordinal);
        }
    }

    [Fact]
    public void Writes_a_chapter_restriction_as_the_chapters_stretch() =>
        Assert.Equal(
            "From the moment you ring the bell of the Undead Parish until you have rung both bells: do not roll.",
            Manual.OrderText(Ds1, Generated("chapter-restriction", new()
            {
                ["from"] = "bell-undead-parish",
                ["until"] = "both-bells",
                ["restriction"] = "no-rolling",
            })));

    [Fact]
    public void Writes_milestones_as_what_the_player_does() =>
        Assert.StartsWith(
            "From the moment you defeat Taurus Demon until you have rung both bells: your weapon is the Halberd",
            Manual.OrderText(Ds1, Generated("assigned-weapon", new()
            {
                ["from"] = "boss-taurus-demon",
                ["until"] = "both-bells",
                ["location"] = Ds1.Locations.First(l => l.Found == true && l.Item == "Halberd").Name,
            })),
            StringComparison.Ordinal);

    private static object Loc(string region, string item, string category, bool found = false) =>
        new { name = $"{region}: {item}", region, item, count = 1, category, mandatory = false, found };

    private static object WeaponRow(int id, string name, string category) => new
    {
        id,
        name,
        category,
        melee = true,
        hands = new { both = true },
        req = new { str = 10, dex = 0, @int = 0, fth = 0 },
        baseDamage = new { phys = 100, magic = 0, fire = 0, thunder = 0 },
    };

    /// <summary>
    /// parish, deep (wild), grove (woods). The woods have no other entrance. The Wanderer sells in the parish and in the
    /// wild; the Hermit sells only in the wild.
    /// </summary>
    private static readonly World CutOff = WorldParser.Parse(new RawDataSet
    {
        Meta = J(new { start = "asylum", goal = "Gwyn Defeated" }),
        Regions = J(new[]
        {
            ("asylum", "asylum"), ("parish", "parish"), ("stall", "parish"), ("blight", "blight"),
            ("altar", "altar"), ("kiln", "kiln"), ("deep", "wild"), ("grove", "woods"),
        }.Select(r => new { id = r.Item1, name = r.Item1, area = r.Item2, mandatory = false }).ToArray()),
        Entrances = J(L(
            new { from = "asylum", to = "parish", requires = (object)true },
            new { from = "parish", to = "stall", requires = (object)true },
            new { from = "parish", to = "blight", requires = (object)new { has = "Bell of Awakening #1" } },
            new { from = "blight", to = "altar", requires = (object)new { has = "Bell of Awakening #2" } },
            new { from = "altar", to = "kiln", requires = (object)new { has = "Lordvessel" } },
            new { from = "parish", to = "deep", requires = (object)true },
            new { from = "deep", to = "grove", requires = (object)true })),
        Locations = J(L(
            Loc("asylum", "Asylum Demon Defeated", "BOSS"),
            Loc("parish", "Bell of Awakening #1", "EVENT"),
            Loc("parish", "Club", "CORPSE_ITEM", true),
            Loc("parish", "Shortsword", "CORPSE_ITEM", true),
            Loc("blight", "Bell of Awakening #2", "EVENT"),
            Loc("altar", "Lordvessel", "EVENT"),
            Loc("kiln", "Gwyn Defeated", "BOSS"),
            Loc("stall", "Moss", "SHOP_ITEM"),
            Loc("deep", "Moss", "SHOP_ITEM"))),
        Classes = J(new
        {
            classes = L(new
            {
                name = "Knight",
                level = 5,
                stats = new { strength = 12, dexterity = 10, intelligence = 8, faith = 8, attunement = 10 },
            }),
            gifts = L(new { row = 1, items = L("(none)") }),
        }),
        Bosses = J(L(
            new { id = "asylum-demon", name = "Asylum Demon", region = "asylum" },
            new { id = "gwyn", name = "Gwyn", region = "kiln" })),
        Merchants = J(L(
            new { id = "wanderer", name = "Wanderer", regions = L("stall", "deep") },
            new { id = "hermit", name = "Hermit", regions = L("deep") })),
        Milestones = J(L(
            new { id = "boss-asylum-demon", name = "Asylum", kind = "boss", requires = (object)new { has = "Asylum Demon Defeated" } },
            new { id = "bell-undead-parish", name = "First bell", kind = "bell", requires = (object)new { has = "Bell of Awakening #1" } },
            new { id = "both-bells", name = "Both bells", kind = "bell", requires = (object)new { all = L(new { has = "Bell of Awakening #1" }, new { has = "Bell of Awakening #2" }) } },
            new { id = "lordvessel-obtained", name = "Lordvessel", kind = "item", requires = (object)new { has = "Lordvessel" } },
            new { id = "lordvessel-placed", name = "Lordvessel placed", kind = "item", requires = (object)new { has = "Lordvessel" } },
            new { id = "kiln-open", name = "Kiln", kind = "area", requires = (object)new { region = "kiln" } },
            new { id = "gwyn-dead", name = "Gwyn", kind = "boss", requires = (object)new { has = "Gwyn Defeated" } })),
        Weapons = J(L(WeaponRow(1, "Club", "hammer"), WeaponRow(2, "Shortsword", "sword"))),
    });

    [Fact]
    public void Skips_the_draw_when_the_area_would_cut_off_an_order_already_chosen()
    {
        static OrderArgs Wild() => new() { ["area"] = "wild" };

        // no-bonfire is weight-only, so the draw loop would have kept it without validating the set. Closing the wild is
        // the only way the woods then fail, and that failure must happen here.
        OrderInstance[] woods = [Order("no-bonfire", new() { ["area"] = "woods" })];
        Assert.True(Generator.ForbiddenAreaCutsOff(CutOff, Wild(), woods, []));
        Assert.False(Generator.ForbiddenAreaCutsOff(CutOff, new() { ["area"] = "blight" }, woods, []));
        Assert.True(Generator.ForbiddenAreaCutsOff(CutOff, Wild(), [Order("forbidden-area", new() { ["area"] = "woods" })], []));
        Assert.True(Generator.ForbiddenAreaCutsOff(CutOff, Wild(), [Order("closed-merchant", new() { ["merchant"] = "hermit" })], []));

        // The parish stall is still open, so the Wanderer is not a reason to skip the draw.
        Assert.False(Generator.ForbiddenAreaCutsOff(CutOff, Wild(), [Order("closed-merchant", new() { ["merchant"] = "wanderer" })], []));
    }
}
