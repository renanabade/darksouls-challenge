using System.Globalization;
using System.Text.RegularExpressions;
using DarkSoulsChallenge.Core.Orders;

namespace DarkSoulsChallenge.Core.Generation;

/// <summary>A rule as the player reads it, numbered across the manual so players can refer to "rule 14".</summary>
public sealed record RuleView(int Number, string Title, string Text, string? Advice);

/// <param name="Heading">"Chapter 2: The first bell"; an act of a short journey says "Act".</param>
/// <param name="Until">"you ring the bell of the Undead Parish".</param>
/// <param name="Areas">Area names.</param>
/// <param name="Bosses">Boss names.</param>
/// <param name="Difficulty">The chapter's place on the curve.</param>
/// <param name="Rules">The chapter's rules.</param>
public sealed record ChapterView(
    string Heading,
    string Until,
    IReadOnlyList<string> Areas,
    IReadOnlyList<string> Bosses,
    Difficulty Difficulty,
    IReadOnlyList<RuleView> Rules);

public sealed record Definition(string Term, string Text);

public sealed record ChallengeWarning(string Npc, string Text);

/// <summary>
/// The challenge as the player reads it, in plain data: what the Markdown manual prints and what a page renders, with
/// every name already resolved. A chapter with no rules is left out.
/// </summary>
public sealed record ChallengeView
{
    public required string Seed { get; init; }

    public required string GeneratorVersion { get; init; }

    public required string DataVersion { get; init; }

    public required string StartingClass { get; init; }

    /// <summary>"Prism Stone x10".</summary>
    public required IReadOnlyList<string> Gift { get; init; }

    public required int LevelCap { get; init; }

    public required Difficulty Difficulty { get; init; }

    public required Curve Curve { get; init; }

    public required Length Length { get; init; }

    public required IReadOnlyList<RuleView> Journey { get; init; }

    public required IReadOnlyList<ChapterView> Chapters { get; init; }

    /// <summary>Only the words the challenge uses.</summary>
    public required IReadOnlyList<Definition> Definitions { get; init; }

    /// <summary>NPCs the game's scripts can lose or turn, whatever the orders: not orders, just what the game hides.</summary>
    public required IReadOnlyList<ChallengeWarning> Warnings { get; init; }
}

public static partial class Manual
{
    /// <summary>Words whose meaning decides whether an order was broken, defined once so that players comparing runs read them the same way.</summary>
    private static readonly (string Term, string Text, Func<OrderInstance, bool> Applies)[] Definitions =
    [
        (
            "Death",
            "every time you die. The only one that does not count is your first death against Seath the Scaleless in The Duke's Archives, which the story requires.",
            o => o.Template.Id == "run-lives"),
        (
            "Attempt",
            "each fight against a boss that you start, whether you win, die or leave.",
            o => o.Template.Id == "counted-attempts" || o.Args.Text("condition") == "on your first attempt"),
        (
            "Pick up",
            "take an item from a corpse or a chest in the world. What enemies drop, what you buy and what characters give you are not picked up.",
            o => o.Template.Id is "first-weapon-of-area" or "wear-what-you-find" or "nothing-from-the-ground"),
        (
            "Use",
            "equip, wear, wield, cast or consume.",
            o => o.Template.Id == "nothing-from-the-ground" || Cursed(o, "no-consumables") || Cursed(o, "no-rings")),
        (
            "Chest",
            "a treasure chest placed in the world. A mimic is not one, even though it looks like one.",
            o => o.Template.Id == "every-chest"),
        (
            "Consumable",
            "an item that is spent when you use it. The Estus Flask is not one.",
            o => Cursed(o, "no-consumables")),
    ];

    /// <summary>The lower-case name of a difficulty, as the manual and the API write it.</summary>
    public static string Name(this Difficulty difficulty) => difficulty.ToString().ToLowerInvariant();

    /// <summary>The lower-case name of a curve, as the manual and the API write it.</summary>
    public static string Name(this Curve curve) => curve.ToString().ToLowerInvariant();

    /// <summary>The lower-case name of a length, as the manual and the API write it.</summary>
    public static string Name(this Length length) => length.ToString().ToLowerInvariant();

    /// <summary>Milestones as what the player does, so texts read "until you defeat Taurus Demon".</summary>
    private static string MilestonePhrase(World world, string id)
    {
        if (world.Milestones.GetValueOrDefault(id) is not { } milestone) return id;
        switch (id)
        {
            case "bell-undead-parish":
                return "you ring the bell of the Undead Parish";
            case "bell-quelaags-domain":
                return "you ring the bell of Quelaag's Domain";
            case "both-bells":
                return "you have rung both bells";
            case "lordvessel-obtained":
                return "you obtain the Lordvessel";
            case "lordvessel-placed":
                return "you place the Lordvessel";
            case "kiln-open":
                return "the Kiln of the First Flame opens";
        }

        // Each lord-souls milestone is one soul placed in the Lordvessel, not the n-th soul placed.
        if (milestone.Kind == "lord-souls") return $"you place the {LordSoulOf(world, id)}";
        if (milestone.Kind == "boss")
        {
            var boss = world.Bosses.Values.FirstOrDefault(b => $"boss-{b.Id}" == id);
            return $"you defeat {(boss is null ? milestone.Name : BossName(boss))}";
        }

        return milestone.Name;
    }

    /// <summary>Boss names as the manual says them.</summary>
    private static string BossName(Boss boss) => boss.Id == "knight-artorias" ? "Artorias" : boss.Name;

    /// <summary>The Lord Soul a lord-souls milestone places, e.g. "Lord Soul (Nito)".</summary>
    private static string LordSoulOf(World world, string id)
    {
        if (world.Milestones.GetValueOrDefault(id) is not { } milestone) return id;
        var souls = world.Locations.Where(l => l.Category == "LORD_SOUL").Select(l => l.Item).ToHashSet(StringComparer.Ordinal);
        return milestone.Requires.Items().FirstOrDefault(souls.Contains) ?? id;
    }

    /// <summary>
    /// A chapter's name, from the milestones it covers: "The first bell", "Lord Soul: Nito". An act of a short journey takes
    /// its last milestone's name, and the act of the four Lord Souls is "The Lord Souls".
    /// </summary>
    public static string ChapterTitle(World world, IReadOnlyList<string> goals)
    {
        ArgumentNullException.ThrowIfNull(world);
        ArgumentNullException.ThrowIfNull(goals);
        var goal = goals.Count > 0 ? goals[^1] : "";
        if (goals.Count > 1 && goals.All(g => world.Milestones.GetValueOrDefault(g)?.Kind == "lord-souls")) return "The Lord Souls";
        switch (goal)
        {
            case "boss-asylum-demon":
                return "The Asylum";
            case "bell-undead-parish":
                return "The first bell";
            case "both-bells":
                return "The second bell";
            case "lordvessel-placed":
                return "The Lordvessel";
        }

        var milestone = world.Milestones.GetValueOrDefault(goal);
        if (milestone?.Kind == "lord-souls")
        {
            var soul = LordSoulOf(world, goal);
            var match = InParentheses().Match(soul);
            return $"Lord Soul: {(match.Success ? match.Groups[1].Value : soul)}";
        }

        if (milestone is not null && milestone.Requires.Items().Contains(world.Goal)) return "The First Flame";
        return milestone?.Name ?? goal;
    }

    private static string Plural(string category) =>
        category == "fist" ? "fist weapons" : category.EndsWith('s') ? category : $"{category}s";

    private static string Value(World world, ParamKind kind, ArgValue arg)
    {
        switch (arg)
        {
            case ArgValue.Number number:
                return number.Value.ToString(CultureInfo.InvariantCulture);
            case ArgValue.TextList list:
                // "(1) Do not roll; (2) ...": the template's own period closes the list.
                if (kind == ParamKind.RestrictionList)
                {
                    return string.Join("; ", list.Values.Select((id, i) =>
                        $"({i + 1}) {(Restrictions.Find(id)?.Text ?? id).TrimEnd('.')}"));
                }

                return string.Join(kind == ParamKind.LordSoulOrder ? ", then " : ", ", list.Values);
        }

        var text = ((ArgValue.Text)arg).Value;
        switch (kind)
        {
            case ParamKind.Area:
                return world.Areas.GetValueOrDefault(text)?.Name ?? text;
            case ParamKind.Boss:
                return world.Bosses.GetValueOrDefault(text) is { } boss ? BossName(boss) : text;
            case ParamKind.Milestone:
                return MilestonePhrase(world, text);
            case ParamKind.Merchant:
                return world.Merchants.GetValueOrDefault(text)?.Name ?? text;
            case ParamKind.Location:
            case ParamKind.WeaponLocation:
                {
                    // "the Halberd found in Undead Parish", plus DSAP's landmark when its name has one ("UP: Halberd - On the bridge").
                    var location = world.Locations.FirstOrDefault(l => l.Name == text);
                    if (location is null) return text;
                    var landmark = Landmark().Match(location.Name);
                    var area = world.Areas.GetValueOrDefault(world.Regions.GetValueOrDefault(location.Region)?.Area ?? "")?.Name;
                    var parts = new List<string> { $"the {location.Item}" };
                    if (area is not null) parts.Add($"found in {area}");
                    if (landmark.Success) parts.Add($"({landmark.Groups[1].Value})");
                    return string.Join(' ', parts);
                }

            case ParamKind.EquipmentSet:
                return text switch
                {
                    // A school of magic as a fighting style: your attacks are its spells, cast with a catalyst of the school.
                    "sorcery" => "only sorceries for your attacks, cast with a catalyst",
                    "miracle" => "only miracles for your attacks, cast with a talisman",
                    "pyromancy" => "only pyromancies for your attacks, cast with a pyromancy flame",
                    _ => $"only {Plural(text)}",
                };
            case ParamKind.Element:
                return text == "thunder" ? "lightning" : text;
            case ParamKind.Bonfire:
                // "AL: Darkmoon Tomb Bonfire" gives "Darkmoon Tomb Bonfire".
                return AreaCode().Replace(text, "", 1);
            case ParamKind.Restriction:
                {
                    // "...: do not roll."
                    var restriction = Restrictions.Find(text)?.Text ?? text;
                    return $"{char.ToLowerInvariant(restriction[0])}{restriction[1..]}";
                }

            default:
                return text;
        }
    }

    public static string OrderText(World world, GeneratedOrder order)
    {
        ArgumentNullException.ThrowIfNull(world);
        ArgumentNullException.ThrowIfNull(order);
        var template = order.Template;
        var zero = template.TextIfZero;
        var text = zero is not null && order.Args.Number(zero.Param) == 0 ? zero.Text : template.Text;
        if (template.Exceptions is { } exceptions)
        {
            var placeholder = $"{{{exceptions.Placeholder}}}";
            text = order.Exceptions.Count > 0
                ? text.Replace(placeholder, string.Join(", ", order.Exceptions), StringComparison.Ordinal)
                : text.Replace($" Except: {placeholder}.", "", StringComparison.Ordinal);
        }

        foreach (var (name, spec) in template.Params)
        {
            if (order.Args[name] is { } arg)
            {
                text = text.Replace($"{{{name}}}", Value(world, spec.Kind, arg), StringComparison.Ordinal);
            }
        }

        // Exceptions an order's restrictions add (e.g. the rings the run needs under "no rings").
        if (template.Exceptions is null && order.Exceptions.Count > 0)
        {
            var needs = order.Chapter is null ? "the run needs" : "this stretch needs";
            text += $" Allowed, because {needs} them: {string.Join(", ", order.Exceptions)}.";
        }

        return OnePlural().Replace(text, m => $"1 {m.Groups[1].Value[..^1]}");
    }

    private static bool Cursed(OrderInstance order, string restriction) =>
        order.Args.List("restrictions")?.Contains(restriction) == true;

    public static ChallengeView Describe(World world, Challenge challenge)
    {
        ArgumentNullException.ThrowIfNull(world);
        ArgumentNullException.ThrowIfNull(challenge);
        var config = challenge.Config;
        var setup = challenge.Setup;
        var number = 0;
        RuleView Rule(GeneratedOrder o) => new(++number, o.Template.Title, OrderText(world, o), o.Template.Advice);

        var journey = challenge.Orders.Where(o => o.Chapter is null).Select(Rule).ToList();
        var part = challenge.Chapters.Any(c => c.Goals.Count > 1) ? "Act" : "Chapter";
        var chapters = new List<ChapterView>();
        for (var k = 0; k < challenge.Chapters.Count; k++)
        {
            var chapter = challenge.Chapters[k];
            var index = k;
            var orders = challenge.Orders.Where(o => o.Chapter == index).ToList();
            if (orders.Count == 0) continue;
            chapters.Add(new ChapterView(
                $"{part} {k + 1}: {ChapterTitle(world, chapter.Goals)}",
                MilestonePhrase(world, chapter.Goal),
                chapter.Areas.Select(id => world.Areas.GetValueOrDefault(id)?.Name ?? id).ToList(),
                chapter.Bosses.Select(id => world.Bosses.GetValueOrDefault(id) is { } boss ? BossName(boss) : id).ToList(),
                chapter.Difficulty,
                orders.Select(Rule).ToList()));
        }

        return new ChallengeView
        {
            Seed = config.Seed,
            GeneratorVersion = Generator.Version,
            DataVersion = challenge.DataVersion,
            StartingClass = setup.StartingClass ?? "",
            Gift = setup.Gift.Items.Select(i => i.Count > 1 ? $"{i.Item} x{i.Count}" : i.Item).ToList(),
            LevelCap = setup.LevelCap ?? 0,
            Difficulty = config.Difficulty,
            Curve = challenge.Curve,
            Length = config.Length,
            Journey = journey,
            Chapters = chapters,
            Definitions = Definitions
                .Where(d => challenge.Orders.Any(d.Applies))
                .Select(d => new Definition(d.Term, d.Text))
                .ToList(),
            Warnings = world.Warnings.Select(w => new ChallengeWarning(w.Npc, w.Text)).ToList(),
        };
    }

    /// <summary>
    /// The manual as Markdown: the challenge's settings, the rules of the whole journey, then each chapter with its stretch,
    /// areas, bosses, difficulty and rules.
    /// </summary>
    public static string Render(World world, Challenge challenge)
    {
        var view = Describe(world, challenge);
        static string Rule(RuleView r) =>
            $"{r.Number}. **{r.Title}.** {r.Text}{(r.Advice is null ? "" : $" _{r.Advice}_")}";

        static IEnumerable<string> Notes(string title, IReadOnlyList<(string Term, string Text)> list) => list.Count == 0
            ? []
            : [$"## {title}", "", .. list.Select(n => $"- **{n.Term}:** {n.Text}"), ""];

        var lines = new List<string>
        {
            $"# Dark Souls challenge — seed {view.Seed}",
            "",
            $"- **Class:** {view.StartingClass}",
            $"- **Starting gift:** {(view.Gift.Count > 0 ? string.Join(", ", view.Gift) : "none")}",
            $"- **Soul level cap:** {view.LevelCap}",
            $"- **Difficulty:** {view.Difficulty.Name()} · **Curve:** {view.Curve.Name()} · **Length:** {view.Length.Name()}",
            "",
            "Follow every order. Break one, and the challenge is over: there is no penalty, only the end.",
            "",
            "## Rules of the journey",
            "",
        };
        lines.AddRange(view.Journey.Select(Rule));
        lines.Add("");
        foreach (var chapter in view.Chapters)
        {
            var about = new List<string> { $"Until {chapter.Until}", $"**Areas:** {string.Join(", ", chapter.Areas)}" };
            if (chapter.Bosses.Count > 0) about.Add($"**Bosses:** {string.Join(", ", chapter.Bosses)}");
            about.Add($"**Difficulty:** {chapter.Difficulty.Name()}");
            lines.Add($"## {chapter.Heading}");
            lines.Add("");
            lines.Add(string.Join(" · ", about));
            lines.Add("");
            lines.AddRange(chapter.Rules.Select(Rule));
            lines.Add("");
        }

        lines.AddRange(Notes("Definitions", view.Definitions.Select(d => (d.Term, d.Text)).ToList()));
        lines.AddRange(Notes("Before you go", view.Warnings.Select(w => (w.Npc, w.Text)).ToList()));
        lines.Add($"<sub>Data {view.DataVersion}. Same seed and settings, same challenge.</sub>");
        lines.Add("");
        return string.Join('\n', lines);
    }

    [GeneratedRegex(@"\(([^)]+)\)", RegexOptions.CultureInvariant)]
    private static partial Regex InParentheses();

    [GeneratedRegex(@"^[^:]+:\s*[^-]+-\s*(.+)$", RegexOptions.CultureInvariant)]
    private static partial Regex Landmark();

    [GeneratedRegex(@"^[^:]+:\s*", RegexOptions.CultureInvariant)]
    private static partial Regex AreaCode();

    [GeneratedRegex(@"\b1 (points|deaths|attempts)\b", RegexOptions.CultureInvariant)]
    private static partial Regex OnePlural();
}
