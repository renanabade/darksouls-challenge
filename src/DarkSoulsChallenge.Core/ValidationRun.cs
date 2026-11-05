using DarkSoulsChallenge.Core.Orders;

namespace DarkSoulsChallenge.Core;

/// <summary>
/// One validation of one set of orders. Reading an order registers its checks and constraints; the checks run once
/// every order is read, because each one must see what all the others forbid.
/// </summary>
internal sealed class ValidationRun
{
    /// <summary>Where the first phase of a phase swap starts: after the first boss, fought with the class's kit.</summary>
    private const string PhaseSwapStart = "boss-asylum-demon";

    /// <summary>Location categories of things bought from a merchant.</summary>
    private static readonly HashSet<string> Shop = new(StringComparer.Ordinal)
    {
        "SHOP_ITEM",
        "SHOP_EXTENDED_ITEM",
        "MISSABLE_SHOP_ITEM",
    };

    /// <summary>A restriction and an order that cannot both hold: wearing what you find vs wearing no armor.</summary>
    private static readonly (string Restriction, string Template)[] Conflicts = [("no-armor", "wear-what-you-find")];

    private static readonly string[] ErrandTemplates = ["lizard-hunt", "every-chest", "errand"];

    private sealed class Constraints
    {
        public HashSet<string> Regions { get; init; } = new(StringComparer.Ordinal);

        public HashSet<Location> Locations { get; init; } = [];
    }

    private sealed class ResultBuilder(string id)
    {
        public string Id { get; } = id;

        public Support Support { get; set; } = Support.Graph;

        public List<string> Exceptions { get; } = [];
    }

    /// <summary>An order that chooses your weapon: when it starts and ends, and every weapon it may hand you.</summary>
    private sealed record WeaponPhase(
        string Id,
        Func<Reach, bool> Starts,
        Milestone? Until,
        Func<Constraints, IReadOnlyList<Weapon>> Weapons);

    private sealed record ElementFight(string Id, Boss Boss, Element Element);

    private sealed record ExceptionOrder(ResultBuilder Result, Func<IReadOnlyList<Location>> Candidates);

    private sealed record ChapterException(ResultBuilder Result, Milestone From, Milestone Until);

    private readonly World _world;
    private readonly Setup _setup;
    private readonly IReadOnlyList<OrderInstance> _orders;
    private readonly IReadOnlyList<string> _startItems;
    private readonly IReadOnlyList<string> _kit;
    private readonly Constraints _constraints = new();
    private readonly List<Func<Constraints, string?>> _checks = [];
    private readonly Dictionary<string, IReadOnlyList<Boss>> _requiredBosses = new(StringComparer.Ordinal);

    // Build effects of restrictions and orders, read by the weapon checks (which run after every order is read).
    private readonly HashSet<string> _activeRestrictions = new(StringComparer.Ordinal);
    private readonly List<string> _schoolStyles = [];
    private bool _noLevelUps;
    private bool _twoHanding = true;

    private readonly List<ElementFight> _elementFights = [];
    private readonly List<ResultBuilder> _results = [];

    // Orders that forbid locations but except what the game requires. Candidates are listed once every order is read,
    // because a shared shop closes only when all its merchants are closed.
    private readonly List<ExceptionOrder> _exceptionOrders = [];
    private readonly HashSet<string> _closedMerchants = new(StringComparer.Ordinal);
    private readonly List<WeaponPhase> _weaponPhases = [];

    // A chapter's restriction on items lasts until the chapter's goal: its exceptions are only what the chapter needs,
    // and can be obtained by the time it ends.
    private readonly List<ChapterException> _chapterExceptions = [];

    public ValidationRun(World world, Setup setup, IReadOnlyList<OrderInstance> orders)
    {
        _world = world;
        _setup = setup;
        _orders = orders;
        _startItems = Validator.StartingItems(world, setup);
        _kit = world.Classes.GetValueOrDefault(setup.StartingClass ?? "")?.Kit ?? [];
        _checks.Add(c => Run(c).Items.Contains(_world.Goal) ? null : $"the goal \"{_world.Goal}\" cannot be reached");
    }

    public ValidationResult Execute()
    {
        for (var index = 0; index < _orders.Count; index++)
        {
            ReadOrder(index, _orders[index]);
        }

        AddContradictions();
        AddPlacesStayReachable();
        ComputeExceptions();

        var problems = Failures(_constraints);
        return new ValidationResult(
            problems.Count > 0 ? Verdict.Impossible : Verdict.Comfortable,
            problems,
            _results.Select(r => new OrderResult(r.Id, r.Support, r.Exceptions)).ToList(),
            _results.All(r => r.Support != Support.Pending));
    }

    private List<string> Failures(Constraints constraints)
    {
        var failures = new List<string>();
        foreach (var check in _checks)
        {
            if (check(constraints) is { } problem) failures.Add(problem);
        }

        return failures;
    }

    private Reach Run(Constraints c, IReadOnlySet<string>? forbiddenItems = null) =>
        Reachability.Walk(_world, new ReachOptions
        {
            Items = _startItems,
            ForbiddenRegions = c.Regions,
            ForbiddenLocations = c.Locations,
            ForbiddenItems = forbiddenItems,
        });

    private static HashSet<string> SetOf(IEnumerable<string> items) => items.ToHashSet(StringComparer.Ordinal);

    /// <summary>
    /// Bosses without whom a requirement cannot be met. Computed on the forbidden areas only: forbidden pickups would
    /// only make the goal check fail first. Memoized, since checks run many times.
    /// </summary>
    private IReadOnlyList<Boss> BossesRequiredFor(Constraints c, string key, Requirement requirement)
    {
        if (!_requiredBosses.TryGetValue(key, out var bosses))
        {
            var regionsOnly = new Constraints { Regions = c.Regions };
            bosses = _world.Bosses.Values
                .Where(b => !Run(regionsOnly, SetOf([b.DefeatedItem])).Satisfies(requirement))
                .ToList();
            _requiredBosses[key] = bosses;
        }

        return bosses;
    }

    private (Stats Stats, int Points) Build(string label)
    {
        var startingClass = _world.Classes.GetValueOrDefault(_setup.StartingClass ?? "");
        if (startingClass is null || _setup.LevelCap is not { } levelCap)
        {
            throw new InvalidOrderException($"{label}: weapon orders need a starting class and a level cap");
        }

        var points = levelCap - startingClass.Level;
        if (points < 0) throw new InvalidOrderException($"{label}: level cap below the {startingClass.Name}'s level");
        return (startingClass.Stats, _noLevelUps ? 0 : points);
    }

    /// <summary>Why the weapons fail, or null: wieldable together within the points, hurting every boss.</summary>
    private string? WeaponProblem(List<Weapon> weapons, string label, IReadOnlyList<Boss> bosses)
    {
        var (stats, points) = Build(label);
        var needed = Combat.PointsToWield(weapons, stats, _twoHanding);
        if (needed > points)
        {
            var names = string.Join(" and ", weapons.Select(w => w.Name));
            return $"{names} need{(weapons.Count == 1 ? "s" : "")} {needed} attribute points; the build leaves {points}";
        }

        foreach (var weapon in weapons)
        {
            if (bosses.FirstOrDefault(b => !Combat.Damages(weapon, b)) is { } immune)
            {
                return $"{weapon.Name} cannot damage {immune.Name}";
            }
        }

        return null;
    }

    /// <summary>
    /// What the player can hold in a reach: pickups and purchases there, and the class's kit, which is picked up in the
    /// Asylum before any boss.
    /// </summary>
    private HashSet<string> Held(Constraints c, Reach r)
    {
        var items = SetOf(_kit);
        foreach (var location in _world.Locations)
        {
            if (!c.Locations.Contains(location) && r.Regions.Contains(location.Region)) items.Add(location.Item);
        }

        return items;
    }

    /// <summary>Things to fight with among the items: melee weapons, and each catalyst held with each spell held.</summary>
    private List<Weapon> Armory(HashSet<string> items, bool spells)
    {
        var weapons = items.Select(_world.Weapons.GetValueOrDefault).OfType<Weapon>().ToList();
        var known = spells
            ? _world.Spells.Values.Where(s => items.Contains(s.Item) || items.Contains(s.Name)).ToList()
            : [];
        return weapons.Where(Combat.IsMeleeWeapon)
            .Concat(weapons.SelectMany(catalyst => known.Select(s => Combat.SpellKit(s, catalyst)).OfType<Weapon>()))
            .ToList();
    }

    private void Restrict(string id, ResultBuilder result, string label, (Milestone From, Milestone Until)? chapter = null)
    {
        _activeRestrictions.Add(id);
        var restriction = Restrictions.Find(id) ?? throw new InvalidOrderException($"{label}: unknown restriction \"{id}\"");
        if (restriction.Effect == RestrictionEffect.OneHanded) _twoHanding = false;
        if (restriction.Effect == RestrictionEffect.NoLevelUps) _noLevelUps = true;
        if (restriction.Effect != RestrictionEffect.NoRings) return;
        if (chapter is { } stretch)
        {
            _chapterExceptions.Add(new ChapterException(result, stretch.From, stretch.Until));
        }
        else
        {
            _exceptionOrders.Add(new ExceptionOrder(result, () => RingLocations().ToList()));
        }
    }

    private IEnumerable<Location> RingLocations() => _world.Locations.Where(l => l.Kind == "ring");

    private void ReadOrder(int index, OrderInstance order)
    {
        var template = order.Template;
        var args = order.Args;
        var label = $"order {index} ({template.Id})";
        if (template.ValidationIn(_setup.Mode) is not { } validation)
        {
            throw new InvalidOrderException($"{label} does not exist in {_setup.Mode.ToString().ToLowerInvariant()} mode");
        }

        var result = new ResultBuilder(template.Id);
        _results.Add(result);

        switch (template.Id)
        {
            case "forbidden-area":
                _constraints.Regions.UnionWith(AreaRegions(StringArg(args, "area", label), label));
                break;
            case "boss-before-bell":
                ReadBossBeforeBell(args, label);
                break;
            case "lord-order":
                ReadLordOrder(args, label);
                break;
            case "nothing-from-the-ground":
                ReadNothingFromTheGround(args, label, result);
                break;
            case "closed-merchant":
                ReadClosedMerchant(args, label, result);
                break;
            case "first-weapon-of-area":
                ReadFirstWeaponOfArea(template.Id, args, label);
                break;
            case "assigned-weapon":
                ReadAssignedWeapon(template.Id, args, label);
                break;

            // Worst case: the player chooses the boss order, so every restriction on the list may apply from the
            // start. Checking them all at once never accepts an impossible list (it may refuse a possible one).
            case "accumulated-curse":
                foreach (var id in ListArg(args, "restrictions", label)) Restrict(id, result, label);
                break;
            case "chapter-restriction":
                Restrict(StringArg(args, "restriction", label), result, label, (MilestoneArg(args, "from", label), MilestoneArg(args, "until", label)));
                break;

            // Worst case: the player may never earn a point.
            case "earned-levels":
                _noLevelUps = true;
                break;
            case "phase-swap":
                ReadPhaseSwap(template.Id, args, label);
                break;
            case "exploit-weakness":
            case "against-the-grain":
                ReadElementFight(template.Id, args, label);
                break;
            case "lizard-hunt":
            case "every-chest":
                ReadEveryPlace(template.Id, args, label);
                break;
            case "errand":
                ReadErrand(args, label);
                break;
            case "one-bonfire":
                ReadOneBonfire(args, label, result, validation);
                break;
            case "the-other-way":
                ReadTheOtherWay(args, label);
                break;
            default:
                result.Support = validation == Validation.WeightOnly ? Support.WeightOnly : Support.Pending;
                break;
        }
    }

    private void ReadBossBeforeBell(OrderArgs args, string label)
    {
        var boss = BossArg(args, label);
        var bells = SetOf(Validator.Bells);
        _checks.Add(c => Run(c, bells).Items.Contains(boss.DefeatedItem) ? null : $"{boss.Name} cannot be defeated before a bell");
    }

    private void ReadLordOrder(OrderArgs args, string label)
    {
        var order = LordSoulOrder(args, label);
        _checks.Add(c =>
        {
            for (var k = 0; k < order.Count; k++)
            {
                var later = order.Skip(k + 1).ToList();
                if (!Run(c, SetOf(later)).Items.Contains(order[k]))
                {
                    return $"{order[k]} cannot be obtained before {string.Join(", ", later)}";
                }
            }

            return null;
        });
    }

    private void ReadNothingFromTheGround(OrderArgs args, string label, ResultBuilder result)
    {
        var regions = AreaRegions(StringArg(args, "area", label), label);

        // Without the found flag, a required pickup could be missed and an impossible order pass.
        if (_world.Locations.All(l => l.Found is not null))
        {
            _exceptionOrders.Add(new ExceptionOrder(result, () =>
                _world.Locations.Where(l => l.Found == true && regions.Contains(l.Region)).ToList()));
        }
        else
        {
            result.Support = Support.Pending;
        }
    }

    private void ReadClosedMerchant(OrderArgs args, string label, ResultBuilder result)
    {
        var merchant = _world.Merchants.GetValueOrDefault(StringArg(args, "merchant", label))
            ?? throw new InvalidOrderException($"{label}: unknown merchant");
        _closedMerchants.Add(merchant.Id);

        // A shop region is closed when every merchant selling there is closed.
        bool IsClosed(string region) =>
            _world.Merchants.Values.All(m => !m.Regions.Contains(region) || _closedMerchants.Contains(m.Id));

        _exceptionOrders.Add(new ExceptionOrder(result, () => _world.Locations
            .Where(l => Shop.Contains(l.Category) && merchant.Regions.Contains(l.Region) && IsClosed(l.Region))
            .ToList()));
    }

    /// <summary>Worst case: whichever weapon the player picks up first in the area must do for the stretch.</summary>
    private void ReadFirstWeaponOfArea(string id, OrderArgs args, string label)
    {
        var area = StringArg(args, "area", label);
        var regions = AreaRegions(area, label);
        var until = MilestoneArg(args, "until", label);
        Build(label);
        List<Weapon> AreaWeapons(Constraints c) => _world.Locations
            .Where(l => l.Found == true && regions.Contains(l.Region) && !c.Locations.Contains(l))
            .Select(l => _world.Weapons.GetValueOrDefault(l.Item))
            .OfType<Weapon>()
            .Where(Combat.IsMeleeWeapon)
            .ToList();

        _weaponPhases.Add(new WeaponPhase(id, r => regions.Any(r.Regions.Contains), until, AreaWeapons));
        _checks.Add(c =>
        {
            var before = Run(c, SetOf(until.Requires.Items()));
            if (!regions.Any(before.Regions.Contains)) return $"{area} cannot be entered before {until.Name}";
            var weapons = AreaWeapons(c);
            if (weapons.Count == 0) return $"there is no weapon to find in {area}";
            Requirement enterArea = new Requirement.Any(regions.Select(r => (Requirement)new Requirement.Region(r)).ToList());
            var beforeArea = BossesRequiredFor(c, $"area:{area}", enterArea).ToHashSet();
            var stretch = BossesRequiredFor(c, $"milestone:{until.Id}", until.Requires).Where(b => !beforeArea.Contains(b)).ToList();
            foreach (var weapon in weapons)
            {
                if (WeaponProblem([weapon], label, stretch) is { } problem)
                {
                    return $"{problem} (found in {area}, used until {until.Name})";
                }
            }

            return null;
        });
    }

    /// <summary>Existence: the named weapon can be taken before the stretch ends and does for it.</summary>
    private void ReadAssignedWeapon(string id, OrderArgs args, string label)
    {
        var from = MilestoneArg(args, "from", label);
        var until = MilestoneArg(args, "until", label);
        var name = StringArg(args, "location", label);
        var location = _world.Locations.FirstOrDefault(l => l.Name == name)
            ?? throw new InvalidOrderException($"{label}: unknown location \"{name}\"");
        if (_world.Weapons.GetValueOrDefault(location.Item) is not { } weapon || !Combat.IsMeleeWeapon(weapon))
        {
            throw new InvalidOrderException($"{label}: \"{name}\" does not hold a melee weapon");
        }

        Build(label);
        _weaponPhases.Add(new WeaponPhase(id, r => r.Satisfies(from.Requires), until, _ => [weapon]));
        _checks.Add(c =>
        {
            var done = BossesRequiredFor(c, $"milestone:{from.Id}", from.Requires).ToHashSet();
            var stretch = BossesRequiredFor(c, $"milestone:{until.Id}", until.Requires).Where(b => !done.Contains(b)).ToList();

            // Taken without defeating any boss of the stretch: it is the weapon for all of them.
            var before = Run(c, SetOf(until.Requires.Items().Concat(Defeats(stretch))));
            if (c.Locations.Contains(location) || !before.Regions.Contains(location.Region))
            {
                return $"{weapon.Name} at \"{name}\" cannot be taken before the bosses until {until.Name}";
            }

            return WeaponProblem([weapon], label, stretch) is { } problem
                ? $"{problem} (from {from.Name} until {until.Name})"
                : null;
        });
    }

    /// <summary>
    /// Existence: some weapon of each style, taken in time, does for its phase, and one build fits both. A style is a
    /// family of melee weapons or a school of magic (a catalyst and a spell of the school).
    /// </summary>
    private void ReadPhaseSwap(string id, OrderArgs args, string label)
    {
        var milestone = MilestoneArg(args, "milestone", label);
        var before = StringArg(args, "before", label);
        var after = StringArg(args, "after", label);
        foreach (var style in new[] { before, after })
        {
            if (IsSchool(style))
            {
                _schoolStyles.Add(style);
                if (!_world.Spells.Values.Any(s => s.School.IdOf() == style))
                {
                    throw new InvalidOrderException($"{label}: no spells of the school \"{style}\"");
                }
            }
            else if (!_world.Weapons.Values.Any(w => Combat.IsMeleeWeapon(w) && w.Category == style))
            {
                throw new InvalidOrderException($"{label}: no melee weapons of category \"{style}\"");
            }
        }

        Build(label);

        // Its two styles rule your weapon for the whole run; its own check fits them in one build.
        _weaponPhases.Add(new WeaponPhase(id, _ => true, null, _ => []));
        _checks.Add(c =>
        {
            // What the player can hold by then, of the style.
            List<Weapon> Available(Reach r, string style) =>
                Armory(Held(c, r), IsSchool(style)).Where(w => w.Category == style).ToList();

            // The first phase starts after the first boss, fought with the class's kit.
            var start = _world.Milestones.GetValueOrDefault(PhaseSwapStart);
            var done = (start is null ? [] : BossesRequiredFor(c, $"milestone:{start.Id}", start.Requires)).ToHashSet();
            var first = BossesRequiredFor(c, $"milestone:{milestone.Id}", milestone.Requires).Where(b => !done.Contains(b)).ToList();
            var firstSet = first.ToHashSet();
            var second = BossesRequiredFor(c, "goal", new Requirement.Has(_world.Goal))
                .Where(b => !firstSet.Contains(b) && !done.Contains(b))
                .ToList();

            // Each style is taken without defeating any boss of its phase: it is the weapon for all of them.
            var forBefore = SetOf(milestone.Requires.Items().Concat(Defeats(first)));
            var a = Available(Run(c, forBefore), before).Where(w => first.All(b => Combat.Damages(w, b))).ToList();
            var forAfter = SetOf(Defeats(second).Append(_world.Goal));
            var b = Available(Run(c, forAfter), after).Where(w => second.All(boss => Combat.Damages(w, boss))).ToList();
            if (a.Count == 0) return $"no {before} can be taken before {milestone.Name}";
            if (b.Count == 0) return $"no {after} can be taken for after {milestone.Name}";
            var fits = a.Any(x => b.Any(y => WeaponProblem([x, y], label, []) is null));
            return fits ? null : $"no {before} and {after} fit one build";
        });
    }

    /// <summary>
    /// Existence: something that deals the element (a melee weapon, or a spell with its catalyst) can be taken before
    /// the boss falls and fits the build. Thrown items also count for the player, but are left out here: that can only
    /// refuse a possible fight, never accept an impossible one.
    /// </summary>
    private void ReadElementFight(string id, OrderArgs args, string label)
    {
        var boss = BossArg(args, label);
        var elementId = StringArg(args, "element", label);
        var candidates = Combat.Elemental.Where(e => e.IdOf() == elementId).Select(e => (Element?)e).ToList();
        if (candidates.Count == 0) throw new InvalidOrderException($"{label}: unknown element \"{elementId}\"");
        var element = candidates[0]!.Value;
        Build(label);
        _elementFights.Add(new ElementFight(id, boss, element));
        _checks.Add(c =>
        {
            if (boss.Parts.Any(p => p.NoDamage.Contains(element))) return $"{boss.Name} takes no {elementId} damage";
            var items = Held(c, Run(c, SetOf([boss.DefeatedItem])));
            var sources = Armory(items, !_activeRestrictions.Contains("no-magic")).Where(w => w.Damage[element] > 0).ToList();
            if (sources.Count == 0) return $"nothing that deals {elementId} can be taken before {boss.Name}";
            return sources.Any(w => WeaponProblem([w], label, []) is null)
                ? null
                : $"nothing that deals {elementId} against {boss.Name} fits the build";
        });
    }

    /// <summary>Existence: every crystal lizard, or every chest, of the area can be reached before the milestone.</summary>
    private void ReadEveryPlace(string id, OrderArgs args, string label)
    {
        var area = StringArg(args, "area", label);
        var regions = AreaRegions(area, label);
        var until = MilestoneArg(args, "until", label);
        var lizards = id == "lizard-hunt";
        var places = lizards
            ? _world.Locations.Where(l => l.Category == Validator.CrystalLizard && regions.Contains(l.Region)).Select(l => l.Region).ToList()
            : _world.Chests.Where(c => regions.Contains(c.Region)).Select(c => c.Region).ToList();
        if (places.Count == 0)
        {
            throw new InvalidOrderException($"{label}: no {(lizards ? "crystal lizards" : "chests")} in {area}");
        }

        if (!lizards && args.Number("chests") != places.Count)
        {
            throw new InvalidOrderException($"{label}: {area} holds {places.Count} chests");
        }

        _checks.Add(c =>
        {
            var before = Run(c, SetOf(until.Requires.Items()));
            return places.All(before.Regions.Contains)
                ? null
                : $"not every {(lizards ? "crystal lizard" : "chest")} of {area} can be reached before {until.Name}";
        });
    }

    /// <summary>
    /// Existence: the pickup can be reached before the milestone. Only forbidden areas count: the orders that forbid
    /// pickups forbid using them, never taking them.
    /// </summary>
    private void ReadErrand(OrderArgs args, string label)
    {
        var name = StringArg(args, "location", label);
        var location = _world.Locations.FirstOrDefault(l => l.Name == name && l.Found == true)
            ?? throw new InvalidOrderException($"{label}: \"{name}\" is not a corpse or chest pickup");
        var until = MilestoneArg(args, "until", label);
        _checks.Add(c =>
            Run(new Constraints { Regions = c.Regions }, SetOf(until.Requires.Items())).Regions.Contains(location.Region)
                ? null
                : $"{location.Item} cannot be taken before {until.Name}");
    }

    /// <summary>Weight only, except a bonfire that is out or missing for part of the run.</summary>
    private void ReadOneBonfire(OrderArgs args, string label, ResultBuilder result, Validation validation)
    {
        var bonfire = StringArg(args, "bonfire", label);
        result.Support = validation == Validation.WeightOnly ? Support.WeightOnly : Support.Pending;
        if (_world.LocationNamed(bonfire) is { AlwaysLit: false } location)
        {
            foreach (var window in location.Unavailable ?? [])
            {
                _checks.Add(_ => $"{bonfire} cannot be the one bonfire: {window.Why}");
            }
        }
    }

    /// <summary>Existence: the milestone can still be reached without the area.</summary>
    private void ReadTheOtherWay(OrderArgs args, string label)
    {
        var area = StringArg(args, "area", label);
        var regions = AreaRegions(area, label);
        var until = MilestoneArg(args, "until", label);
        _checks.Add(c =>
        {
            var without = new Constraints { Regions = SetOf(c.Regions.Concat(regions)), Locations = c.Locations };
            return Run(without).Satisfies(until.Requires) ? null : $"{until.Name} cannot be reached without entering {area}";
        });
    }

    /// <summary>Orders that contradict each other whatever the world allows.</summary>
    private void AddContradictions()
    {
        var ids = _orders.Select(o => o.Template.Id).ToHashSet(StringComparer.Ordinal);

        // Two orders may choose your weapon only one after the other: one ends before the other can start.
        bool EndsBefore(Constraints c, WeaponPhase a, WeaponPhase b) =>
            a.Until is not null && !b.Starts(Run(c, SetOf(a.Until.Requires.Items())));

        for (var i = 0; i < _weaponPhases.Count; i++)
        {
            var a = _weaponPhases[i];
            foreach (var b in _weaponPhases.Skip(i + 1))
            {
                _checks.Add(c => EndsBefore(c, a, b) || EndsBefore(c, b, a)
                    ? null
                    : $"{a.Id} and {b.Id} would choose your weapon at the same time");
            }
        }

        // Attributes only grow, so one build must wield every weapon the orders may hand you, at any time.
        if (_weaponPhases.Count > 1)
        {
            _checks.Add(c => WeaponProblem(_weaponPhases.SelectMany(p => p.Weapons(c)).ToList(), "weapon orders", []) is { } problem
                ? $"{problem} (every weapon the orders may hand you)"
                : null);
        }

        // One element per fight. And while an order chooses your weapon, it would also have to deal the element: until
        // the validator knows which fights a weapon order covers, the two do not go together.
        for (var i = 0; i < _elementFights.Count; i++)
        {
            var a = _elementFights[i];
            var other = _elementFights.Skip(i + 1).FirstOrDefault(b => b.Boss == a.Boss && b.Element != a.Element);
            if (other is not null)
            {
                _checks.Add(_ => $"{a.Boss.Name} cannot be fought only with {a.Element.IdOf()} and only with {other.Element.IdOf()}");
            }
        }

        if (_weaponPhases.Count > 0 && _elementFights.Count > 0)
        {
            var chooser = _weaponPhases[0];
            var fight = _elementFights[0];
            _checks.Add(_ => $"{chooser.Id} chooses your weapon, and {fight.Id} the element of a fight");
        }

        // Something to do in an area before a milestone, and the same area closed until that milestone.
        string? PlaceOf(OrderInstance o)
        {
            if (o.Args.Text("area") is { } area) return area;
            var location = _world.Locations.FirstOrDefault(l => l.Name == o.Args.Text("location"));
            return location is null ? null : _world.Regions.GetValueOrDefault(location.Region)?.Area;
        }

        foreach (var closed in _orders.Where(o => o.Template.Id == "the-other-way"))
        {
            var errand = _orders.FirstOrDefault(o =>
                ErrandTemplates.Contains(o.Template.Id)
                && PlaceOf(o) == closed.Args.Text("area")
                && o.Args.Text("until") == closed.Args.Text("until"));
            if (errand is not null)
            {
                _checks.Add(_ => $"{errand.Template.Id} sends you into {closed.Args.Text("area")}, which the-other-way closes");
            }
        }

        // Armor picked up must be worn, and nothing picked up may be worn: not both in one area.
        List<string> AreasOf(string id) =>
            _orders.Where(o => o.Template.Id == id).Select(o => o.Args.Text("area")).OfType<string>().ToList();

        var groundAreas = AreasOf("nothing-from-the-ground");
        var wearArea = AreasOf("wear-what-you-find").FirstOrDefault(groundAreas.Contains);
        if (wearArea is not null)
        {
            _checks.Add(_ => $"\"wear-what-you-find\" and \"nothing-from-the-ground\" contradict each other in {wearArea}");
        }

        foreach (var (restriction, template) in Conflicts)
        {
            if (_activeRestrictions.Contains(restriction) && ids.Contains(template))
            {
                _checks.Add(_ => $"the restriction \"{restriction}\" contradicts the order \"{template}\"");
            }
        }

        if (_activeRestrictions.Contains("no-magic") && _schoolStyles.Count > 0)
        {
            var schools = string.Join(", ", _schoolStyles);
            _checks.Add(_ => $"the restriction \"no-magic\" contradicts fighting with {schools}");
        }
    }

    /// <summary>
    /// Every order is about a place the player can still reach once the forbidden areas are closed. The forbidden area
    /// itself is checked against the other forbiddances only: closing it is the order. One reach per distinct forbidden
    /// set, shared with the generator.
    /// </summary>
    private void AddPlacesStayReachable()
    {
        if (!_orders.Any(o => o.Template.Id == "forbidden-area")) return;
        foreach (var (template, args, _) in _orders)
        {
            if (template.Id == "forbidden-area")
            {
                if (args.Text("area") is not { } area) continue;
                var own = SetOf(_world.RegionsInArea(area));
                _checks.Add(c =>
                {
                    var others = c.Regions.Where(id => !own.Contains(id)).ToList();
                    if (others.Count == 0) return null;
                    var place = Validator.UnreachableTarget(_world, args, Reachability.WithoutRegions(_world, others, _startItems).Regions);
                    return place is null ? null : $"{template.Id}: {place} cannot be reached";
                });
                continue;
            }

            _checks.Add(c =>
            {
                if (c.Regions.Count == 0) return null;
                var place = Validator.UnreachableTarget(_world, args, Reachability.WithoutRegions(_world, c.Regions, _startItems).Regions);
                return place is null ? null : $"{template.Id}: {place} cannot be reached";
            });
        }
    }

    /// <summary>
    /// Automatic exceptions, once every other constraint is known. Each candidate location is forbidden in turn; one that
    /// breaks a check stays allowed and goes on the list. Checks only get harder as more is forbidden, so every item on
    /// the list is needed by the final set: the list cannot be shortened. A location two orders cover (a shop shared by
    /// two closed merchants) is decided by the first one.
    /// </summary>
    private void ComputeExceptions()
    {
        if (Failures(_constraints).Count > 0) return;

        var decided = new HashSet<Location>();
        foreach (var (result, candidates) in _exceptionOrders)
        {
            var pickups = candidates().Where(l => !decided.Contains(l)).ToList();
            decided.UnionWith(pickups);
            _constraints.Locations.UnionWith(pickups);
            if (Failures(_constraints).Count == 0) continue;
            _constraints.Locations.ExceptWith(pickups);
            foreach (var location in pickups)
            {
                _constraints.Locations.Add(location);
                if (Failures(_constraints).Count > 0)
                {
                    _constraints.Locations.Remove(location);
                    if (!result.Exceptions.Contains(location.Item)) result.Exceptions.Add(location.Item);
                }
            }
        }

        // The same, for a chapter, from where the chapter starts: the player already holds what can be taken before the
        // chapter's goal, except the rings themselves. Each ring is then forbidden in turn; one without which the goal
        // cannot be reached is an exception. So the list holds only what the chapter itself needs: the Kiln's chapter needs
        // no ring, though the run as a whole needs two.
        foreach (var (result, from, until) in _chapterExceptions)
        {
            var pickups = RingLocations().Where(l => !_constraints.Locations.Contains(l)).ToList();
            var rings = pickups.Select(l => l.Item).ToHashSet(StringComparer.Ordinal);
            var behind = MilestonesBehind(from);
            var done = behind.SelectMany(m => BossesRequiredFor(_constraints, $"milestone:{m.Id}", m.Requires)).ToHashSet();
            var bossesAhead = BossesRequiredFor(_constraints, $"milestone:{until.Id}", until.Requires).Where(b => !done.Contains(b));
            var stillAhead = SetOf(until.Requires.Items().Except(behind.SelectMany(m => m.Requires.Items()), StringComparer.Ordinal).Concat(Defeats(bossesAhead)));
            var atChapterStart = Run(_constraints, stillAhead).Items.Where(i => !rings.Contains(i)).ToList();
            var forbidden = _constraints.Locations.Concat(pickups).ToHashSet();
            bool ReachesGoal() => Reachability.Walk(_world, new ReachOptions
            {
                Items = atChapterStart,
                ForbiddenRegions = _constraints.Regions,
                ForbiddenLocations = forbidden,
            }).Satisfies(until.Requires);

            if (ReachesGoal()) continue;
            forbidden.ExceptWith(pickups);
            foreach (var location in pickups)
            {
                forbidden.Add(location);
                if (!ReachesGoal())
                {
                    forbidden.Remove(location);
                    if (!result.Exceptions.Contains(location.Item)) result.Exceptions.Add(location.Item);
                }
            }
        }
    }

    /// <summary>
    /// The milestones a chapter starting at this one has behind it. Each Lord Soul's milestone holds only its own soul, so
    /// the souls placed before it come from the journey's order of the Lords.
    /// </summary>
    private List<Milestone> MilestonesBehind(Milestone from)
    {
        var order = _orders.FirstOrDefault(o => o.Template.Id == "lord-order")?.Args.List("order");
        if (from.Kind != "lord-souls" || order is null) return [from];
        var placed = order.TakeWhile(soul => !from.Requires.Items().Contains(soul)).ToHashSet(StringComparer.Ordinal);
        return _world.Milestones.Values
            .Where(m => m == from || (m.Kind == "lord-souls" && m.Requires.Items().Any(placed.Contains)))
            .ToList();
    }

    private static IEnumerable<string> Defeats(IEnumerable<Boss> bosses) => bosses.Select(b => b.DefeatedItem);

    private static bool IsSchool(string style) => Combat.Schools.Any(s => s.IdOf() == style);

    private static string StringArg(OrderArgs args, string name, string label) =>
        args.Text(name) ?? throw new InvalidOrderException($"{label}: \"{name}\" must be an id");

    private static IReadOnlyList<string> ListArg(OrderArgs args, string name, string label) =>
        args.List(name) is { Count: > 0 } list
            ? list
            : throw new InvalidOrderException($"{label}: \"{name}\" must be a non-empty list");

    private Boss BossArg(OrderArgs args, string label) =>
        _world.Bosses.GetValueOrDefault(StringArg(args, "boss", label))
            ?? throw new InvalidOrderException($"{label}: unknown boss");

    private Milestone MilestoneArg(OrderArgs args, string name, string label)
    {
        var id = StringArg(args, name, label);
        return _world.Milestones.GetValueOrDefault(id)
            ?? throw new InvalidOrderException($"{label}: unknown milestone \"{id}\"");
    }

    private HashSet<string> AreaRegions(string area, string label)
    {
        var ids = _world.Regions.Values.Where(r => r.Area == area).Select(r => r.Id).ToHashSet(StringComparer.Ordinal);
        return ids.Count > 0 ? ids : throw new InvalidOrderException($"{label}: unknown area \"{area}\"");
    }

    /// <summary>The order argument must name every Lord Soul of the graph exactly once.</summary>
    private IReadOnlyList<string> LordSoulOrder(OrderArgs args, string label)
    {
        var souls = _world.Locations.Where(l => l.Category == "LORD_SOUL").Select(l => l.Item).Distinct(StringComparer.Ordinal).ToList();
        var value = args.List("order");
        if (value is null
            || value.Count != souls.Count
            || value.Distinct(StringComparer.Ordinal).Count() != value.Count
            || !value.All(souls.Contains))
        {
            throw new InvalidOrderException($"{label}: \"order\" must list each Lord Soul once: {string.Join(", ", souls)}");
        }

        return value;
    }
}
