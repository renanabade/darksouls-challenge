using static DarkSoulsChallenge.Core.Orders.CommandKind;
using P = DarkSoulsChallenge.Core.Orders.ParamKind;

namespace DarkSoulsChallenge.Core.Orders;

/// <summary>The orders of the catalog, as data. Texts are the manual's wording.</summary>
public static class Catalog
{
    private static readonly MilestoneRef FromParam = new MilestoneRef.Param("from");
    private static readonly MilestoneRef UntilParam = new MilestoneRef.Param("until");

    private const string ElementAdvice = "Weapons, spells and thrown items all count, as long as they deal it.";

    public static IReadOnlyList<OrderTemplate> All { get; } =
    [
        new()
        {
            Id = "first-weapon-of-area",
            Number = 1,
            Weight = new(2, 1),
            Title = "First weapon of the area",
            Text = "On entering {area}: the first weapon you pick up here is your only weapon until {until}.",
            Params = Params(("area", P.Area), ("until", P.Milestone)),
            Trigger = new Trigger.EnterArea("area"),
            Scope = new Scope.Phase(Until: UntilParam),
            Command = Command.Of(Assign, "firstPickedUp"),
            Static = Validation.WorstCase,
            Live = Validation.ActualCase,
        },
        new()
        {
            Id = "assigned-weapon",
            Number = 2,
            Weight = new(2, 2),
            Title = "Assigned weapon",
            Text = "From the moment {from} until {until}: your weapon is {location}.",
            Params = Params(("from", P.Milestone), ("until", P.Milestone), ("location", P.WeaponLocation)),
            Trigger = new Trigger.MilestoneReached(FromParam),
            Scope = new Scope.Phase(FromParam, UntilParam),
            Command = Command.Of(Assign, "atLocation", ("location", P.WeaponLocation)),
            Static = Validation.Existence,
            Live = Validation.Existence,
        },
        new()
        {
            Id = "wear-what-you-find",
            Number = 3,
            Weight = new(1, 0),
            Title = "Wear what you find",
            Text = "In {area}: every armor piece you pick up must be put on at once, and stays on until you leave.",
            Params = Params(("area", P.Area)),
            Trigger = new Trigger.PickUp(),
            Scope = new Scope.InArea("area"),
            Command = Command.Of(Require, "wearArmorPickedUp"),
            Static = Validation.WeightOnly,
            Live = Validation.WeightOnly,
        },
        new()
        {
            Id = "boss-inheritance",
            Number = 4,
            Weight = new(2, 1),
            Title = "Boss inheritance",
            Text = "You defeated {boss}. The weapon you used, {weapon}, is forbidden until the end.",
            Params = Params(("boss", P.Boss), ("weapon", P.Weapon)),
            Trigger = new Trigger.DefeatBoss("boss"),
            Scope = new Scope.Run(),
            Command = Command.Of(Prohibit, "useWeapon", ("weapon", P.Weapon)),
            Live = Validation.ActualCase,
            Asks = Question.WeaponUsed,
        },
        new()
        {
            Id = "nothing-from-the-ground",
            Number = 5,
            Weight = new(1, 1),
            Title = "Nothing from the ground",
            Text = "In {area}: nothing you pick up from a corpse or chest may be used or equipped. Except: {exceptions}.",
            Params = Params(("area", P.Area)),
            Trigger = new Trigger.EnterArea("area"),
            Scope = new Scope.InArea("area"),
            Command = Command.Of(Prohibit, "useItemsPickedUp"),
            Static = Validation.AutoException,
            Live = Validation.AutoException,
            Exceptions = new("exceptions", ExceptionRule.RequiredItemsInArea),
            Advice = "Drop anything that is not allowed as soon as you pick it up, so you do not mix it up later.",
        },
        new()
        {
            Id = "no-bonfire",
            Number = 6,
            Weight = new(2, 1),
            Title = "No bonfire",
            Text = "Do not rest at any bonfire in {area}.",
            Params = Params(("area", P.Area)),
            Trigger = new Trigger.EnterArea("area"),
            Scope = new Scope.InArea("area"),
            Command = Command.Of(Prohibit, "restAtBonfire"),
            Static = Validation.WeightOnly,
            Live = Validation.WeightOnly,
        },
        new()
        {
            Id = "dry-fight",
            Number = 7,
            Weight = new(2, 0),
            Title = "Dry fight",
            Text = "Against {boss}: do not use Estus.",
            Params = Params(("boss", P.Boss)),
            Trigger = new Trigger.EnterArena("boss"),
            Scope = new Scope.Fight("boss"),
            Command = Command.Of(Prohibit, "useEstus"),
            Static = Validation.WeightOnly,
            Live = Validation.WeightOnly,
        },
        new()
        {
            Id = "closed-merchant",
            Number = 8,
            Weight = new(1, 1),
            Title = "Closed merchant",
            Text = "Do not buy anything from {merchant}. Except: {exceptions}.",
            Params = Params(("merchant", P.Merchant)),
            Trigger = new Trigger.RunStart(),
            Scope = new Scope.Run(),
            Command = Command.Of(Prohibit, "buyFrom", ("merchant", P.Merchant)),
            Static = Validation.AutoException,
            Live = Validation.AutoException,
            Exceptions = new("exceptions", ExceptionRule.RequiredItemsSoldOnlyBy),
        },
        new()
        {
            Id = "counted-attempts",
            Number = 9,
            Weight = new(2, 0),
            Title = "Counted attempts",
            Text = "You have {attempts} attempts against {boss}.",
            Params = new()
            {
                ["attempts"] = new(P.Count, Ranges((10, 12), (6, 8), (3, 5), (1, 2))),
                ["boss"] = new(P.Boss),
            },
            Trigger = new Trigger.Death(),
            Scope = new Scope.Fight("boss"),
            Command = Command.Of(Limit, "attempts", ("attempts", P.Count)),
            Static = Validation.WeightOnly,
            Live = Validation.WeightOnly,
        },
        new()
        {
            Id = "run-lives",
            Number = 10,
            Weight = new(3, 0),
            Title = "Lives for the run",
            Text = "You have {deaths} deaths for the whole run. Scripted deaths you cannot avoid do not count.",
            TextIfZero = new("deaths", "Do not die for the whole run. Scripted deaths you cannot avoid do not count."),
            Params = new()
            {
                // By profile: a casual player dies far more than a veteran; 0 is deathless.
                ["deaths"] = new(P.Count, Ranges((60, 90), (20, 35), (6, 12), (0, 2))),
            },
            Trigger = new Trigger.Death(),
            Scope = new Scope.Run(),
            Command = Command.Of(Limit, "deaths", ("deaths", P.Count)),
            Static = Validation.WeightOnly,
            Live = Validation.WeightOnly,
        },
        new()
        {
            Id = "accumulated-curse",
            Number = 11,
            Weight = new(3, 0),
            Title = "Accumulated curse",
            Text = "Each boss you defeat adds a new restriction, in this order: {restrictions}.",
            Params = Params(("restrictions", P.RestrictionList)),
            Trigger = new Trigger.DefeatBoss(),
            Scope = new Scope.Run(),
            Command = Command.Of(Prohibit, "restrictions", ("restrictions", P.RestrictionList)),
            Static = Validation.WorstCase,
            Live = Validation.ActualCase,
        },
        new()
        {
            Id = "wager",
            Number = 12,
            Weight = new(2, 0),
            Title = "Wager",
            Text = "Before {boss}: accept {restriction} for this fight only. If you win, choose one of your current restrictions to drop.",
            Params = Params(("boss", P.Boss), ("restriction", P.Restriction)),
            Trigger = new Trigger.EnterArena("boss"),
            Scope = new Scope.Fight("boss"),
            Command = Command.Of(OfferChoice, "restriction", ("restriction", P.Restriction)),
            Live = Validation.ActualCase,
            Asks = Question.AcceptWager,
        },
        new()
        {
            Id = "phase-swap",
            Number = 13,
            Weight = new(2, 1),
            Title = "Phase swap",
            Text = "After the Asylum Demon and until {milestone}: {before}. After it: drop what does not fit and follow {after}.",
            Params = Params(("milestone", P.Milestone), ("before", P.EquipmentSet), ("after", P.EquipmentSet)),
            Trigger = new Trigger.MilestoneReached(new MilestoneRef.Param("milestone")),
            Scope = new Scope.Phase(new MilestoneRef.Param("milestone")),
            Command = Command.Of(Swap, "swap", ("before", P.EquipmentSet), ("after", P.EquipmentSet)),
            Static = Validation.Existence,
            Live = Validation.Existence,
        },
        new()
        {
            Id = "lord-order",
            Number = 14,
            Weight = new(1, 1),
            Title = "Order of the Lords",
            Text = "Collect the four Lord Souls in this order: {order}.",
            Params = Params(("order", P.LordSoulOrder)),
            Trigger = new Trigger.MilestoneReached(new MilestoneRef.Fixed("lordvessel-obtained")),
            Scope = new Scope.Phase(new MilestoneRef.Fixed("lordvessel-obtained")),
            Command = Command.Of(Require, "lordSoulsInOrder", ("order", P.LordSoulOrder)),
            Static = Validation.Existence,
            Live = Validation.Existence,
        },
        new()
        {
            Id = "boss-before-bell",
            Number = 15,
            Weight = new(2, 1),
            Title = "Boss before the bell",
            Text = "Before you ring the first bell, defeat {boss}.",
            Params = Params(("boss", P.Boss)),
            Trigger = new Trigger.RunStart(),
            Scope = new Scope.Phase(Until: new MilestoneRef.FirstOf(["bell-undead-parish", "bell-quelaags-domain"])),
            Command = Command.Of(Require, "defeatBoss", ("boss", P.Boss)),
            Static = Validation.Existence,
            Live = Validation.Existence,
        },
        new()
        {
            Id = "forbidden-area",
            Number = 16,
            Weight = new(1, 1),
            Title = "Forbidden area",
            Text = "Do not enter {area}.",
            Params = Params(("area", P.Area)),
            Trigger = new Trigger.RunStart(),
            Scope = new Scope.Run(),
            Command = Command.Of(Prohibit, "enterArea", ("area", P.Area)),
            Static = Validation.Existence,
            Live = Validation.Existence,
        },
        new()
        {
            Id = "earned-levels",
            Number = 17,
            Weight = new(2, 0),
            Title = "Earned levels",
            Text = "You may only level up with points. Each boss you defeat {condition} is worth {points} points; one point, one level.",
            Params = new()
            {
                ["condition"] = new(P.Condition),
                ["points"] = new(P.Count, Ranges((3, 4), (2, 3), (1, 2), (1, 1))),
            },
            Trigger = new Trigger.DefeatBoss(),
            Scope = new Scope.Run(),
            Command = Command.Of(Limit, "levelUps", ("points", P.Count)),
            Static = Validation.WorstCase,
            Live = Validation.WorstCase,
            Condition = new OrderCondition.Drawn("condition"),
        },
        new()
        {
            Id = "earned-upgrades",
            Number = 18,
            Weight = new(1, 0),
            Title = "Earned upgrades",
            Text = "Your weapon may gain only one upgrade level per boss you defeat.",
            Params = [],
            Trigger = new Trigger.DefeatBoss(),
            Scope = new Scope.Run(),
            Command = Command.Of(Limit, "weaponUpgrades"),
            Static = Validation.WeightOnly,
            Live = Validation.WeightOnly,
        },
        new()
        {
            Id = "adaptive-squeeze",
            Number = 19,
            Weight = new(2, 0),
            Title = "Adaptive squeeze",
            Text = "You defeated {boss} in {attempts} attempts or fewer, so a new restriction applies: {restriction}.",
            Params = Params(("boss", P.Boss), ("attempts", P.Count), ("restriction", P.Restriction)),
            Trigger = new Trigger.DefeatBoss("boss"),
            Scope = new Scope.UntilNextMilestone(),
            Command = Command.Of(Prohibit, "restriction", ("restriction", P.Restriction)),
            Live = Validation.ActualCase,
            Condition = new OrderCondition.AttemptsAtMost("attempts"),
            OptIn = true,
        },
        new()
        {
            Id = "build-question",
            Number = 20,
            Weight = new(2, 1),
            Title = "Build question",
            Text = "From the moment {from} until {until}: your weapon is {weapon}, chosen from those that fit your Strength and Dexterity.",
            Params = Params(("from", P.Milestone), ("until", P.Milestone), ("weapon", P.Weapon)),
            Trigger = new Trigger.MilestoneReached(FromParam),
            Scope = new Scope.Phase(FromParam, UntilParam),
            Command = Command.Of(Assign, "fitsStats", ("weapon", P.Weapon)),
            Live = Validation.ActualCase,
            Asks = Question.StrengthAndDexterity,
        },
        new()
        {
            // A restriction of the vocabulary for one chapter of the journey.
            Id = "chapter-restriction",
            Number = 21,
            Weight = new(2, 0),
            Title = "Chapter restriction",
            Text = "From the moment {from} until {until}: {restriction}",
            Params = Params(("from", P.Milestone), ("until", P.Milestone), ("restriction", P.Restriction)),
            Trigger = new Trigger.MilestoneReached(FromParam),
            Scope = new Scope.Phase(FromParam, UntilParam),
            Command = Command.Of(Prohibit, "restriction", ("restriction", P.Restriction)),
            Static = Validation.WorstCase,
            Live = Validation.WorstCase,
        },

        // The bosses' defenses per element. The element is drawn from the boss: the one it defends worst, or the one
        // it resists most without being immune.
        new()
        {
            Id = "exploit-weakness",
            Number = 22,
            Weight = new(1, 1),
            Title = "Exploit the weakness",
            Text = "Against {boss}: fight only with {element}, what it defends worst. Every attack that hits it must deal {element} damage.",
            Params = Params(("boss", P.Boss), ("element", P.Element)),
            Trigger = new Trigger.EnterArena("boss"),
            Scope = new Scope.Fight("boss"),
            Command = Command.Of(Require, "dealElement", ("element", P.Element)),
            Static = Validation.Existence,
            Live = Validation.Existence,
            Advice = ElementAdvice,
        },
        new()
        {
            Id = "against-the-grain",
            Number = 23,
            Weight = new(3, 1),
            Title = "Against the grain",
            Text = "Against {boss}: fight only with {element}, what it resists most. Every attack that hits it must deal {element} damage.",
            Params = Params(("boss", P.Boss), ("element", P.Element)),
            Trigger = new Trigger.EnterArena("boss"),
            Scope = new Scope.Fight("boss"),
            Command = Command.Of(Require, "dealElement", ("element", P.Element)),
            Static = Validation.Existence,
            Live = Validation.Existence,
            Advice = ElementAdvice,
        },

        // Rules about what an area holds: its crystal lizards, its chests, its bonfires.
        new()
        {
            Id = "lizard-hunt",
            Number = 24,
            Weight = new(1, 2),
            Title = "Lizard hunt",
            Text = "In {area}: kill every crystal lizard before {until}.",
            Params = Params(("area", P.Area), ("until", P.Milestone)),
            Trigger = new Trigger.EnterArea("area"),
            Scope = new Scope.Phase(Until: UntilParam),
            Command = Command.Of(Require, "killCrystalLizards", ("area", P.Area)),
            Static = Validation.Existence,
            Live = Validation.Existence,
        },
        new()
        {
            Id = "every-chest",
            Number = 25,
            Weight = new(1, 2),
            Title = "Every chest",
            Text = "In {area}: open all {chests} chests before {until}.",
            Params = Params(("area", P.Area), ("chests", P.Tally), ("until", P.Milestone)),
            Trigger = new Trigger.EnterArea("area"),
            Scope = new Scope.Phase(Until: UntilParam),
            Command = Command.Of(Require, "openChests", ("area", P.Area), ("chests", P.Tally)),
            Static = Validation.Existence,
            Live = Validation.Existence,
        },
        new()
        {
            Id = "one-bonfire",
            Number = 26,
            Weight = new(1, 1),
            Title = "One bonfire",
            Text = "In {area}: rest only at the {bonfire}.",
            Params = Params(("area", P.Area), ("bonfire", P.Bonfire)),
            Trigger = new Trigger.EnterArea("area"),
            Scope = new Scope.InArea("area"),
            Command = Command.Of(Prohibit, "restAtBonfireBut", ("bonfire", P.Bonfire)),
            Static = Validation.WeightOnly,
            Live = Validation.WeightOnly,
        },

        // Errands and routes, both checked on the graph.
        new()
        {
            Id = "errand",
            Number = 27,
            Weight = new(1, 1),
            Title = "Errand",
            Text = "Before {until}: take {location}.",
            Params = Params(("location", P.Location), ("until", P.Milestone)),
            Trigger = new Trigger.RunStart(),
            Scope = new Scope.Phase(Until: UntilParam),
            Command = Command.Of(Require, "takeItem", ("location", P.Location)),
            Static = Validation.Existence,
            Live = Validation.Existence,
        },
        new()
        {
            Id = "the-other-way",
            Number = 28,
            Weight = new(2, 2),
            Title = "The other way",
            Text = "Until {until}: do not enter {area}.",
            Params = Params(("area", P.Area), ("until", P.Milestone)),
            Trigger = new Trigger.RunStart(),
            Scope = new Scope.Phase(Until: UntilParam),
            Command = Command.Of(Prohibit, "enterArea", ("area", P.Area)),
            Static = Validation.Existence,
            Live = Validation.Existence,
        },
    ];

    /// <summary>The template of an id, or an error: asking for one that does not exist is a programming error.</summary>
    public static OrderTemplate Get(string id) =>
        All.FirstOrDefault(t => t.Id == id) ?? throw new InvalidOperationException($"no order \"{id}\" in the catalog");

    private static OrderedDictionary<string, ParamSpec> Params(params (string Name, P Kind)[] parameters)
    {
        var specs = new OrderedDictionary<string, ParamSpec>(StringComparer.Ordinal);
        foreach (var (name, kind) in parameters)
        {
            specs[name] = new ParamSpec(kind);
        }

        return specs;
    }

    private static DifficultyRanges Ranges((int, int) easy, (int, int) medium, (int, int) hard, (int, int) extreme) => new(
        new(easy.Item1, easy.Item2),
        new(medium.Item1, medium.Item2),
        new(hard.Item1, hard.Item2),
        new(extreme.Item1, extreme.Item2));
}
