using DarkSoulsChallenge.Core.Orders;
using static DarkSoulsChallenge.Core.Tests.Fixtures;

namespace DarkSoulsChallenge.Core.Tests;

public class WeaponOrderTests
{
    private static object Loc(string region, string item, string category = "CORPSE_ITEM", bool found = true) =>
        new { name = $"{region}: {item}", region, item, count = 1, category, mandatory = false, found };

    private static object WeaponRow(int id, string name, int str, int intelligence, int phys, int magic, string category = "sword") => new
    {
        id,
        name,
        category,
        melee = true,
        level = 0,
        hands = new { both = true },
        req = new { str, dex = 0, @int = intelligence, fth = 0 },
        baseDamage = new { phys, magic, fire = 0, thunder = 0 },
    };

    /// <summary>
    /// camp, yard (a Club and a Heavy Axe on corpses), gate (the Brute), keep (a Moon Blade, magic only), crypt (the
    /// Wraith, whom physical damage does not hurt; the goal), throne (a Crown Sword).
    /// </summary>
    private static readonly World Small = WorldParser.Parse(new RawDataSet
    {
        Meta = J(new { start = "camp", goal = "Wraith Defeated" }),
        Regions = J(new[] { ("camp", "camp"), ("yard", "yard"), ("gate", "yard"), ("keep", "keep"), ("crypt", "keep"), ("throne", "throne") }
            .Select(r => new { id = r.Item1, name = r.Item1, area = r.Item2, mandatory = false }).ToArray()),
        Entrances = J(L(
            new { from = "camp", to = "yard", requires = (object)true },
            new { from = "yard", to = "gate", requires = (object)true },
            new { from = "gate", to = "keep", requires = (object)new { has = "Brute Defeated" } },
            new { from = "keep", to = "crypt", requires = (object)true },
            new { from = "crypt", to = "throne", requires = (object)new { has = "Wraith Defeated" } })),
        Locations = J(L(
            Loc("yard", "Club"),
            Loc("yard", "Heavy Axe"),
            Loc("keep", "Moon Blade"),
            Loc("throne", "Crown Sword"),
            Loc("gate", "Brute Defeated", "BOSS", false),
            Loc("crypt", "Wraith Defeated", "BOSS", false))),
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
            new { id = "brute", name = "Brute", region = "gate", parts = L(new { noDamage = L() }) },
            new { id = "wraith", name = "Wraith", region = "crypt", parts = L(new { noDamage = L("phys") }) })),
        Merchants = J(L()),
        Milestones = J(L(
            new { id = "brute-dead", name = "Brute defeated", kind = "boss", requires = new { has = "Brute Defeated" } },
            new { id = "wraith-dead", name = "Wraith defeated", kind = "boss", requires = new { has = "Wraith Defeated" } })),
        Weapons = J(L(
            WeaponRow(1, "Club", 10, 0, 100, 0, "hammer"),
            WeaponRow(2, "Heavy Axe", 30, 0, 150, 0, "axe"), // two-handed: 20 Strength, 8 points for the Knight
            WeaponRow(3, "Moon Blade", 0, 15, 0, 80), // 7 Intelligence points
            WeaponRow(4, "Crown Sword", 0, 0, 0, 120))),
    });

    private static ValidationResult Check(int levelCap, params OrderInstance[] orders) =>
        Validator.Validate(Small, new Setup(Mode.Static, Small.Gifts[0], "Knight", levelCap), orders);

    private static OrderInstance FirstWeapon(string area, string until) =>
        Order("first-weapon-of-area", new() { ["area"] = area, ["until"] = until });

    private static OrderInstance Assigned(string location) =>
        Order("assigned-weapon", new() { ["from"] = "brute-dead", ["until"] = "wraith-dead", ["location"] = location });

    private static OrderInstance Curse(params string[] ids) => Order("accumulated-curse", new() { ["restrictions"] = ids });

    private static OrderInstance Swap(string before, string after) =>
        Order("phase-swap", new() { ["milestone"] = "brute-dead", ["before"] = before, ["after"] = after });

    private static OrderInstance Fight(string id, string boss, string element) =>
        Order(id, new() { ["boss"] = boss, ["element"] = element });

    [Fact]
    public void First_weapon_needs_every_weapon_of_the_area_to_be_wieldable_within_the_level_cap()
    {
        var yard = FirstWeapon("yard", "brute-dead");
        Assert.Equal(
            ["Heavy Axe needs 8 attribute points; the build leaves 5 (found in yard, used until Brute defeated)"],
            Check(10, yard).Problems);
        Assert.Equal(Verdict.Comfortable, Check(13, yard).Verdict);
    }

    [Fact]
    public void First_weapon_needs_every_weapon_to_hurt_the_bosses_of_the_stretch()
    {
        Assert.Equal(Verdict.Comfortable, Check(12, FirstWeapon("keep", "wraith-dead")).Verdict);
        Assert.Contains("cannot damage Wraith", Check(20, FirstWeapon("yard", "wraith-dead")).Problems[0], StringComparison.Ordinal);
    }

    [Fact]
    public void First_weapon_refuses_an_area_with_no_weapon_to_find() =>
        Assert.Equal(["there is no weapon to find in camp"], Check(20, FirstWeapon("camp", "brute-dead")).Problems);

    [Fact]
    public void Assigned_weapon_accepts_a_weapon_taken_before_the_stretch_ends_that_hurts_its_bosses()
    {
        Assert.Equal(Verdict.Comfortable, Check(12, Assigned("keep: Moon Blade")).Verdict);
        Assert.Equal(Verdict.Impossible, Check(11, Assigned("keep: Moon Blade")).Verdict);
    }

    [Fact]
    public void Assigned_weapon_refuses_one_the_bosses_shrug_off_or_one_found_too_late()
    {
        Assert.Contains("Club cannot damage Wraith", Check(20, Assigned("yard: Club")).Problems[0], StringComparison.Ordinal);
        Assert.Equal(
            ["Crown Sword at \"throne: Crown Sword\" cannot be taken before the bosses until Wraith defeated"],
            Check(20, Assigned("throne: Crown Sword")).Problems);
    }

    [Fact]
    public void Assigned_weapon_refuses_to_run_without_a_class_and_a_level_cap() =>
        Assert.Throws<InvalidOrderException>(() =>
            Validator.Validate(Small, new Setup(Mode.Static, Small.Gifts[0]), [Assigned("keep: Moon Blade")]));

    [Fact]
    public void Leaves_no_points_when_levels_must_be_earned()
    {
        var earned = Order("earned-levels", new() { ["condition"] = "x", ["points"] = 1 });
        Assert.Equal(
            ["Heavy Axe needs 8 attribute points; the build leaves 0 (found in yard, used until Brute defeated)"],
            Check(30, FirstWeapon("yard", "brute-dead"), earned).Problems);
    }

    [Fact]
    public void Applies_every_restriction_of_the_curse_from_the_start()
    {
        var yard = FirstWeapon("yard", "brute-dead");

        // One-handed, the Heavy Axe needs 30 Strength: 18 points for the Knight.
        Assert.Equal(Verdict.Comfortable, Check(20, yard, Curse("no-estus")).Verdict);
        Assert.StartsWith("Heavy Axe needs 18 attribute points", Check(20, yard, Curse("no-estus", "one-handed")).Problems[0], StringComparison.Ordinal);
        Assert.Throws<InvalidOrderException>(() => Check(20, Curse("no-such-thing")));
    }

    [Fact]
    public void Lets_two_orders_choose_your_weapon_one_after_the_other_with_one_build_for_all()
    {
        var first = FirstWeapon("yard", "brute-dead");
        var assigned = Assigned("keep: Moon Blade");

        // Heavy Axe (8 Strength points) and Moon Blade (7 Intelligence points): 15 of the Knight's 15.
        Assert.Equal(Verdict.Comfortable, Check(20, first, assigned).Verdict);
        Assert.Equal(
            ["Club and Heavy Axe and Moon Blade need 15 attribute points; the build leaves 14 (every weapon the orders may hand you)"],
            Check(19, first, assigned).Problems);
    }

    [Fact]
    public void Refuses_two_orders_that_choose_your_weapon_at_the_same_time()
    {
        var assigned = Assigned("keep: Moon Blade");
        Assert.Contains(
            "first-weapon-of-area and assigned-weapon would choose your weapon at the same time",
            Check(40, FirstWeapon("yard", "wraith-dead"), assigned).Problems);
        Assert.Contains(
            "phase-swap and assigned-weapon would choose your weapon at the same time",
            Check(40, Swap("hammer", "sword"), assigned).Problems);
    }

    [Fact]
    public void Applies_a_chapter_restriction_to_the_whole_run_the_worst_case()
    {
        var chapter = Order("chapter-restriction", new() { ["from"] = "brute-dead", ["until"] = "wraith-dead", ["restriction"] = "one-handed" });
        Assert.StartsWith("Heavy Axe needs 18 attribute points", Check(20, FirstWeapon("yard", "brute-dead"), chapter).Problems[0], StringComparison.Ordinal);
    }

    [Fact]
    public void Refuses_to_wear_what_you_find_under_a_curse_of_no_armor() =>
        Assert.Equal(
            ["the restriction \"no-armor\" contradicts the order \"wear-what-you-find\""],
            Check(30, Order("wear-what-you-find", new() { ["area"] = "yard" }), Curse("no-armor")).Problems);

    [Fact]
    public void Phase_swap_finds_a_weapon_of_each_style_in_time_that_one_build_can_wield()
    {
        // Club (hammer, yard) until the Brute; Moon Blade (sword, magic) for the Wraith: 7 Intelligence points.
        Assert.Equal(Verdict.Comfortable, Check(12, Swap("hammer", "sword")).Verdict);
        Assert.Equal(["no hammer and sword fit one build"], Check(11, Swap("hammer", "sword")).Problems);
    }

    [Fact]
    public void Phase_swap_needs_the_second_style_to_hurt_the_bosses_after_the_milestone() =>
        Assert.Equal(["no hammer can be taken for after Brute defeated"], Check(30, Swap("axe", "hammer")).Problems);

    [Fact]
    public void Phase_swap_needs_the_first_style_before_the_milestone() =>
        Assert.Equal(["no sword can be taken before Brute defeated"], Check(30, Swap("sword", "hammer")).Problems);

    private static ValidationResult Run(string startingClass, int levelCap, params OrderInstance[] orders) =>
        Validator.Validate(Ds1, new Setup(Mode.Static, NoGift, startingClass, levelCap), orders);

    private static OrderInstance Ds1Swap(string milestone, string before, string after) =>
        Order("phase-swap", new() { ["milestone"] = milestone, ["before"] = before, ["after"] = after });

    // Derived from the data set: a Knight at soul level 30 can wield whatever melee weapon each area offers until the
    // Kiln; a level-1 Pyromancer has no points to spend, and every one needs some.
    [Fact]
    public void Gives_a_first_weapon_of_the_area_that_a_Knight_at_level_30_can_always_use()
    {
        string[] areas =
        [
            "anor-londo", "blighttown", "darkroot-garden", "depths", "firelink-shrine", "new-londo-ruins",
            "painted-world-of-ariamis", "sens-fortress", "the-catacombs", "undead-burg", "undead-parish", "valley-of-drakes",
        ];
        foreach (var area in areas)
        {
            var first = FirstWeapon(area, "kiln-open");
            Assert.Equal(Verdict.Comfortable, Run("Knight", 30, first).Verdict);
            Assert.Equal(Verdict.Impossible, Run("Pyromancer", 1, first).Verdict);
        }
    }

    [Fact]
    public void Excepts_from_no_rings_exactly_the_rings_the_run_needs()
    {
        var result = Run("Knight", 30, Curse("no-rings", "no-estus"));
        Assert.Equal(Verdict.Comfortable, result.Verdict);
        Assert.Equal(["Covenant of Artorias", "Orange Charred Ring"], result.Orders[0].Exceptions);
    }

    [Fact]
    public void Excepts_from_a_chapters_no_rings_only_the_rings_that_chapter_needs()
    {
        static OrderInstance Chapter(string from, string until) =>
            Order("chapter-restriction", new() { ["from"] = from, ["until"] = until, ["restriction"] = "no-rings" });

        var early = Run("Knight", 30, Chapter("boss-asylum-demon", "bell-undead-parish"));
        Assert.Equal(Verdict.Comfortable, early.Verdict);
        Assert.Empty(early.Orders[0].Exceptions);
        var late = Run("Knight", 30, Chapter("lordvessel-placed", "kiln-open"));
        Assert.Equal(["Covenant of Artorias", "Orange Charred Ring"], late.Orders[0].Exceptions);
    }

    // From the chapter's start, not the run's: what lies behind the player is not what the chapter needs.
    [Theory]
    [InlineData("kiln-open", "boss-gwyn-lord-of-cinder")]
    [InlineData("boss-asylum-demon", "bell-undead-parish")]
    public void Excepts_no_ring_in_a_chapter_that_needs_none(string from, string until)
    {
        var chapter = Order("chapter-restriction", new() { ["from"] = from, ["until"] = until, ["restriction"] = "no-rings" });
        var result = Run("Knight", 30, chapter);
        Assert.Equal(Verdict.Comfortable, result.Verdict);
        Assert.Empty(result.Orders[0].Exceptions);
    }

    [Theory]
    [InlineData("lordvessel-placed", "lord-souls-placed-3", "Covenant of Artorias")] // the Four Kings, in the Abyss
    [InlineData("lordvessel-placed", "lord-souls-placed-2", "Orange Charred Ring")] // the Bed of Chaos, past the lava
    public void Excepts_only_the_ring_a_chapters_own_goal_needs(string from, string until, string ring)
    {
        var chapter = Order("chapter-restriction", new() { ["from"] = from, ["until"] = until, ["restriction"] = "no-rings" });
        Assert.Equal([ring], Run("Knight", 30, chapter).Orders[0].Exceptions);
    }

    private static OrderInstance Lords() => Order("lord-order", new()
    {
        ["order"] = new[] { "Lord Soul (Nito)", "Bequeathed Lord Soul Shard (Seath)", "Bequeathed Lord Soul Shard (Four Kings)", "Lord Soul (Bed of Chaos)" },
    });

    // The Kiln's chapter starts with every soul placed, so it needs no ring, though the run as a whole needs two.
    [Fact]
    public void Excepts_no_ring_in_the_Kilns_chapter()
    {
        var kiln = Order("chapter-restriction", new() { ["from"] = "lord-souls-placed-2", ["until"] = "boss-gwyn-lord-of-cinder", ["restriction"] = "no-rings" });
        var result = Run("Knight", 30, Lords(), kiln);
        Assert.Equal(Verdict.Comfortable, result.Verdict);
        Assert.Empty(result.Orders[1].Exceptions);
    }

    [Fact]
    public void Excepts_the_rings_of_the_souls_still_ahead_by_the_order_of_the_Lords()
    {
        OrderInstance Chapter(string from, string until) => Order("chapter-restriction", new() { ["from"] = from, ["until"] = until, ["restriction"] = "no-rings" });

        // After the Four Kings, only the Bed of Chaos is ahead. Before them, the Covenant is still needed too.
        Assert.Equal(["Orange Charred Ring"], Run("Knight", 30, Lords(), Chapter("lord-souls-placed-3", "lord-souls-placed-2")).Orders[1].Exceptions);
        Assert.Equal(["Covenant of Artorias"], Run("Knight", 30, Lords(), Chapter("lord-souls-placed-4", "lord-souls-placed-3")).Orders[1].Exceptions);
    }

    // Without the order of the Lords, any soul may still be ahead: the worst case.
    [Fact]
    public void Excepts_both_rings_when_the_souls_ahead_are_not_known()
    {
        var chapter = Order("chapter-restriction", new() { ["from"] = "lord-souls-placed-1", ["until"] = "boss-gwyn-lord-of-cinder", ["restriction"] = "no-rings" });
        Assert.Equal(["Covenant of Artorias", "Orange Charred Ring"], Run("Knight", 30, chapter).Orders[0].Exceptions);
    }

    [Fact]
    public void Swaps_fighting_style_at_the_Lordvessel_when_one_build_fits_both()
    {
        var swap = Ds1Swap("lordvessel-obtained", "dagger", "halberd");
        Assert.Equal(Verdict.Comfortable, Run("Knight", 10, swap).Verdict);
        Assert.Equal(["no dagger and halberd fit one build"], Run("Deprived", 6, swap).Problems);
    }

    [Fact]
    public void Lets_a_Sorcerer_start_with_sorceries_the_class_kit_has_a_catalyst_and_Soul_Arrow() =>
        Assert.Equal(Verdict.Comfortable, Run("Sorcerer", 20, Ds1Swap("bell-undead-parish", "sorcery", "sword")).Verdict);

    [Fact]
    public void Needs_attunement_for_a_slot_a_Warrior_has_8_and_spends_2_points_on_it()
    {
        // Soul Arrow with a Sorcerer's Catalyst: Intelligence 10 (the Warrior has 9) and Attunement 10.
        var before = Ds1Swap("bell-undead-parish", "sorcery", "dagger");
        Assert.Equal(["no sorcery and dagger fit one build"], Run("Warrior", 6, before).Problems);
        Assert.Equal(Verdict.Comfortable, Run("Warrior", 7, before).Verdict);
    }

    [Fact]
    public void Refuses_pyromancy_while_Quelaag_whom_fire_does_not_hurt_is_still_to_fight()
    {
        Assert.Equal(Verdict.Comfortable, Run("Pyromancer", 30, Ds1Swap("bell-undead-parish", "pyromancy", "sword")).Verdict);
        Assert.Equal(
            ["no pyromancy can be taken for after Undead Parish bell rung"],
            Run("Pyromancer", 30, Ds1Swap("bell-undead-parish", "sword", "pyromancy")).Problems);
    }

    [Fact]
    public void A_school_of_magic_contradicts_a_curse_of_no_magic() =>
        Assert.Contains(
            "the restriction \"no-magic\" contradicts fighting with sorcery",
            Run("Sorcerer", 30, Ds1Swap("bell-undead-parish", "sorcery", "sword"), Curse("no-magic")).Problems);

    [Fact]
    public void Assigns_the_Undead_Parish_halberd_from_the_Taurus_Demon_to_the_first_bell()
    {
        var halberd = Ds1.Locations.First(l => l.Found == true && l.Item == "Halberd");
        OrderInstance Assign(string from) =>
            Order("assigned-weapon", new() { ["from"] = from, ["until"] = "bell-undead-parish", ["location"] = halberd.Name });

        Assert.Equal(Verdict.Comfortable, Run("Knight", 10, Assign("boss-taurus-demon")).Verdict);
        Assert.Matches(@"^Halberd needs \d+ attribute points", Run("Pyromancer", 1, Assign("boss-taurus-demon")).Problems[0]);

        // The Parish lies past the Taurus Demon: from the Asylum Demon on, the halberd comes too late for him.
        Assert.Contains("cannot be taken before the bosses", Run("Knight", 10, Assign("boss-asylum-demon")).Problems[0], StringComparison.Ordinal);
    }

    [Fact]
    public void Element_fight_needs_something_that_deals_the_element_before_the_boss_falls_within_the_build()
    {
        Assert.Equal(Verdict.Comfortable, Check(12, Fight("exploit-weakness", "wraith", "magic")).Verdict);
        Assert.Equal(["nothing that deals magic against Wraith fits the build"], Check(11, Fight("exploit-weakness", "wraith", "magic")).Problems);

        // The Moon Blade lies past the Brute.
        Assert.Equal(["nothing that deals magic can be taken before Brute"], Check(20, Fight("against-the-grain", "brute", "magic")).Problems);
        Assert.Equal(Verdict.Impossible, Check(20, Fight("against-the-grain", "wraith", "fire")).Verdict);
    }

    [Fact]
    public void Refuses_two_elements_for_one_fight_and_an_element_while_an_order_chooses_your_weapon()
    {
        Assert.Contains(
            "Wraith cannot be fought only with magic and only with fire",
            Check(20, Fight("exploit-weakness", "wraith", "magic"), Fight("against-the-grain", "wraith", "fire")).Problems);
        Assert.Equal(
            ["assigned-weapon chooses your weapon, and exploit-weakness the element of a fight"],
            Check(20, Assigned("keep: Moon Blade"), Fight("exploit-weakness", "wraith", "magic")).Problems);
    }
}
