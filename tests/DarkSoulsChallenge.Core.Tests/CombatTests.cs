namespace DarkSoulsChallenge.Core.Tests;

public class CombatTests
{
    private static readonly Stats Tens = new(10, 10, 10, 10, 10);

    private static Weapon TestWeapon(Stats requirements = default, ElementValues? damage = null) => new()
    {
        Id = 1,
        Name = "Test Sword",
        Category = "sword",
        Melee = true,
        TwoHandable = true,
        Requirements = requirements,
        Damage = damage ?? new ElementValues(100, 0, 0, 0),
        Casts = [],
    };

    private static Boss BossWithParts(params Element[][] noDamage) => new()
    {
        Id = "b",
        Name = "Boss",
        Region = "r",
        DefeatedItem = "Boss Defeated",
        Parts = noDamage.Select(n => new BossPart { NoDamage = n }).ToList(),
    };

    // Strength counts 1.5 times with both hands, rounded down.
    [Fact]
    public void Lets_27_Strength_two_hand_a_40_Strength_weapon_as_the_game_does()
    {
        Assert.Equal(27, Combat.StrengthNeeded(40, true));
        Assert.True(Math.Floor(26 * 1.5) < 40);
    }

    [Fact]
    public void Rounds_the_effective_Strength_down()
    {
        Assert.Equal(17, Combat.StrengthNeeded(25, true)); // 16 * 1.5 = 24 < 25; 17 * 1.5 = 25.5, so 25
        Assert.Equal(16, Combat.StrengthNeeded(24, true));
        Assert.Equal(24, Combat.StrengthNeeded(24, false));
    }

    [Fact]
    public void Adds_what_each_requirement_lacks() =>
        Assert.Equal(4 + 2, Combat.PointsToWield([TestWeapon(new Stats(10, 14, 12, 9, 0))], Tens));

    [Fact]
    public void Uses_both_hands_when_that_costs_fewer_points()
    {
        var heavy = TestWeapon(new Stats(30, 0, 0, 0, 0));
        Assert.Equal(20 - 10, Combat.PointsToWield([heavy], Tens));
        Assert.Equal(30 - 10, Combat.PointsToWield([heavy with { TwoHandable = false }], Tens));
    }

    [Fact]
    public void Damage_needs_some_element_that_every_part_of_the_boss_takes()
    {
        var magicOnly = TestWeapon(damage: new ElementValues(0, 80, 0, 0));
        Assert.True(Combat.Damages(TestWeapon(), BossWithParts([Element.Fire])));
        Assert.False(Combat.Damages(magicOnly, BossWithParts([Element.Magic])));
        Assert.False(Combat.Damages(magicOnly, BossWithParts([], [Element.Magic])));
    }

    [Fact]
    public void Leaves_out_shields_catalysts_and_ammunition()
    {
        Assert.True(Combat.IsMeleeWeapon(TestWeapon()));
        Assert.False(Combat.IsMeleeWeapon(TestWeapon() with { Category = "shield" }));
        Assert.False(Combat.IsMeleeWeapon(TestWeapon() with { Category = "arrow", Melee = false }));
    }

    private static readonly Weapon Catalyst = TestWeapon(new Stats(6, 0, 10, 0, 0)) with
    {
        Name = "Catalyst",
        Category = "catalyst/talisman/flame",
        Melee = false,
        Casts = [School.Sorcery],
    };

    private static Spell Arrow(School school = School.Sorcery, int slots = 1) => new()
    {
        Name = "Arrow",
        Item = "Sorcery: Arrow",
        School = school,
        Intelligence = 14,
        Faith = 0,
        Slots = slots,
        Damage = new ElementValues(0, 150, 0, 0),
    };

    [Fact]
    public void A_spell_fights_with_its_damage_and_needs_both_requirements_and_one_slot_of_attunement()
    {
        var kit = Combat.SpellKit(Arrow(), Catalyst);
        Assert.NotNull(kit);
        Assert.Equal(150, kit.Damage.Magic);
        Assert.Equal(0, kit.Damage.Physical);
        Assert.Equal(new Stats(6, 0, 14, 0, 10), kit.Requirements);
        Assert.Equal(4 + 2, Combat.PointsToWield([kit], Tens with { Attunement = 8 }));
    }

    [Fact]
    public void A_spell_needs_a_catalyst_of_its_school_and_two_slot_spells_are_left_out()
    {
        Assert.Null(Combat.SpellKit(Arrow(School.Miracle), Catalyst));
        Assert.Null(Combat.SpellKit(Arrow(slots: 2), Catalyst));
    }
}
