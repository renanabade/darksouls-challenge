import { reach, type Reach } from "../reach.js";
import { evaluate, itemsOf } from "../requirement.js";
import type { Milestone, World } from "../world.js";
import type { Random } from "./random.js";

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

/** What the chapters of one Lord Soul order share, whatever the seed: the costly part, kept per world. */
interface Layout {
  readonly goals: readonly Milestone[];
  readonly regions: readonly { readonly id: string; readonly area: string }[];
  /** The chapter of each region some goal needs. */
  readonly required: ReadonlyMap<string, number>;
  /** The first chapter in which each region can be entered at all. */
  readonly open: ReadonlyMap<string, number>;
  /** Regions with an entrance into each region. */
  readonly from: ReadonlyMap<string, readonly string[]>;
  /** The chapters of the areas with required regions that each area leads into. */
  readonly exits: ReadonlyMap<string, readonly number[]>;
}

const cache = new WeakMap<World, Map<string, Layout>>();

/**
 * The chapters of a journey whose Lord Souls are taken in the given order (their item names, as in the
 * lord-order order): the opening chapters, one chapter per Lord Soul, and the last one, to the goal.
 *
 * Each region goes to a chapter in two passes:
 * 1. A region the goal of some chapter needs (forbid it, and the goal cannot be reached) goes to the first
 *    such chapter: the Catacombs to Nito's, the Duke's Archives to Seath's.
 * 2. Any other region (a detour) can go to any chapter from the first one that reaches it from a region
 *    already placed, and in which it can be entered at all (what later chapters hold, their goals and their
 *    bosses' deaths, is withheld: the Painted World waits for Anor Londo's chapter), to the last one before
 *    the Kiln. A detour that leads into a later chapter's required region comes no later than that chapter
 *    (the Depths before Blighttown's). Without a generator, a detour takes its first chapter; with one, an
 *    area of detours is drawn among its chapters, smaller chapters first (the evaluation of 2026-10-21:
 *    every detour in its first chapter gave chapters of 1 to 9 areas).
 */
export function chaptersOf(world: World, lordOrder: readonly string[], rng?: Random): Chapter[] {
  const { goals, regions, required, open, from, exits } = layoutOf(world, lordOrder);
  const chapterOf = new Map(required);
  const areaOf = new Map(regions.map((r) => [r.id, r.area]));
  const fixedAreas = new Set([...required.keys()].flatMap((r) => areaOf.get(r) ?? []));
  const sizes = goals.map(() => new Set<string>());
  for (const [region, k] of required) sizes[k]?.add(areaOf.get(region) ?? region);
  const lastDetour = goals.length - 2;
  const drawn = new Map<string, number>();

  for (let changed = true; changed;) {
    changed = false;
    for (const region of regions) {
      const opens = open.get(region.id);
      if (chapterOf.has(region.id) || opens === undefined) continue;
      const placed = (from.get(region.id) ?? []).flatMap((r) => chapterOf.get(r) ?? []);
      if (placed.length === 0) continue;
      const earliest = Math.max(opens, Math.min(...placed));
      let k = earliest;
      if (rng !== undefined && !fixedAreas.has(region.area)) {
        let area = drawn.get(region.area);
        if (area === undefined) {
          const bounds = (exits.get(region.area) ?? []).filter((c) => c > earliest);
          const latest = Math.max(earliest, Math.min(lastDetour, ...bounds));
          const options = Array.from({ length: latest - earliest + 1 }, (_, i) => earliest + i);
          area =
            rng.weightedShuffle(options, (c) => 1 / (1 + (sizes[c]?.size ?? 0)) ** 2)[0] ??
            earliest;
          drawn.set(region.area, area);
          sizes[area]?.add(region.area);
        }
        k = Math.max(earliest, area);
      }
      chapterOf.set(region.id, k);
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

  return goals.map((goal, k) => {
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
}

function layoutOf(world: World, lordOrder: readonly string[]): Layout {
  const key = lordOrder.join("|");
  let byOrder = cache.get(world);
  if (byOrder === undefined) cache.set(world, (byOrder = new Map<string, Layout>()));
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

  const required = new Map<string, number>();
  for (const region of regions) {
    const without = reach(world, { forbiddenRegions: new Set([region.id]) });
    const k = goals.findIndex((g) => !holds(without, g));
    if (k >= 0) required.set(region.id, k);
  }

  const regionOfBoss = new Map([...world.bosses.values()].map((b) => [b.defeatedItem, b.region]));
  const reachBy = goals.map((_, k) => {
    const withheld = new Set(goals.slice(k + 1).flatMap((g) => [...itemsOf(g.requires)]));
    for (const g of goals.slice(0, k + 1))
      for (const item of itemsOf(g.requires)) withheld.delete(item);
    for (const [item, region] of regionOfBoss) {
      const chapter = required.get(region);
      if (chapter !== undefined && chapter > k) withheld.add(item);
    }
    return reach(world, { forbiddenItems: withheld });
  });
  const open = new Map<string, number>();
  for (const region of regions) {
    const k = reachBy.findIndex((r) => r.regions.has(region.id));
    if (k >= 0) open.set(region.id, k);
  }

  const areaOf = new Map(regions.map((r) => [r.id, r.area]));
  // An area with a required region is met in the first chapter that needs one of them.
  const fixedChapter = new Map<string, number>();
  for (const [region, k] of required) {
    const area = areaOf.get(region);
    if (area !== undefined && k < (fixedChapter.get(area) ?? Infinity)) fixedChapter.set(area, k);
  }
  const from = new Map<string, string[]>();
  const exits = new Map<string, number[]>();
  for (const e of world.entrances) {
    from.set(e.to, [...(from.get(e.to) ?? []), e.from]);
    const area = areaOf.get(e.from);
    const into = areaOf.get(e.to);
    const k = into === undefined ? undefined : fixedChapter.get(into);
    if (area !== undefined && into !== area && k !== undefined)
      exits.set(area, [...(exits.get(area) ?? []), k]);
  }

  const layout = { goals, regions, required, open, from, exits };
  byOrder.set(key, layout);
  return layout;
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
