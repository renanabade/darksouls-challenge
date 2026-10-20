/**
 * Restrictions some orders hand out (11 accumulated curse, 12 wager, 19 adaptive squeeze). Drawn from
 * restrictions players actually ran in Dark Souls (Team Hitless "World's First" list, 232 DS1 runs, read
 * 2026-10-20); interface-only ones (no HUD, alternate controller) and co-op ones are left out.
 */

/**
 * weightOnly: never makes a run impossible. oneHanded: Strength no longer counts 1.5 times for
 * requirements. noLevelUps: no attribute points. noItemsOfKind: items of that kind cannot be used; the
 * ones the run needs become automatic exceptions.
 */
export type RestrictionEffect =
  | { readonly kind: "weightOnly" }
  | { readonly kind: "oneHanded" }
  | { readonly kind: "noLevelUps" }
  | { readonly kind: "noItemsOfKind"; readonly itemKind: "ring" };

/**
 * How much a restriction changes the game, judged by player profile (docs/07 in the workspace): light
 * barely touches a melee run, medium changes how you fight, heavy is a classic challenge run of its own.
 * Hand-labelled first estimates (Proposto).
 */
export type Tier = "light" | "medium" | "heavy";

export interface Restriction {
  readonly id: string;
  /** Manual text. */
  readonly text: string;
  readonly effect: RestrictionEffect;
  readonly tier: Tier;
}

const weightOnly = { kind: "weightOnly" } as const;

export const restrictions = [
  {
    id: "no-magic",
    text: "Do not cast sorceries, miracles or pyromancies.",
    effect: weightOnly,
    tier: "light",
  },
  { id: "no-upgrades", text: "Do not reinforce your weapons.", effect: weightOnly, tier: "heavy" },
  {
    id: "one-handed",
    text: "Never hold a weapon with both hands.",
    effect: { kind: "oneHanded" },
    tier: "medium",
  },
  {
    id: "no-rings",
    text: "Do not wear rings.",
    effect: { kind: "noItemsOfKind", itemKind: "ring" },
    tier: "light",
  },
  { id: "no-level-ups", text: "Do not level up.", effect: { kind: "noLevelUps" }, tier: "heavy" },
  {
    id: "no-ranged",
    text: "Do not use bows, crossbows or throwing items.",
    effect: weightOnly,
    tier: "light",
  },
  { id: "no-summons", text: "Do not summon help.", effect: weightOnly, tier: "light" },
  {
    id: "no-consumables",
    text: "Do not use consumable items.",
    effect: weightOnly,
    tier: "medium",
  },
  {
    id: "no-buffs",
    text: "Do not buff your weapon or yourself.",
    effect: weightOnly,
    tier: "light",
  },
  { id: "no-estus", text: "Do not drink Estus.", effect: weightOnly, tier: "heavy" },
  { id: "no-rolling", text: "Do not roll.", effect: weightOnly, tier: "heavy" },
  {
    id: "no-shield",
    text: "Do not use a shield, and do not block.",
    effect: weightOnly,
    tier: "medium",
  },
  { id: "no-armor", text: "Do not wear armor.", effect: weightOnly, tier: "medium" },
  // Not among the DS1 runs of the list, but run in other games of the series (No Lock in Bloodborne and Sekiro;
  // No Parry in Demon's Souls, Dark Souls III, Sekiro): variety for players who have done the usual ones.
  { id: "no-lock-on", text: "Do not lock on to enemies.", effect: weightOnly, tier: "medium" },
  { id: "no-parry", text: "Do not parry.", effect: weightOnly, tier: "light" },
] as const satisfies readonly Restriction[];
