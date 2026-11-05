namespace DarkSoulsChallenge.Core.Orders;

/// <summary>
/// WeightOnly never makes a run impossible. OneHanded: Strength no longer counts 1.5 times for requirements.
/// NoLevelUps: no attribute points. NoRings: rings cannot be used; the ones the run needs become automatic exceptions.
/// </summary>
public enum RestrictionEffect
{
    WeightOnly,
    OneHanded,
    NoLevelUps,
    NoRings,
}

/// <summary>
/// How much a restriction changes the game, judged by player profile: light barely touches a melee run, medium
/// changes how you fight, heavy is a classic challenge run of its own. Hand-labelled first estimates.
/// </summary>
public enum Tier
{
    Light,
    Medium,
    Heavy,
}

public sealed record Restriction(string Id, string Text, RestrictionEffect Effect, Tier Tier);

/// <summary>
/// Restrictions some orders hand out (accumulated curse, wager, adaptive squeeze). Drawn from restrictions players
/// actually ran in Dark Souls; interface-only ones (no HUD, alternate controller) and co-op ones are left out.
/// </summary>
public static class Restrictions
{
    public static IReadOnlyList<Restriction> All { get; } =
    [
        new("no-magic", "Do not cast sorceries, miracles or pyromancies.", RestrictionEffect.WeightOnly, Tier.Light),
        new("no-upgrades", "Do not reinforce your weapons.", RestrictionEffect.WeightOnly, Tier.Heavy),
        new("one-handed", "Never hold a weapon with both hands.", RestrictionEffect.OneHanded, Tier.Medium),
        new("no-rings", "Do not wear rings.", RestrictionEffect.NoRings, Tier.Light),
        new("no-level-ups", "Do not level up.", RestrictionEffect.NoLevelUps, Tier.Heavy),
        new("no-ranged", "Do not use bows, crossbows or throwing items.", RestrictionEffect.WeightOnly, Tier.Light),
        new("no-summons", "Do not summon help.", RestrictionEffect.WeightOnly, Tier.Light),
        new("no-consumables", "Do not use consumable items.", RestrictionEffect.WeightOnly, Tier.Medium),
        new("no-buffs", "Do not buff your weapon or yourself.", RestrictionEffect.WeightOnly, Tier.Light),
        new("no-estus", "Do not drink Estus.", RestrictionEffect.WeightOnly, Tier.Heavy),
        new("no-rolling", "Do not roll.", RestrictionEffect.WeightOnly, Tier.Heavy),
        new("no-shield", "Do not use a shield, and do not block.", RestrictionEffect.WeightOnly, Tier.Medium),
        new("no-armor", "Do not wear armor.", RestrictionEffect.WeightOnly, Tier.Medium),

        // Not among the DS1 runs of the list, but run in other games of the series: variety for players who have
        // done the usual ones.
        new("no-lock-on", "Do not lock on to enemies.", RestrictionEffect.WeightOnly, Tier.Medium),
        new("no-parry", "Do not parry.", RestrictionEffect.WeightOnly, Tier.Light),
    ];

    public static Restriction? Find(string id) => All.FirstOrDefault(r => r.Id == id);
}
