import { evaluate, type RequirementContext } from "./requirement.js";
import type { Entrance, Location, World } from "./world.js";

export interface ReachOptions {
  /** What the player already holds at the start (a starting gift, for example). */
  readonly items?: Iterable<string>;
  /** Items the player never takes, milestones included ("Taurus Demon Defeated" = never kill Taurus). */
  readonly forbiddenItems?: ReadonlySet<string>;
  /** Regions the player never enters. */
  readonly forbiddenRegions?: ReadonlySet<string>;
  /** Locations the player never takes from, while the same item elsewhere is still allowed. */
  readonly forbiddenLocations?: ReadonlySet<Location>;
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
  const forbiddenLocations = options.forbiddenLocations ?? new Set<Location>();

  const itemsByRegion = new Map<string, string[]>();
  for (const location of world.locations) {
    if (forbiddenLocations.has(location)) continue;
    const items = itemsByRegion.get(location.region);
    if (items === undefined) itemsByRegion.set(location.region, [location.item]);
    else items.push(location.item);
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
  // An entrance that must be crossed before an item is held: the player can cross it when it is open in
  // the world without that item. Every state of the walk is one the player reaches with what it holds, so
  // an entrance open while the item is not yet taken is crossable; only otherwise is the world without
  // the item walked, once per item. An item held from the start closes the entrance from the start.
  // Each entrance is judged on its own item: two entrances with different items are not asked to be
  // crossed in one order (ADR 0011).
  const held = new Set(options.items ?? []);
  const without = new Map<string, Reach>();
  const crossableBefore = (e: Entrance): boolean => {
    if (e.before === undefined || forbiddenItems.has(e.before)) return true;
    if (held.has(e.before)) return false;
    if (!items.has(e.before)) return true;
    let early = without.get(e.before);
    if (early === undefined) {
      early = reach(world, { ...options, forbiddenItems: new Set([...forbiddenItems, e.before]) });
      without.set(e.before, early);
    }
    return early.regions.has(e.to);
  };
  for (let changed = true; changed;) {
    changed = false;
    for (const e of world.entrances) {
      if (
        regions.has(e.from) &&
        !regions.has(e.to) &&
        evaluate(e.requires, context) &&
        crossableBefore(e)
      ) {
        changed = enter(e.to) || changed;
      }
    }
  }
  return { regions, items };
}

const regionsByArea = new WeakMap<World, ReadonlyMap<string, readonly string[]>>();

/** The regions of one area, in world order. Computed once per world. */
export function regionsInArea(world: World, area: string): readonly string[] {
  let map = regionsByArea.get(world);
  if (map === undefined) {
    const built = new Map<string, string[]>();
    for (const region of world.regions.values()) {
      if (region.area === null) continue;
      const list = built.get(region.area);
      if (list === undefined) built.set(region.area, [region.id]);
      else list.push(region.id);
    }
    map = built;
    regionsByArea.set(world, map);
  }
  return map.get(area) ?? [];
}

/**
 * One map per world, dropped with the world. Each entry is one forbidden-region set times one
 * starting-gift item set: the combinations a world is actually asked about, not an unbounded log.
 * A challenge draws a handful of forbidden areas and one gift, so the map stays small without a cap.
 */
const reachCache = new WeakMap<World, Map<string, Reach>>();

/**
 * Everything still reachable once the given regions are closed. The walk runs once per distinct set of
 * regions and starting items; a later call with the same key returns the cached reach.
 */
export function reachWithoutRegions(
  world: World,
  forbiddenRegions: Iterable<string>,
  items: Iterable<string> = [],
): Reach {
  const regions = [...new Set(forbiddenRegions)].sort();
  const held = [...new Set(items)].sort();
  const key = `${regions.join("\0")}\n${held.join("\0")}`;
  let cache = reachCache.get(world);
  if (cache === undefined) reachCache.set(world, (cache = new Map<string, Reach>()));
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const result = reach(world, {
    forbiddenRegions: new Set(regions),
    ...(held.length > 0 ? { items: held } : {}),
  });
  cache.set(key, result);
  return result;
}

/**
 * Everything still reachable once the given areas are closed. Uses the same cache as
 * `reachWithoutRegions`: one walk per distinct set of areas and starting items, never one per order.
 */
export function reachWithoutAreas(
  world: World,
  areas: readonly string[],
  items: Iterable<string> = [],
): Reach {
  const regionIds: string[] = [];
  for (const area of [...new Set(areas)].sort()) regionIds.push(...regionsInArea(world, area));
  return reachWithoutRegions(world, regionIds, items);
}
