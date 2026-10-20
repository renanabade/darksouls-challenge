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

export interface Restriction {
  readonly id: string;
  /** Manual text. */
  readonly text: string;
  readonly effect: RestrictionEffect;
}

const weightOnly = { kind: "weightOnly" } as const;

export const restrictions = [
  { id: "no-magic", text: "Do not cast sorceries, miracles or pyromancies.", effect: weightOnly },
  { id: "no-upgrades", text: "Do not reinforce your weapons.", effect: weightOnly },
  { id: "one-handed", text: "Never hold a weapon with both hands.", effect: { kind: "oneHanded" } },
  {
    id: "no-rings",
    text: "Do not wear rings, except the ones the run requires.",
    effect: { kind: "noItemsOfKind", itemKind: "ring" },
  },
  { id: "no-level-ups", text: "Do not level up.", effect: { kind: "noLevelUps" } },
  { id: "no-ranged", text: "Do not use bows, crossbows or throwing items.", effect: weightOnly },
  { id: "no-summons", text: "Do not summon help.", effect: weightOnly },
  { id: "no-consumables", text: "Do not use consumable items.", effect: weightOnly },
  { id: "no-buffs", text: "Do not buff your weapon or yourself.", effect: weightOnly },
  { id: "no-estus", text: "Do not drink Estus.", effect: weightOnly },
  { id: "no-rolling", text: "Do not roll.", effect: weightOnly },
  { id: "no-shield", text: "Do not use a shield, and do not block.", effect: weightOnly },
  { id: "no-armor", text: "Do not wear armor.", effect: weightOnly },
] as const satisfies readonly Restriction[];
