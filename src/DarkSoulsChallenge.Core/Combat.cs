namespace DarkSoulsChallenge.Core;

/// <summary>A character's attributes, or what a weapon or a spell asks of them.</summary>
public readonly record struct Stats(int Strength, int Dexterity, int Intelligence, int Faith, int Attunement);

public enum Element
{
    Physical,
    Magic,
    Fire,
    Thunder,
}

public enum School
{
    Miracle,
    Pyromancy,
    Sorcery,
}

/// <summary>An amount per damage element.</summary>
public readonly record struct ElementValues(double Physical, double Magic, double Fire, double Thunder)
{
    public double this[Element element] => element switch
    {
        Element.Physical => Physical,
        Element.Magic => Magic,
        Element.Fire => Fire,
        Element.Thunder => Thunder,
        _ => throw new ArgumentOutOfRangeException(nameof(element)),
    };
}

public sealed record Weapon
{
    public required int Id { get; init; }

    public required string Name { get; init; }

    public required string Category { get; init; }

    public required bool Melee { get; init; }

    /// <summary>Can be held with both hands (Strength then counts 1.5 times for requirements).</summary>
    public required bool TwoHandable { get; init; }

    public required Stats Requirements { get; init; }

    /// <summary>Base damage per element at +0.</summary>
    public required ElementValues Damage { get; init; }

    /// <summary>The schools of magic it casts, if it is a catalyst, a talisman or a pyromancy flame.</summary>
    public required IReadOnlyList<School> Casts { get; init; }
}

public sealed record Spell
{
    public required string Name { get; init; }

    /// <summary>The name the item has in the world ("Sorcery: Soul Arrow").</summary>
    public required string Item { get; init; }

    public required School School { get; init; }

    public required int Intelligence { get; init; }

    public required int Faith { get; init; }

    /// <summary>Attunement slots it takes.</summary>
    public required int Slots { get; init; }

    public required ElementValues Damage { get; init; }
}

public sealed record StartingClass
{
    public required string Name { get; init; }

    /// <summary>Soul level at the start.</summary>
    public required int Level { get; init; }

    public required Stats Stats { get; init; }

    /// <summary>What the class starts with: its equipment and its spells, by name.</summary>
    public required IReadOnlyList<string> Kit { get; init; }

    /// <summary>The items the class starts with (the Thief's Master Key), by name: they open the graph like a gift.</summary>
    public required IReadOnlyList<string> Items { get; init; }
}

public sealed record BossPart
{
    /// <summary>Elements that deal this part no damage at all.</summary>
    public required IReadOnlyList<Element> NoDamage { get; init; }

    /// <summary>Flat defense per element: the higher, the less of it gets through.</summary>
    public ElementValues? Defense { get; init; }
}

/// <summary>Bosses are compared by identity: each one exists once in a world.</summary>
public sealed class Boss
{
    public required string Id { get; init; }

    public required string Name { get; init; }

    public required string Region { get; init; }

    /// <summary>
    /// The graph item for this boss's death: the BOSS location of its region. Matched by region, not by name,
    /// because the names can differ between sources.
    /// </summary>
    public required string DefeatedItem { get; init; }

    public required IReadOnlyList<BossPart> Parts { get; init; }
}

/// <summary>
/// Character builds: whether a weapon can be wielded within a level cap, and whether it hurts a boss.
/// </summary>
public static class Combat
{
    /// <summary>Attunement a character needs for one spell slot.</summary>
    public const int AttunementForOneSlot = 10;

    /// <summary>The elements besides physical damage.</summary>
    public static IReadOnlyList<Element> Elemental { get; } = [Element.Magic, Element.Fire, Element.Thunder];

    /// <summary>In the order the data set and the challenges rely on.</summary>
    public static IReadOnlyList<School> Schools { get; } = [School.Miracle, School.Pyromancy, School.Sorcery];

    private static readonly HashSet<string> NotAWeapon = new(StringComparer.Ordinal)
    {
        "shield",
        "catalyst/talisman/flame",
        "bow",
        "crossbow",
        "arrow",
        "bolt",
    };

    /// <summary>The id used in the data set and in order arguments.</summary>
    public static string IdOf(this Element element) => element switch
    {
        Element.Physical => "phys",
        Element.Magic => "magic",
        Element.Fire => "fire",
        Element.Thunder => "thunder",
        _ => throw new ArgumentOutOfRangeException(nameof(element)),
    };

    /// <summary>The id used in the data set and in order arguments.</summary>
    public static string IdOf(this School school) => school switch
    {
        School.Miracle => "miracle",
        School.Pyromancy => "pyromancy",
        School.Sorcery => "sorcery",
        _ => throw new ArgumentOutOfRangeException(nameof(school)),
    };

    /// <summary>Weapons that can be "your weapon": melee, and not a shield, a catalyst or ammunition.</summary>
    public static bool IsMeleeWeapon(Weapon weapon)
    {
        ArgumentNullException.ThrowIfNull(weapon);
        return weapon.Melee && !NotAWeapon.Contains(weapon.Category);
    }

    /// <summary>
    /// Strength a character needs to meet a requirement. With both hands, Strength counts 1.5 times, rounded
    /// down: the least s with floor(1.5 s) >= r is ceil(2r / 3).
    /// </summary>
    public static int StrengthNeeded(int requirement, bool twoHanded) =>
        twoHanded ? (int)Math.Ceiling(2.0 * requirement / 3) : requirement;

    /// <summary>
    /// Attribute points a character must still spend to wield every one of the weapons (one build for all of
    /// them: attributes only grow, so each needs its highest requirement). Each weapon is held with both hands
    /// when that needs less Strength, unless <paramref name="twoHanding"/> is off.
    /// </summary>
    public static int PointsToWield(IReadOnlyCollection<Weapon> weapons, Stats stats, bool twoHanding = true)
    {
        ArgumentNullException.ThrowIfNull(weapons);
        int Lacking(Func<Weapon, int> need, int have) =>
            Math.Max(0, weapons.Select(need).DefaultIfEmpty(0).Max() - have);

        return Lacking(w => StrengthNeeded(w.Requirements.Strength, twoHanding && w.TwoHandable), stats.Strength)
            + Lacking(w => w.Requirements.Dexterity, stats.Dexterity)
            + Lacking(w => w.Requirements.Intelligence, stats.Intelligence)
            + Lacking(w => w.Requirements.Faith, stats.Faith)
            + Lacking(w => w.Requirements.Attunement, stats.Attunement);
    }

    /// <summary>
    /// A boss's defense against each element that hurts every part of it (the mean over its parts), weakest
    /// first. Empty when the data set has no defenses for it.
    /// </summary>
    public static IReadOnlyList<(Element Element, double Defense)> ElementalDefenses(Boss boss)
    {
        ArgumentNullException.ThrowIfNull(boss);
        if (boss.Parts.Count == 0 || boss.Parts.Any(p => p.Defense is null))
        {
            return [];
        }

        return Elemental
            .Where(e => boss.Parts.All(p => !p.NoDamage.Contains(e)))
            .Select(e => (Element: e, Defense: boss.Parts.Sum(p => p.Defense!.Value[e]) / boss.Parts.Count))
            .OrderBy(d => d.Defense)
            .ToList();
    }

    /// <summary>True when the weapon hurts every part of the boss: some element of its damage is not nullified there.</summary>
    public static bool Damages(Weapon weapon, Boss boss)
    {
        ArgumentNullException.ThrowIfNull(weapon);
        ArgumentNullException.ThrowIfNull(boss);
        Element[] elements = [Element.Physical, Element.Magic, Element.Fire, Element.Thunder];
        return boss.Parts.All(part => elements.Any(e => weapon.Damage[e] > 0 && !part.NoDamage.Contains(e)));
    }

    /// <summary>
    /// A spell cast with a catalyst, as something to fight with: the requirements of both, the attunement for
    /// one slot, and the spell's damage. Only one-slot spells: the attunement needed for two slots is not
    /// confirmed, and leaving them out can only refuse a possible challenge, never accept an impossible one.
    /// </summary>
    public static Weapon? SpellKit(Spell spell, Weapon catalyst)
    {
        ArgumentNullException.ThrowIfNull(spell);
        ArgumentNullException.ThrowIfNull(catalyst);
        if (spell.Slots != 1 || !catalyst.Casts.Contains(spell.School))
        {
            return null;
        }

        return catalyst with
        {
            Name = $"{spell.Name} (with {catalyst.Name})",
            Category = spell.School.IdOf(),
            Melee = false,
            Requirements = catalyst.Requirements with
            {
                Intelligence = Math.Max(catalyst.Requirements.Intelligence, spell.Intelligence),
                Faith = Math.Max(catalyst.Requirements.Faith, spell.Faith),
                Attunement = AttunementForOneSlot,
            },
            Damage = spell.Damage,
            Casts = [],
        };
    }
}
