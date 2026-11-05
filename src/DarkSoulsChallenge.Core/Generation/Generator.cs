using DarkSoulsChallenge.Core.Orders;

namespace DarkSoulsChallenge.Core.Generation;

[System.Diagnostics.CodeAnalysis.SuppressMessage("Naming", "CA1720", Justification = "Short is the name of the journey's length.")]
public enum Length
{
    Short,
    Full,
    Epic,
}

/// <summary>What a challenge is generated from.</summary>
/// <param name="Seed">Same config and data, same challenge.</param>
/// <param name="Difficulty">The level the curve moves around.</param>
/// <param name="Length">How long the journey is.</param>
public sealed record GeneratorConfig(string Seed, Difficulty Difficulty, Length Length)
{
    /// <summary>How difficulty moves across the chapters; drawn by the seed when null.</summary>
    public Curve? Curve { get; init; }

    /// <summary>Fixed by the player; drawn by the seed when null.</summary>
    public string? StartingClass { get; init; }

    /// <summary>Fixed by the player; drawn by the seed when null.</summary>
    public int? GiftRow { get; init; }

    /// <summary>Fixed by the player; drawn by the seed when null.</summary>
    public int? LevelCap { get; init; }
}

/// <summary>An order of a challenge, with what the game requires it to except.</summary>
public sealed record GeneratedOrder(OrderTemplate Template, OrderArgs Args, IReadOnlyList<string> Exceptions, int? Chapter = null)
    : OrderInstance(Template, Args, Chapter);

/// <summary>A chapter as the challenge plays it: its stretch of the run and its place on the curve.</summary>
public sealed record ChapterPlan
{
    /// <summary>The milestone that ends the chapter.</summary>
    public required string Goal { get; init; }

    /// <summary>Every milestone the chapter covers, the goal last: more than one in an act of a short journey.</summary>
    public required IReadOnlyList<string> Goals { get; init; }

    public required IReadOnlyList<string> Areas { get; init; }

    public required IReadOnlyList<string> Bosses { get; init; }

    /// <summary>Steps away from the challenge's difficulty (the curve); shared by every player of a group.</summary>
    public required int Offset { get; init; }

    public required Difficulty Difficulty { get; init; }
}

public sealed record Challenge
{
    public required GeneratorConfig Config { get; init; }

    /// <summary>What the player shares. In a group, the code of the hardest player's challenge, which holds the structure.</summary>
    public required string Code { get; init; }

    public required string DataVersion { get; init; }

    public required Setup Setup { get; init; }

    public required Curve Curve { get; init; }

    public required IReadOnlyList<ChapterPlan> Chapters { get; init; }

    /// <summary>The rules of the whole journey first (in catalog order), then each chapter's, chapter by chapter.</summary>
    public required IReadOnlyList<GeneratedOrder> Orders { get; init; }
}

/// <summary>
/// Generates a static challenge as a journey in chapters: the run is cut at its milestones (the Asylum, the bells, the
/// Lordvessel, each Lord Soul in a drawn order, the Kiln); the journey gets a few rules for the whole run, and each
/// chapter its own rules about its areas and bosses, at the chapter's place on the difficulty curve. Orders are added
/// one at a time, in a shuffled order, and kept only when they fit the budget and the whole set still validates as
/// comfortable. Same config and data, same challenge.
/// </summary>
public static class Generator
{
    /// <summary>Version of the drawing rules; part of the seed, so a change in the rules never reuses an old draw.</summary>
    public const string Version = "8";

    private const string Asylum = "boss-asylum-demon";

    /// <summary>The Asylum has one area and one boss.</summary>
    private const int AsylumMax = 1;

    /// <summary>Fresh parameters tried for an order before it is left out.</summary>
    private const int Attempts = 6;

    private const double FrictionPerOrder = 0.75;

    private static readonly string[] TargetParams = ["area", "boss", "restriction"];

    /// <summary>Most times an order is drawn in one run: these repeat the same chore, area after area.</summary>
    private static readonly Dictionary<string, int> RunCaps = new(StringComparer.Ordinal)
    {
        ["errand"] = 2,
        ["every-chest"] = 1,
        ["counted-attempts"] = 3,
    };

    /// <summary>Rules about how one fight is fought: together they would crowd out every other rule of a run.</summary>
    private static readonly HashSet<string> FightRules = new(StringComparer.Ordinal) { "dry-fight", "exploit-weakness", "against-the-grain" };

    private const int FightRulesCap = 3;

    /// <summary>Orders that rule the whole journey; every other static order belongs to a chapter.</summary>
    private static readonly HashSet<string> JourneyTemplates = new(StringComparer.Ordinal)
    {
        "closed-merchant",
        "run-lives",
        "accumulated-curse",
        "phase-swap",
        "forbidden-area",
        "earned-levels",
        "earned-upgrades",
    };

    /// <summary>
    /// Weight-only orders that no other order contradicts: they never make a set impossible, so the generator adds them
    /// without validating the whole set again (a journey validates dozens of times). "Wear what you find" is left out: it
    /// contradicts "no armor" and "nothing from the ground". The challenge is validated once more as a whole before it is
    /// handed out.
    /// </summary>
    private static readonly HashSet<string> WeightOnlyAlwaysFits = new(StringComparer.Ordinal)
    {
        "no-bonfire",
        "one-bonfire",
        "dry-fight",
        "counted-attempts",
        "run-lives",
        "earned-upgrades",
    };

    /// <summary>Soul level cap per difficulty, to tune by playing; never below the class's level.</summary>
    private static IntRange LevelCaps(Difficulty difficulty) => difficulty switch
    {
        Difficulty.Easy => new(60, 90),
        Difficulty.Medium => new(35, 55),
        Difficulty.Hard => new(18, 30),
        _ => new(1, 12),
    };

    /// <summary>
    /// How many orders a journey has: rules of the whole journey. A short challenge stays a handful of good rules; an epic
    /// one has rules for every area of the run.
    /// </summary>
    private static IntRange JourneyOrders(Length length) => length switch
    {
        Length.Short => new(2, 3),
        Length.Full => new(3, 5),
        _ => new(4, 6),
    };

    /// <summary>How many orders each chapter has.</summary>
    private static IntRange ChapterOrders(Length length) => length switch
    {
        Length.Short => new(1, 2),
        Length.Full => new(1, 3),
        _ => new(3, 5),
    };

    /// <summary>
    /// Most rules a manual holds, the order of the Lord Souls included: past this, a journey reads as a list of chores.
    /// Chapters with the most rules give one up first, the later chapter on a tie.
    /// </summary>
    private static int MaxOrders(Length length) => length switch
    {
        Length.Short => 10,
        Length.Full => 18,
        _ => 25,
    };

    /// <summary>
    /// A short journey has too few rules for nine chapters, most of which were left empty, so it groups them in four acts:
    /// the Asylum and the first bell, the second bell and the Lordvessel, the Lord Souls, the Kiln. The sizes are counts of
    /// chapters, in order.
    /// </summary>
    private static int[]? Acts(Length length) => length == Length.Short ? [2, 2, 4, 1] : null;

    /// <summary>
    /// Orders a chapter can only take in one place: the chapter of the first bell, or one with a milestone to start after.
    /// </summary>
    private static bool FitsChapter(string templateId, int k, IReadOnlyList<string> goals) => templateId switch
    {
        "boss-before-bell" => goals.Contains("bell-undead-parish"),
        "assigned-weapon" or "chapter-restriction" => k > 0,
        _ => true,
    };

    /// <summary>
    /// The budget. Difficulty: the average weight an order may have, so an easy chapter is mostly light orders; hard and
    /// extreme have no ceiling. Friction (time, searching, repetition) has a ceiling per order, because no profile enjoys a
    /// challenge made of chores.
    /// </summary>
    private static double DifficultyPerOrder(Difficulty difficulty) => difficulty switch
    {
        Difficulty.Easy => 1.5,
        Difficulty.Medium => 2,
        _ => double.PositiveInfinity,
    };

    /// <summary>
    /// How the candidate orders are shuffled: heavier orders come first more often as the difficulty grows (weight raised
    /// to this power), so a tryhard gets the heavy orders without always getting the same ones.
    /// </summary>
    private static double WeightBias(Difficulty difficulty) => difficulty switch
    {
        Difficulty.Easy => -1,
        Difficulty.Medium => 0,
        Difficulty.Hard => 1,
        _ => 2,
    };

    private sealed class Section(DrawContext context, int target, List<OrderTemplate> pool)
    {
        public DrawContext Context { get; } = context;

        public int Target { get; set; } = target;

        public List<OrderTemplate> Pool { get; } = pool;
    }

    public static Challenge Generate(World world, GeneratorConfig config)
    {
        ArgumentNullException.ThrowIfNull(world);
        ArgumentNullException.ThrowIfNull(config);
        var rng = new SeededRandom($"{ChallengeCode.SeedNumber(config.Seed)}|{world.DataVersion}|{Version}");
        var setup = DrawSetup(world, config, rng);
        var domains = Draw.DomainsOf(world);
        var curve = config.Curve ?? rng.Pick(Curves.All);
        var levelsLocked = setup.LevelCap <= (world.Classes.GetValueOrDefault(setup.StartingClass ?? "")?.Level ?? 1);

        // The Lord Souls' order is the backbone of the later chapters, so it is drawn first and always kept.
        var lordTemplate = Catalog.Get("lord-order");
        OrderInstance? lordOrder = null;
        for (var attempt = 0; attempt < Attempts * 4 && lordOrder is null; attempt++)
        {
            var candidate = new OrderInstance(lordTemplate, new OrderArgs { ["order"] = rng.Shuffle(domains.LordSouls) });
            if (Validator.Validate(world, setup, [candidate]).Verdict == Verdict.Comfortable) lordOrder = candidate;
        }

        if (lordOrder is null) throw new InvalidOperationException($"no order of the Lord Souls validates for {config.Seed}");

        var chapters = ActsOf(Chapters.Of(world, lordOrder.Args.List("order")!, rng), Acts(config.Length));
        var offsets = Curves.Offsets(curve, chapters.Count, config.Difficulty, rng);
        var plans = chapters.Select((c, k) => new ChapterPlan
        {
            Goal = c.Chapter.Goal,
            Goals = c.Goals,
            Areas = c.Chapter.Areas,
            Bosses = c.Chapter.Bosses,
            Offset = offsets[k],
            Difficulty = Curves.Shifted(config.Difficulty, offsets[k]),
        }).ToList();

        var statics = Catalog.All.Where(t => t.Static is not null && !t.OptIn && t.Id != "lord-order").ToList();
        var journeyRange = JourneyOrders(config.Length);
        var sections = new List<Section>
        {
            new(
                new DrawContext(config.Difficulty, levelsLocked),
                rng.NextInt(journeyRange.Min, journeyRange.Max),
                statics.Where(t => JourneyTemplates.Contains(t.Id)).ToList()),
        };
        var chapterRange = ChapterOrders(config.Length);
        for (var k = 0; k < chapters.Count; k++)
        {
            var (chapter, goals) = chapters[k];
            var index = k;
            sections.Add(new Section(
                new DrawContext(plans[k].Difficulty, levelsLocked, new ChapterContext(
                    k == 0 ? chapter.Goal : chapters[k - 1].Chapter.Goal,
                    chapter.Goal,
                    chapter.Areas,
                    chapter.RequiredAreas,
                    chapter.Bosses,
                    chapters.Take(k + 1).SelectMany(c => c.Chapter.Areas).ToList())),
                Math.Min(rng.NextInt(chapterRange.Min, chapterRange.Max), chapter.Goal == Asylum ? AsylumMax : int.MaxValue),
                statics.Where(t => !JourneyTemplates.Contains(t.Id) && FitsChapter(t.Id, index, goals)).ToList()));
        }

        // The Lord Souls' order is one of the rules.
        for (var total = 1 + sections.Sum(s => s.Target); total > MaxOrders(config.Length); total--)
        {
            sections.Aggregate((a, b) => b.Target >= a.Target ? b : a).Target--;
        }

        var frictionBudget = FrictionPerOrder * sections.Sum(s => s.Target);

        var chosen = new List<OrderInstance> { lordOrder };
        double friction = lordTemplate.Weight.Friction;
        var held = Validator.StartingItems(world, setup);
        var uses = new Dictionary<string, int>(StringComparer.Ordinal);

        // An area or a boss may gather several rules, but never the same rule twice.
        var usedTargets = new HashSet<string>(StringComparer.Ordinal);
        for (var index = 0; index < sections.Count; index++)
        {
            var section = sections[index];
            int? chapter = index == 0 ? null : index - 1;
            var difficulty = section.Context.Difficulty;
            var budget = section.Target * DifficultyPerOrder(difficulty);
            double spent = 0;
            var added = 0;

            // Orders already in the journey come later more often, so chapters do not repeat one another.
            var candidates = rng.WeightedShuffle(
                section.Pool,
                t => Math.Pow(t.Weight.Difficulty, WeightBias(difficulty)) / (1 + uses.GetValueOrDefault(t.Id)));
            foreach (var template in candidates)
            {
                if (added >= section.Target) break;
                if (uses.GetValueOrDefault(template.Id) >= RunCaps.GetValueOrDefault(template.Id, int.MaxValue)) continue;
                if (FightRules.Contains(template.Id) && FightRules.Sum(id => uses.GetValueOrDefault(id)) >= FightRulesCap) continue;

                // Leave room for the orders still to come, at the lightest weight.
                if (spent + template.Weight.Difficulty + (section.Target - added - 1) > budget) continue;
                if (friction + template.Weight.Friction > frictionBudget) continue;
                for (var attempt = 0; attempt < Attempts; attempt++)
                {
                    if (Draw.Args(template, domains, section.Context, rng) is not { } args) break;
                    var targets = TargetsOf(args).Select(t => $"{template.Id}|{t}").ToList();
                    if (targets.Any(usedTargets.Contains)) continue;
                    if (Pointless(world, template, args, chapter, chosen, held)) continue;

                    // A forbidden area drawn after another order can close the only way to that order. Try another area.
                    // The validation at the end must not be what rejects the draw.
                    if (template.Id == "forbidden-area" && ForbiddenAreaCutsOff(world, args, chosen, held)) continue;
                    var next = new List<OrderInstance>(chosen) { new(template, args, chapter) };
                    if (!WeightOnlyAlwaysFits.Contains(template.Id) || template.Static != Validation.WeightOnly)
                    {
                        var result = Validator.Validate(world, setup, next);
                        if (result.Verdict != Verdict.Comfortable || !result.Complete) continue;
                    }

                    chosen = next;
                    spent += template.Weight.Difficulty;
                    friction += template.Weight.Friction;
                    added++;
                    uses[template.Id] = uses.GetValueOrDefault(template.Id) + 1;
                    usedTargets.UnionWith(targets);
                    break;
                }
            }
        }

        return Finish(world, config, ChallengeCode.Encode(world, config), setup, curve, plans, chosen);
    }

    /// <summary>
    /// One challenge for a group of players of different skill: the same seed gives everyone the same orders, chapters,
    /// curve, areas, bosses, weapons, class and gift; only the numbers follow each player's difficulty. The structure is
    /// generated for the hardest difficulty of the group, then eased for each player: each chapter keeps its offset on the
    /// curve from the player's own difficulty. Every number is monotonic (a higher level cap, more deaths, attempts or
    /// points, fewer restrictions never make a run impossible), so a structure possible for the hardest player is possible
    /// for all; each eased challenge is still validated. The hardest player gets exactly the solo challenge. Returns one
    /// challenge per difficulty given, in the same order. The config's own difficulty is not used.
    /// </summary>
    public static IReadOnlyList<Challenge> GenerateGroup(World world, GeneratorConfig config, IReadOnlyList<Difficulty> difficulties)
    {
        ArgumentNullException.ThrowIfNull(world);
        ArgumentNullException.ThrowIfNull(config);
        ArgumentNullException.ThrowIfNull(difficulties);
        if (difficulties.Count == 0) throw new ArgumentException("a group needs at least one difficulty", nameof(difficulties));
        var solo = Generate(world, config with { Difficulty = difficulties.Max() });
        return difficulties.Select(difficulty => Ease(world, solo, difficulty)).ToList();
    }

    /// <summary>
    /// The chapters the player reads. An area forbidden for the run is left out, and so are the areas and bosses that can
    /// only be reached through one, so the manual does not send the player somewhere the orders closed. An area "the other
    /// way" closes for a chapter is only postponed: it and what lies past it come back in the next chapter with rules, so
    /// Darkroot Garden closed once does not leave Sif with no Darkroot listed later.
    /// </summary>
    public static IReadOnlyList<ChapterPlan> ReachableChapters(
        World world,
        IReadOnlyList<ChapterPlan> chapters,
        IReadOnlyList<OrderInstance> orders,
        IReadOnlyList<string> items)
    {
        ArgumentNullException.ThrowIfNull(world);
        ArgumentNullException.ThrowIfNull(chapters);
        ArgumentNullException.ThrowIfNull(orders);
        var forbidden = ForbiddenAreas(orders).ToList();
        var open = forbidden.Count > 0 ? Reachability.WithoutAreas(world, forbidden, items).Regions : null;
        bool AreaOpen(string area, IReadOnlySet<string>? reached, IReadOnlyList<string> closed) =>
            !closed.Contains(area) && (reached is null || world.RegionsInArea(area).Any(reached.Contains));
        bool BossOpen(string id, IReadOnlySet<string>? reached)
        {
            var region = world.Bosses.GetValueOrDefault(id)?.Region;
            return string.IsNullOrEmpty(region) || reached is null || reached.Contains(region);
        }

        var result = new List<ChapterPlan>();
        var postponedAreas = new List<string>();
        var postponedBosses = new List<string>();
        for (var k = 0; k < chapters.Count; k++)
        {
            var chapter = chapters[k];
            var index = k;
            var otherWay = orders.Where(o => o.Template.Id == "the-other-way" && o.Chapter == index).Select(o => o.Args.Text("area")).OfType<string>().ToList();
            var closed = forbidden.Concat(otherWay).ToList();
            var reached = closed.Count > 0 ? Reachability.WithoutAreas(world, closed, items).Regions : null;
            var areas = chapter.Areas.Union(postponedAreas, StringComparer.Ordinal).Order(StringComparer.Ordinal).ToList();
            var bosses = chapter.Bosses.Union(postponedBosses, StringComparer.Ordinal).Order(StringComparer.Ordinal).ToList();
            result.Add(chapter with
            {
                Areas = areas.Where(a => AreaOpen(a, reached, closed)).ToList(),
                Bosses = bosses.Where(b => BossOpen(b, reached)).ToList(),
            });

            // What this chapter's other way hides waits for a later chapter; what the run forbids never comes back. A
            // chapter with no rules is not printed, so what it would show goes on waiting.
            var printed = orders.Any(o => o.Chapter == index);
            postponedAreas = areas.Where(a => !AreaOpen(a, reached, closed) && AreaOpen(a, open, forbidden)).ToList();
            postponedBosses = bosses.Where(b => !BossOpen(b, reached) && BossOpen(b, open)).ToList();
            if (!printed)
            {
                postponedAreas.AddRange(areas.Where(a => AreaOpen(a, reached, closed) && !chapter.Areas.Contains(a)));
                postponedBosses.AddRange(bosses.Where(b => BossOpen(b, reached) && !chapter.Bosses.Contains(b)));
            }
        }

        return result;
    }

    /// <summary>
    /// True when closing this area would leave an order already drawn with nowhere to go. A forbidden area already drawn is
    /// judged without its own regions: closing that area is the order. A merchant stays when any of their shops can still
    /// be reached.
    /// </summary>
    public static bool ForbiddenAreaCutsOff(World world, OrderArgs args, IReadOnlyList<OrderInstance> chosen, IReadOnlyList<string> items)
    {
        ArgumentNullException.ThrowIfNull(world);
        ArgumentNullException.ThrowIfNull(args);
        ArgumentNullException.ThrowIfNull(chosen);
        if (args.Text("area") is not { } area) return false;
        var areas = ForbiddenAreas(chosen).Append(area).ToList();
        var reached = Reachability.WithoutAreas(world, areas, items).Regions;
        return chosen.Any(order =>
        {
            if (order.Template.Id != "forbidden-area") return Validator.UnreachableTarget(world, order.Args, reached) is not null;
            if (order.Args.Text("area") is not { } own) return false;
            var others = areas.Where(id => id != own).ToList();
            return others.Count > 0
                && Validator.UnreachableTarget(world, order.Args, Reachability.WithoutAreas(world, others, items).Regions) is not null;
        });
    }

    /// <summary>The challenge in manual order, with each order's automatic exceptions from one last validation.</summary>
    private static Challenge Finish(
        World world,
        GeneratorConfig config,
        string code,
        Setup setup,
        Curve curve,
        IReadOnlyList<ChapterPlan> chapters,
        IReadOnlyList<OrderInstance> orders)
    {
        var sorted = orders.OrderBy(o => o.Chapter ?? -1).ThenBy(o => o.Template.Number).ToList();
        var result = Validator.Validate(world, setup, sorted);
        if (result.Verdict != Verdict.Comfortable || !result.Complete)
        {
            throw new InvalidOperationException($"seed {config.Seed} does not validate: {string.Join("; ", result.Problems)}");
        }

        return new Challenge
        {
            Config = config,
            Code = code,
            DataVersion = world.DataVersion,
            Setup = setup,
            Curve = curve,
            Chapters = ReachableChapters(world, chapters, sorted, Validator.StartingItems(world, setup)),
            Orders = sorted.Select((o, i) => new GeneratedOrder(o.Template, o.Args, result.Orders[i].Exceptions, o.Chapter)).ToList(),
        };
    }

    private static IEnumerable<string> ForbiddenAreas(IEnumerable<OrderInstance> orders) =>
        orders.Where(o => o.Template.Id == "forbidden-area").Select(o => o.Args.Text("area")).OfType<string>();

    /// <summary>The areas, bosses and restrictions an order is about.</summary>
    private static IEnumerable<string> TargetsOf(OrderArgs args) => TargetParams
        .Where(name => args.Text(name) is not null)
        .Select(name => $"{name}:{args.Text(name)}");

    /// <summary>The chapters grouped in acts of the given sizes, each act ending at its last chapter's goal.</summary>
    private static List<(Chapter Chapter, IReadOnlyList<string> Goals)> ActsOf(IReadOnlyList<Chapter> chapters, int[]? sizes)
    {
        if (sizes is null) return chapters.Select(c => (c, (IReadOnlyList<string>)[c.Goal])).ToList();
        if (sizes.Sum() != chapters.Count)
        {
            throw new InvalidOperationException($"acts of {sizes.Sum()} chapters for a journey of {chapters.Count}");
        }

        var acts = new List<(Chapter, IReadOnlyList<string>)>();
        var start = 0;
        foreach (var size in sizes)
        {
            var group = chapters.Skip(start).Take(size).ToList();
            start += size;
            List<string> All(Func<Chapter, IEnumerable<string>> pick) =>
                group.SelectMany(pick).Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToList();

            acts.Add((
                new Chapter(group[^1].Goal, All(c => c.Areas), All(c => c.RequiredAreas), All(c => c.Bosses)),
                group.Select(c => c.Goal).ToList()));
        }

        return acts;
    }

    /// <summary>
    /// An order that would ask nothing on top of the others: attempts against a boss that the deaths of the whole run
    /// already limit more tightly (every lost attempt is a death); a chapter restriction the curse already holds; an order
    /// about a place the journey can no longer reach once its forbidden areas are closed; a fight without Estus in a chapter
    /// that already forbids Estus, or the other way round.
    /// </summary>
    private static bool Pointless(
        World world,
        OrderTemplate template,
        OrderArgs args,
        int? chapter,
        IReadOnlyList<OrderInstance> chosen,
        IReadOnlyList<string> items)
    {
        OrderArgs? Journey(string id) => chosen.FirstOrDefault(o => o.Template.Id == id)?.Args;
        var forbidden = ForbiddenAreas(chosen).ToList();

        // The area an order sends the player into: its own, its boss's, or its pickup's.
        string? PlaceOf(OrderArgs a)
        {
            if (a.Text("area") is { } area) return area;
            var boss = a.Text("boss") is { } id ? world.Bosses.GetValueOrDefault(id) : null;
            var location = world.Locations.FirstOrDefault(l => l.Name == a.Text("location"));
            var region = boss?.Region ?? location?.Region;
            return region is null ? null : world.Regions.GetValueOrDefault(region)?.Area;
        }

        var place = PlaceOf(args);

        // One reach per distinct forbidden set, shared with the validator.
        if (forbidden.Count > 0
            && Validator.UnreachableTarget(world, args, Reachability.WithoutAreas(world, forbidden, items).Regions) is not null)
        {
            return true;
        }

        // An area closed for the chapter (the other way) takes no other order of the chapter, and the other way round.
        var closedTogether = chosen.Any(o =>
            o.Chapter == chapter
            && (o.Template.Id == "the-other-way") != (template.Id == "the-other-way")
            && PlaceOf(o.Args) == place);
        if (place is not null && chapter is not null && closedTogether) return true;

        bool InChapter(string id, string? restriction = null) => chosen.Any(o =>
            o.Chapter == chapter
            && o.Template.Id == id
            && (restriction is null || o.Args.Text("restriction") == restriction));

        switch (template.Id)
        {
            case "counted-attempts":
                return Journey("run-lives")?.Number("deaths") is { } lives
                    && args.Number("attempts") is { } attempts
                    && attempts - 1 >= lives;
            case "chapter-restriction":
                if (Journey("accumulated-curse")?.List("restrictions") is { } curse
                    && args.Text("restriction") is { } restriction
                    && curse.Contains(restriction))
                {
                    return true;
                }

                return args.Text("restriction") == "no-estus" && InChapter("dry-fight");
            case "dry-fight":
                return InChapter("chapter-restriction", "no-estus");

            // Resting at one bonfire of an area asks nothing where no bonfire of it may be used, and the other way round.
            case "one-bonfire":
            case "no-bonfire":
                var other = template.Id == "one-bonfire" ? "no-bonfire" : "one-bonfire";
                return chosen.Any(o => o.Template.Id == other && o.Args.Text("area") == args.Text("area"));
            default:
                return false;
        }
    }

    /// <summary>The same challenge with each number moved to the same relative place in an easier range.</summary>
    private static Challenge Ease(World world, Challenge solo, Difficulty difficulty)
    {
        var from = solo.Config.Difficulty;
        static int Rescale(int value, IntRange a, IntRange b)
        {
            var u = a.Max == a.Min ? 0.5 : (value - a.Min) / (double)(a.Max - a.Min);
            return JsMath.Round(b.Min + (u * (b.Max - b.Min)));
        }

        var classLevel = world.Classes.GetValueOrDefault(solo.Setup.StartingClass ?? "")?.Level ?? 1;
        var levelCap = solo.Config.LevelCap
            ?? Math.Max(classLevel, Rescale(solo.Setup.LevelCap ?? 0, LevelCaps(from), LevelCaps(difficulty)));
        var chapters = solo.Chapters.Select(c => c with { Difficulty = Curves.Shifted(difficulty, c.Offset) }).ToList();

        var orders = solo.Orders.Select(order =>
        {
            var (levelFrom, levelTo) = order.Chapter is { } k
                ? (solo.Chapters[k].Difficulty, chapters[k].Difficulty)
                : (from, difficulty);
            var eased = order.Args;
            foreach (var (name, spec) in order.Template.Params)
            {
                if (spec.Kind == ParamKind.Count && order.Args.Number(name) is { } count)
                {
                    eased = eased.With(name, Rescale(
                        count,
                        Draw.RangeOf(order.Template, name, levelFrom),
                        Draw.RangeOf(order.Template, name, levelTo)));
                }

                if (spec.Kind == ParamKind.RestrictionList && order.Args.List(name) is { } list)
                {
                    eased = eased.With(name, Draw.FitCurse(list, levelTo));
                }
            }

            return new OrderInstance(order.Template, eased, order.Chapter);
        }).ToList();

        return Finish(
            world,
            solo.Config with { Difficulty = difficulty },
            solo.Code,
            solo.Setup with { LevelCap = levelCap },
            solo.Curve,
            chapters,
            orders);
    }

    private static Setup DrawSetup(World world, GeneratorConfig config, SeededRandom rng)
    {
        var classes = world.Classes.Keys.Order(StringComparer.Ordinal).ToList();
        var startingClass = config.StartingClass ?? rng.Pick(classes);
        var level = world.Classes.GetValueOrDefault(startingClass)?.Level
            ?? throw new ArgumentException($"unknown class \"{startingClass}\"", nameof(config));
        var gifts = world.Gifts.OrderBy(g => g.Row).ToList();
        var gift = config.GiftRow is { } row
            ? gifts.FirstOrDefault(g => g.Row == row) ?? throw new ArgumentException($"unknown gift row {row}", nameof(config))
            : rng.Pick(gifts);
        var caps = LevelCaps(config.Difficulty);
        var levelCap = Math.Max(level, config.LevelCap ?? rng.NextInt(caps.Min, caps.Max));
        return new Setup(Mode.Static, gift, startingClass, levelCap);
    }
}
