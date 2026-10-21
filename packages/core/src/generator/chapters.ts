import { reach, type Reach } from "../reach.js";
import { evaluate, itemsOf } from "../requirement.js";
import type { Milestone, World } from "../world.js";

/**
 * A chapter of the journey (docs/01 in the workspace, "Jornada em capítulos"): the stretch of the run that
 * ends at a milestone, with the areas and bosses the player meets on the way. Chapters are derived from the
 * world graph, never typed in by hand.
 */
export interface Chapter {
  /** The milestone that ends the chapter. */
  readonly goal: string;
  /** Areas first met in this chapter (by id, sorted). */
  readonly areas: readonly string[];
  /** The areas of the chapter its goal cannot be reached without; the rest are detours. */
  readonly requiredAreas: readonly string[];
  /** Bosses whose arena lies in the chapter (by id, sorted). */
  readonly bosses: readonly string[];
}

/** The chapters before the Lord Souls, in the order the game imposes. */
const OPENING_GOALS = [
  "boss-asylum-demon",
  "bell-undead-parish",
  "both-bells",
  "lordvessel-placed",
] as const;

const cache = new WeakMap<World, Map<string, Chapter[]>>();

/**
 * The chapters of a journey whose Lord Souls are taken in the given order (their item names, as in the
 * lord-order order): the opening chapters, one chapter per Lord Soul, and the last one, to the goal.
 *
 * Each region goes to a chapter in two passes:
 * 1. A region the goal of some chapter needs (forbid it, and the goal cannot be reached) goes to the first
 *    such chapter: the Catacombs to Nito's, the Duke's Archives to Seath's.
 * 2. Any other region (a detour) goes to the first chapter that reaches it from a region already placed,
 *    and in which it can be entered at all: what later chapters hold (their goals, their bosses' deaths)
 *    is withheld. So the Painted World waits for Anor Londo's chapter, and the Great Hollow for Blighttown's.
 */
export function chaptersOf(world: World, lordOrder: readonly string[]): Chapter[] {
  const key = lordOrder.join("|");
  let byOrder = cache.get(world);
  if (byOrder === undefined) cache.set(world, (byOrder = new Map<string, Chapter[]>()));
  const cached = byOrder.get(key);
  if (cached !== undefined) return cached;

  const goals = [
    ...OPENING_GOALS.map((id) => milestone(world, id)),
    ...lordOrder.map((soul) => lordGoal(world, soul)),
    finalGoal(world),
  ];
  const holds = (r: Reach, m: Milestone): boolean =>
    evaluate(m.requires, { has: (i) => r.items.has(i), reached: (id) => r.regions.has(id) });
  const regions = [...world.regions.values()].flatMap((r) =>
    !r.virtual && r.area !== null ? [{ id: r.id, area: r.area }] : [],
  );

  const chapterOf = new Map<string, number>();
  const required = new Set<string>();
  for (const region of regions) {
    const without = reach(world, { forbiddenRegions: new Set([region.id]) });
    const k = goals.findIndex((g) => !holds(without, g));
    if (k >= 0) {
      chapterOf.set(region.id, k);
      required.add(region.id);
    }
  }

  const regionOfBoss = new Map([...world.bosses.values()].map((b) => [b.defeatedItem, b.region]));
  const reachBy = goals.map((_, k) => {
    const withheld = new Set(goals.slice(k + 1).flatMap((g) => [...itemsOf(g.requires)]));
    for (const g of goals.slice(0, k + 1))
      for (const item of itemsOf(g.requires)) withheld.delete(item);
    for (const [item, region] of regionOfBoss) {
      const chapter = chapterOf.get(region);
      if (chapter !== undefined && chapter > k) withheld.add(item);
    }
    return reach(world, { forbiddenItems: withheld });
  });
  for (let changed = true; changed;) {
    changed = false;
    for (const region of regions) {
      if (chapterOf.has(region.id)) continue;
      const from = world.entrances
        .filter((e) => e.to === region.id)
        .flatMap((e) => chapterOf.get(e.from) ?? []);
      const open = reachBy.findIndex((r) => r.regions.has(region.id));
      if (from.length === 0 || open < 0) continue;
      chapterOf.set(region.id, Math.max(open, Math.min(...from)));
      changed = true;
    }
  }

  // An area belongs to the first chapter that meets it.
  const areaChapter = new Map<string, number>();
  const requiredAreas = new Set<string>();
  for (const region of regions) {
    const k = chapterOf.get(region.id);
    if (k === undefined) continue;
    if (k < (areaChapter.get(region.area) ?? Infinity)) areaChapter.set(region.area, k);
  }
  for (const region of regions)
    if (required.has(region.id) && chapterOf.get(region.id) === areaChapter.get(region.area))
      requiredAreas.add(region.area);

  const chapters = goals.map((goal, k) => {
    const areas = [...areaChapter]
      .filter(([, c]) => c === k)
      .map(([a]) => a)
      .sort();
    return {
      goal: goal.id,
      areas,
      requiredAreas: areas.filter((a) => requiredAreas.has(a)),
      bosses: [...world.bosses.values()]
        .filter((b) => chapterOf.get(b.region) === k)
        .map((b) => b.id)
        .sort(),
    };
  });
  byOrder.set(key, chapters);
  return chapters;
}

function milestone(world: World, id: string): Milestone {
  const found = world.milestones.get(id);
  if (found === undefined) throw new Error(`the data set has no milestone "${id}"`);
  return found;
}

/** The milestone of placing a Lord Soul: the lord-souls milestone that needs that soul. */
function lordGoal(world: World, soul: string): Milestone {
  const found = [...world.milestones.values()].find(
    (m) => m.kind === "lord-souls" && itemsOf(m.requires).has(soul),
  );
  if (found === undefined) throw new Error(`no milestone places "${soul}"`);
  return found;
}

/** The milestone of the run's goal (defeating Gwyn). */
function finalGoal(world: World): Milestone {
  const found = [...world.milestones.values()].find(
    (m) => m.kind === "boss" && itemsOf(m.requires).has(world.goal),
  );
  if (found === undefined) throw new Error(`no milestone reaches the goal "${world.goal}"`);
  return found;
}
