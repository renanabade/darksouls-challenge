/**
 * Bonfires "one bonfire" must not name until their availability is modeled (issue 38, E11 and E12).
 * E11: the Firelink Shrine bonfire goes out after both bells, until Lautrec dies (flags 812 and 813,
 * flag 11500200). E12: the first Anor Londo bonfire, the Darkmoon Knightess's (object 1511960), goes out
 * with her (m15_01_00_00 Event_151). "No bonfire" still allows these areas: it never asks the player to
 * rest at one of them.
 */
export const UNMODELED_BONFIRES: ReadonlySet<string> = new Set([
  "FS: Firelink Shrine Bonfire",
  "AL: Anor Londo Bonfire",
]);
