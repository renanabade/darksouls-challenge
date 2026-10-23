import type { Location } from "./world.js";

/**
 * A bonfire "one bonfire" may name: one with no window in which it is out or missing (issue 38, E11
 * and E12, from the game's scripts in locations.json). The order holds for the whole run in its area, so
 * any window would leave the player no bonfire for part of it. "No bonfire" may still name the area: it
 * never asks the player to rest at one.
 */
export function alwaysLit(bonfire: Location): boolean {
  return (bonfire.unavailable ?? []).length === 0;
}
