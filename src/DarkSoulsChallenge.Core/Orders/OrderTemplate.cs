using System.Text.RegularExpressions;

namespace DarkSoulsChallenge.Core.Orders;

public enum Mode
{
    Static,
    Live,
}

/// <summary>
/// WeightOnly never makes the run impossible, only costs difficulty or friction. Existence: at least one way to
/// comply exists. WorstCase: every choice the player may make still complies. AutoException: the graph lists what
/// the order would forbid but the game requires, and the manual excepts it. ActualCase: checked against what the
/// player reported; live only.
/// </summary>
public enum Validation
{
    WeightOnly,
    Existence,
    WorstCase,
    AutoException,
    ActualCase,
}

/// <summary>Difficulty bands, easiest to hardest. The numbers are the order of the bands.</summary>
public enum Difficulty
{
    Easy,
    Medium,
    Hard,
    Extreme,
}

public enum ParamKind
{
    Area,
    Boss,
    Milestone,
    Merchant,
    Weapon,
    WeaponLocation,
    Count,
    Condition,
    Restriction,
    RestrictionList,
    EquipmentSet,
    LordSoulOrder,

    /// <summary>A damage element other than physical: magic, fire or thunder (lightning).</summary>
    Element,

    /// <summary>A bonfire, by the name of its location ("AL: Darkmoon Tomb Bonfire").</summary>
    Bonfire,

    /// <summary>A number read from the game data, not drawn by difficulty (how many chests an area holds).</summary>
    Tally,

    /// <summary>An item location, by name: a corpse or chest pickup.</summary>
    Location,
}

public readonly record struct IntRange(int Min, int Max);

/// <summary>For counts: the range the seed draws from at each difficulty, when already known.</summary>
public sealed record DifficultyRanges(IntRange Easy, IntRange Medium, IntRange Hard, IntRange Extreme)
{
    public IntRange For(Difficulty difficulty) => difficulty switch
    {
        Difficulty.Easy => Easy,
        Difficulty.Medium => Medium,
        Difficulty.Hard => Hard,
        Difficulty.Extreme => Extreme,
        _ => throw new ArgumentOutOfRangeException(nameof(difficulty)),
    };
}

public sealed record ParamSpec(ParamKind Kind, DifficultyRanges? Ranges = null);

/// <summary>A milestone filled in by the generator, a fixed one, or whichever of several comes first.</summary>
public abstract record MilestoneRef
{
    public sealed record Param(string Name) : MilestoneRef;

    public sealed record Fixed(string Id) : MilestoneRef;

    public sealed record FirstOf(IReadOnlyList<string> Ids) : MilestoneRef;
}

/// <summary>What fires an order. String fields name parameters.</summary>
public abstract record Trigger
{
    public sealed record RunStart : Trigger;

    public sealed record EnterArea(string Area) : Trigger;

    /// <summary>Entering a boss's arena: the "enter area" trigger, with the area given by the boss.</summary>
    public sealed record EnterArena(string Boss) : Trigger;

    /// <summary>Without a boss: any boss.</summary>
    public sealed record DefeatBoss(string? Boss = null) : Trigger;

    public sealed record Death : Trigger;

    public sealed record PickUp : Trigger;

    public sealed record MilestoneReached(MilestoneRef Milestone) : Trigger;
}

/// <summary>How long an order lasts. String fields name parameters.</summary>
public abstract record Scope
{
    public sealed record Run : Scope;

    /// <summary>Between two milestones. Without From it starts when the trigger fires; without Until it lasts to the end.</summary>
    public sealed record Phase(MilestoneRef? From = null, MilestoneRef? Until = null) : Scope;

    public sealed record InArea(string Area) : Scope;

    public sealed record Fight(string Boss) : Scope;

    public sealed record UntilNextMilestone : Scope;
}

public enum CommandKind
{
    Prohibit,
    Require,
    Limit,
    Assign,
    Swap,
    OfferChoice,
}

/// <summary>
/// What the master commands, in a form the validator can act on: its kind, what it acts on, and the parameters
/// it reads, with the kind each of them must have.
/// </summary>
public sealed record Command(CommandKind Kind, string Action, IReadOnlyList<(string Param, ParamKind Kind)> Params)
{
    public static Command Of(CommandKind kind, string action, params (string Param, ParamKind Kind)[] parameters) =>
        new(kind, action, parameters);
}

/// <summary>An attribute, not a fourth piece: the order applies only when this holds.</summary>
public abstract record OrderCondition
{
    public sealed record AttemptsAtMost(string Max) : OrderCondition;

    /// <summary>A condition drawn by the generator, e.g. "without using Estus".</summary>
    public sealed record Drawn(string Param) : OrderCondition;
}

public enum ExceptionRule
{
    RequiredItemsInArea,
    RequiredItemsSoldOnlyBy,
}

/// <summary>An attribute, not a fourth piece: what the graph says the game requires, written into the manual.</summary>
public sealed record OrderExceptions(string Placeholder, ExceptionRule Rule);

/// <summary>
/// What an order costs in the budget of a challenge, on two separate axes: difficulty (skill it demands, 1 to 3)
/// and friction (time, repetition, searching, 0 to 3). Hand-labelled first estimates, to be recalibrated by played
/// results.
/// </summary>
public readonly record struct Weight(int Difficulty, int Friction);

/// <summary>A text that replaces the order's when a count parameter is zero ("Do not die." for 0 deaths).</summary>
public sealed record TextIfZero(string Param, string Text);

/// <summary>What the live master asks the player. Static orders never ask anything.</summary>
public enum Question
{
    WeaponUsed,
    AcceptWager,
    StrengthAndDexterity,
}

/// <summary>
/// The shape of an order template: the three pieces (trigger, scope, command), the modes it exists in, how each mode
/// validates it, and the parameters the generator fills in from the seed. The templates are in <see cref="Catalog"/>.
/// </summary>
public sealed partial record OrderTemplate
{
    public required string Id { get; init; }

    /// <summary>The order's number in the catalog.</summary>
    public required int Number { get; init; }

    public required string Title { get; init; }

    /// <summary>Manual text; {name} placeholders are parameters or the exceptions list.</summary>
    public required string Text { get; init; }

    public TextIfZero? TextIfZero { get; init; }

    public required OrderedDictionary<string, ParamSpec> Params { get; init; }

    public required Weight Weight { get; init; }

    public required Trigger Trigger { get; init; }

    public required Scope Scope { get; init; }

    public required Command Command { get; init; }

    /// <summary>How the static mode validates the order; null when the order is not in that mode.</summary>
    public Validation? Static { get; init; }

    /// <summary>How the live mode validates the order; null when the order is not in that mode.</summary>
    public Validation? Live { get; init; }

    public OrderCondition? Condition { get; init; }

    public OrderExceptions? Exceptions { get; init; }

    public Question? Asks { get; init; }

    /// <summary>Advice printed with the order. Not an order: ignoring it never ends the run.</summary>
    public string? Advice { get; init; }

    /// <summary>Only generated when the player opts in on the customizer.</summary>
    public bool OptIn { get; init; }

    public Validation? ValidationIn(Mode mode) => mode == Mode.Static ? Static : Live;

    public IReadOnlyList<Mode> Modes()
    {
        var modes = new List<Mode>();
        if (Static is not null) modes.Add(Mode.Static);
        if (Live is not null) modes.Add(Mode.Live);
        return modes;
    }

    /// <summary>Every parameter the pieces refer to, with the kind it must have.</summary>
    public IReadOnlyList<(string Param, ParamKind Kind)> ParamRefs()
    {
        var refs = new List<(string Param, ParamKind Kind)>();
        void Milestone(MilestoneRef? reference)
        {
            if (reference is MilestoneRef.Param p) refs.Add((p.Name, ParamKind.Milestone));
        }

        switch (Trigger)
        {
            case Trigger.EnterArea t:
                refs.Add((t.Area, ParamKind.Area));
                break;
            case Trigger.EnterArena t:
                refs.Add((t.Boss, ParamKind.Boss));
                break;
            case Trigger.DefeatBoss { Boss: { } boss }:
                refs.Add((boss, ParamKind.Boss));
                break;
            case Trigger.MilestoneReached t:
                Milestone(t.Milestone);
                break;
        }

        switch (Scope)
        {
            case Scope.Phase s:
                Milestone(s.From);
                Milestone(s.Until);
                break;
            case Scope.InArea s:
                refs.Add((s.Area, ParamKind.Area));
                break;
            case Scope.Fight s:
                refs.Add((s.Boss, ParamKind.Boss));
                break;
        }

        refs.AddRange(Command.Params);

        switch (Condition)
        {
            case OrderCondition.AttemptsAtMost c:
                refs.Add((c.Max, ParamKind.Count));
                break;
            case OrderCondition.Drawn c:
                refs.Add((c.Param, ParamKind.Condition));
                break;
        }

        return refs;
    }

    /// <summary>The {name} placeholders of a text, in order of first appearance.</summary>
    public static IReadOnlyList<string> PlaceholdersOf(string text)
    {
        ArgumentNullException.ThrowIfNull(text);
        return Placeholder().Matches(text).Select(m => m.Groups[1].Value).Distinct(StringComparer.Ordinal).ToList();
    }

    [GeneratedRegex(@"\{(\w+)\}", RegexOptions.CultureInvariant)]
    private static partial Regex Placeholder();
}
