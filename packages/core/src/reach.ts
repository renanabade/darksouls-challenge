import { evaluate, type RequirementContext } from "./requirement.js";
import type { World } from "./world.js";

export interface ReachOptions {
  /** What the player already holds at the start (a starting gift, for example). */
  readonly items?: Iterable<string>;
  /** Items the player never takes, milestones included ("Taurus Demon Defeated" = never kill Taurus). */
  readonly forbiddenItems?: ReadonlySet<string>;
  /** Regions the player never enters. */
  readonly forbiddenRegions?: ReadonlySet<string>;
}

export interface Reach {
  readonly regions: ReadonlySet<string>;
  readonly items: ReadonlySet<string>;
}

/**
 * Everything the player can reach from the start, by fixed point: cross every entrance whose
 * requirement holds, take every item in the regions reached, and repeat until nothing changes.
 * Each round only adds, so the loop ends after at most one round per region.
 *
 * Every entrance is re-checked each round. A worklist that re-checks only the entrances touched by
 * what changed would be faster; with ~150 regions the simple loop is enough until profiling says otherwise.
 */
export function reach(world: World, options: ReachOptions = {}): Reach {
  const forbiddenItems = options.forbiddenItems ?? new Set<string>();
  const forbiddenRegions = options.forbiddenRegions ?? new Set<string>();

  const itemsByRegion = new Map<string, string[]>();
  for (const { region, item } of world.locations) {
    const items = itemsByRegion.get(region);
    if (items === undefined) itemsByRegion.set(region, [item]);
    else items.push(item);
  }

  const regions = new Set<string>();
  const items = new Set<string>();
  const take = (item: string): void => {
    if (!forbiddenItems.has(item)) items.add(item);
  };
  const enter = (region: string): boolean => {
    if (regions.has(region) || forbiddenRegions.has(region)) return false;
    regions.add(region);
    itemsByRegion.get(region)?.forEach(take);
    return true;
  };

  for (const item of options.items ?? []) take(item);
  enter(world.start);

  const context: RequirementContext = {
    has: (item) => items.has(item),
    reached: (region) => regions.has(region),
  };
  for (let changed = true; changed;) {
    changed = false;
    for (const e of world.entrances) {
      if (regions.has(e.from) && !regions.has(e.to) && evaluate(e.requires, context)) {
        changed = enter(e.to) || changed;
      }
    }
  }
  return { regions, items };
}
