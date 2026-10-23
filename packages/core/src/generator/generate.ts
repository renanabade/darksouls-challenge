import { catalog, type Difficulty, type OrderTemplate } from "../orders/index.js";
import { reachWithoutAreas, regionsInArea } from "../reach.js";
import {
  startingItems,
  unreachableTarget,
  validate,
  type ArgValue,
  type OrderInstance,
  type Setup,
} from "../validator.js";
import type { StartingGift, World } from "../world.js";
import { chaptersOf, type Chapter } from "./chapters.js";
import { CURVES, curveOffsets, shifted, type Curve } from "./curve.js";
import { DIFFICULTIES, domainsOf, drawArgs, fitCurse, rangeOf, type DrawContext } from "./draw.js";
import { Random } from "./random.js";

export type Length = "short" | "full" | "epic";
export const LENGTHS: readonly Length[] = ["short", "full", "epic"];

export interface GeneratorConfig {
  readonly seed: string;
  readonly difficulty: Difficulty;
  readonly length: Length;
  /** How difficulty moves across the chapters; drawn by the seed when absent. */
  readonly curve?: Curve;
  /** Fixed by the player; drawn by the seed when absent. */
  readonly startingClass?: string;
  readonly giftRow?: number;
  readonly levelCap?: number;
}

export interface GeneratedOrder {
  readonly template: OrderTemplate;
  readonly args: Readonly<Record<string, ArgValue>>;
  readonly exceptions: readonly string[];
  /** The index of the order's chapter; absent for a rule of the whole journey. */
  readonly chapter?: number;
}

/** A chapter as the challenge plays it: its stretch of the run and its place on the curve. */
export interface ChapterPlan {
  /** The milestone that ends the chapter. */
  readonly goal: string;
  /** Every milestone the chapter covers, the goal last: more than one in an act of a short journey. */
  readonly goals: readonly string[];
  readonly areas: readonly string[];
  readonly bosses: readonly string[];
  /** Steps away from the challenge's difficulty (the curve); shared by every player of a group. */
  readonly offset: number;
  readonly difficulty: Difficulty;
}

export interface Challenge {
  readonly config: GeneratorConfig;
  readonly dataVersion: string;
  readonly setup: Required<Setup>;
  readonly curve: Curve;
  readonly chapters: readonly ChapterPlan[];
  /** The rules of the whole journey first (in catalog order), then each chapter's, chapter by chapter. */
  readonly orders: readonly GeneratedOrder[];
}

/** Version of the drawing rules; part of the seed, so a change in the rules never reuses an old draw. */
export const GENERATOR_VERSION = "6";

/** Soul level cap per difficulty (Proposto, to tune by playing); never below the class's level. */
const LEVEL_CAPS: Readonly<Record<Difficulty, readonly [number, number]>> = {
  easy: [60, 90],
  medium: [35, 55],
  hard: [18, 30],
  extreme: [1, 12],
};

/**
 * How many orders a journey has (Proposto): rules of the whole journey, and rules of each chapter. A short
 * challenge stays a handful of good rules; an epic one has rules for every area of the run.
 */
const JOURNEY_ORDERS: Readonly<Record<Length, readonly [number, number]>> = {
  short: [2, 3],
  full: [3, 5],
  epic: [4, 6],
};
const CHAPTER_ORDERS: Readonly<Record<Length, readonly [number, number]>> = {
  short: [1, 2],
  full: [1, 3],
  epic: [3, 5],
};
/** The Asylum has one area and one boss. */
const ASYLUM_MAX = 1;
/**
 * A short journey has too few rules for nine chapters, most of which were left empty (the evaluation of
 * 2026-10-21), so it groups them in four acts: the Asylum and the first bell, the second bell and the
 * Lordvessel, the Lord Souls, the Kiln. The sizes are counts of chapters, in order.
 */
const ACTS: Readonly<Record<Length, readonly number[] | undefined>> = {
  short: [2, 2, 4, 1],
  full: undefined,
  epic: undefined,
};

/** Orders that rule the whole journey; every other static order belongs to a chapter. */
const JOURNEY_TEMPLATES = new Set([
  "closed-merchant",
  "run-lives",
  "accumulated-curse",
  "phase-swap",
  "forbidden-area",
  "earned-levels",
  "earned-upgrades",
]);
/**
 * Orders a chapter can only take in one place: the chapter of the first bell, or one with a milestone to
 * start after (by the chapter's index and the milestones it covers).
 */
const ONLY_IN_CHAPTER: Readonly<Record<string, (k: number, goals: readonly string[]) => boolean>> =
  {
    "boss-before-bell": (_k, goals) => goals.includes("bell-undead-parish"),
    "assigned-weapon": (k) => k > 0,
    "chapter-restriction": (k) => k > 0,
  };

/**
 * Weight-only orders that no other order contradicts: they never make a set impossible, so the generator
 * adds them without validating the whole set again (a journey validates dozens of times). "Wear what you
 * find" is left out: it contradicts "no armor" and "nothing from the ground". The challenge is validated
 * once more as a whole before it is handed out.
 */
const WEIGHT_ONLY_ALWAYS_FITS = new Set([
  "no-bonfire",
  "one-bonfire",
  "dry-fight",
  "counted-attempts",
  "run-lives",
  "earned-upgrades",
]);

/** Fresh parameters tried for an order before it is left out. */
const ATTEMPTS = 6;

/**
 * The budget (docs/07 in the workspace). Difficulty: the average weight an order may have, so an easy
 * chapter is mostly light orders; hard and extreme have no ceiling. Friction (time, searching, repetition)
 * has a ceiling per order, because no profile enjoys a challenge made of chores.
 */
const DIFFICULTY_PER_ORDER: Readonly<Record<Difficulty, number>> = {
  easy: 1.5,
  medium: 2,
  hard: Infinity,
  extreme: Infinity,
};
const FRICTION_PER_ORDER = 0.75;
/**
 * How the candidate orders are shuffled: heavier orders come first more often as the difficulty grows
 * (weight raised to this power), so a tryhard gets the heavy orders without always getting the same ones.
 */
const WEIGHT_BIAS: Readonly<Record<Difficulty, number>> = {
  easy: -1,
  medium: 0,
  hard: 1,
  extreme: 2,
};

/**
 * Generates a static challenge as a journey in chapters (docs/01 in the workspace): the run is cut at its
 * milestones (the Asylum, the bells, the Lordvessel, each Lord Soul in a drawn order, the Kiln); the
 * journey gets a few rules for the whole run, and each chapter its own rules about its areas and bosses,
 * at the chapter's place on the difficulty curve. Orders are added one at a time, in a shuffled order,
 * and kept only when they fit the budget and the whole set still validates as comfortable. Same config and
 * data, same challenge.
 */
export function generate(world: World, config: GeneratorConfig): Challenge {
  const rng = new Random(`${config.seed}|${world.dataVersion}|${GENERATOR_VERSION}`);
  const setup = drawSetup(world, config, rng);
  const domains = domainsOf(world);
  const curve = config.curve ?? rng.pick(CURVES);
  const levelsLocked = setup.levelCap <= (world.classes.get(setup.startingClass)?.level ?? 1);

  // The Lord Souls' order is the backbone of the later chapters, so it is drawn first and always kept.
  const lordTemplate = templateOf("lord-order");
  let lordOrder: OrderInstance | undefined;
  for (let attempt = 0; attempt < ATTEMPTS * 4 && lordOrder === undefined; attempt++) {
    const candidate = { template: lordTemplate, args: { order: rng.shuffle(domains.lordSouls) } };
    if (validate(world, setup, [candidate]).verdict === "comfortable") lordOrder = candidate;
  }
  if (lordOrder === undefined)
    throw new Error(`no order of the Lord Souls validates for ${config.seed}`);
  const chapters = actsOf(
    chaptersOf(world, lordOrder.args["order"] as readonly string[], rng),
    ACTS[config.length],
  );
  const offsets = curveOffsets(curve, chapters.length, config.difficulty, rng);
  const plans: ChapterPlan[] = chapters.map((c, k) => ({
    goal: c.goal,
    goals: c.goals,
    areas: c.areas,
    bosses: c.bosses,
    offset: offsets[k] ?? 0,
    difficulty: shifted(config.difficulty, offsets[k] ?? 0),
  }));

  const sections: { context: DrawContext; target: number; pool: OrderTemplate[] }[] = [];
  const statics = catalog.filter(
    (t: OrderTemplate) =>
      t.validation.static !== undefined && t.optIn !== true && t.id !== "lord-order",
  );
  sections.push({
    context: { difficulty: config.difficulty, levelsLocked },
    target: rng.int(...JOURNEY_ORDERS[config.length]),
    pool: statics.filter((t) => JOURNEY_TEMPLATES.has(t.id)),
  });
  chapters.forEach((chapter, k) => {
    const [min, max] = CHAPTER_ORDERS[config.length];
    sections.push({
      context: {
        difficulty: plans[k]?.difficulty ?? config.difficulty,
        levelsLocked,
        chapter: {
          from: k === 0 ? chapter.goal : (chapters[k - 1]?.goal ?? chapter.goal),
          until: chapter.goal,
          areas: chapter.areas,
          requiredAreas: chapter.requiredAreas,
          bosses: chapter.bosses,
          areasSoFar: chapters.slice(0, k + 1).flatMap((c) => c.areas),
        },
      },
      target: Math.min(rng.int(min, max), chapter.goal === ASYLUM ? ASYLUM_MAX : Infinity),
      pool: statics.filter(
        (t) => !JOURNEY_TEMPLATES.has(t.id) && (ONLY_IN_CHAPTER[t.id]?.(k, chapter.goals) ?? true),
      ),
    });
  });
  const frictionBudget = FRICTION_PER_ORDER * sections.reduce((sum, s) => sum + s.target, 0);

  let chosen: (OrderInstance & { chapter?: number })[] = [lordOrder];
  let friction = lordTemplate.weight.friction;
  const held = startingItems(world, setup);
  const uses = new Map<string, number>();
  // An area or a boss may gather several rules, but never the same rule twice.
  const usedTargets = new Set<string>();
  for (const [index, section] of sections.entries()) {
    const chapter = index === 0 ? undefined : index - 1;
    const { difficulty } = section.context;
    const budget = section.target * DIFFICULTY_PER_ORDER[difficulty];
    let spent = 0;
    let added = 0;
    // Orders already in the journey come later more often, so chapters do not repeat one another.
    const candidates = rng.weightedShuffle(
      section.pool,
      (t) => t.weight.difficulty ** WEIGHT_BIAS[difficulty] / (1 + (uses.get(t.id) ?? 0)),
    );
    for (const template of candidates) {
      if (added >= section.target) break;
      // Leave room for the orders still to come, at the lightest weight.
      if (spent + template.weight.difficulty + (section.target - added - 1) > budget) continue;
      if (friction + template.weight.friction > frictionBudget) continue;
      for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        const args = drawArgs(template, domains, section.context, rng);
        if (args === undefined) break;
        const targets = targetsOf(args).map((t) => `${template.id}|${t}`);
        if (targets.some((t) => usedTargets.has(t))) continue;
        if (pointless(world, template, args, chapter, chosen, held)) continue;
        // A forbidden area drawn after another order can close the only way to that order. Try another
        // area. The validation at the end must not be what rejects the draw.
        if (template.id === "forbidden-area" && forbiddenAreaCutsOff(world, args, chosen, held))
          continue;
        const next = [...chosen, { template, args, ...(chapter !== undefined && { chapter }) }];
        if (
          !WEIGHT_ONLY_ALWAYS_FITS.has(template.id) ||
          template.validation.static !== "weightOnly"
        ) {
          const result = validate(world, setup, next);
          if (result.verdict !== "comfortable" || !result.complete) continue;
        }
        chosen = next;
        spent += template.weight.difficulty;
        friction += template.weight.friction;
        added++;
        uses.set(template.id, (uses.get(template.id) ?? 0) + 1);
        targets.forEach((t) => usedTargets.add(t));
        break;
      }
    }
  }

  return finish(world, config, setup, curve, plans, chosen);
}

/** The challenge in manual order, with each order's automatic exceptions from one last validation. */
function finish(
  world: World,
  config: GeneratorConfig,
  setup: Required<Setup>,
  curve: Curve,
  chapters: readonly ChapterPlan[],
  orders: readonly (OrderInstance & { chapter?: number })[],
): Challenge {
  const sorted = [...orders].sort(
    (a, b) => (a.chapter ?? -1) - (b.chapter ?? -1) || a.template.number - b.template.number,
  );
  const result = validate(world, setup, sorted);
  if (result.verdict !== "comfortable" || !result.complete)
    throw new Error(`seed ${config.seed} does not validate: ${result.problems.join("; ")}`);
  return {
    config,
    dataVersion: world.dataVersion,
    setup,
    curve,
    chapters: reachableChapters(world, chapters, sorted, startingItems(world, setup)),
    orders: sorted.map((o, i) => ({ ...o, exceptions: result.orders[i]?.exceptions ?? [] })),
  };
}

/**
 * The chapter the player reads. A forbidden area stays, marked closed; areas and bosses that can only be
 * reached through one are left out, so the manual does not send the player somewhere the orders closed.
 */
export function reachableChapters(
  world: World,
  chapters: readonly ChapterPlan[],
  orders: readonly OrderInstance[],
  items: readonly string[],
): readonly ChapterPlan[] {
  const forbidden = orders.flatMap((o) => {
    const area = o.args["area"];
    return o.template.id === "forbidden-area" && typeof area === "string" ? [area] : [];
  });
  if (forbidden.length === 0) return chapters;
  const closed = new Set(forbidden);
  const reached = reachWithoutAreas(world, forbidden, items).regions;
  const open = (area: string): boolean =>
    closed.has(area) || regionsInArea(world, area).some((id) => reached.has(id));
  return chapters.map((chapter) => ({
    ...chapter,
    areas: chapter.areas.filter(open),
    bosses: chapter.bosses.filter((id) => {
      const region = world.bosses.get(id)?.region;
      return region === undefined || region === "" || reached.has(region);
    }),
  }));
}

/** The areas, bosses and restrictions an order is about. */
function targetsOf(args: Readonly<Record<string, ArgValue>>): string[] {
  return ["area", "boss", "restriction"].flatMap((name) => {
    const value = args[name];
    return typeof value === "string" ? [`${name}:${value}`] : [];
  });
}

const ASYLUM = "boss-asylum-demon";

/** The chapters grouped in acts of the given sizes, each act ending at its last chapter's goal. */
function actsOf(
  chapters: readonly Chapter[],
  sizes: readonly number[] | undefined,
): (Chapter & { goals: readonly string[] })[] {
  if (sizes === undefined) return chapters.map((c) => ({ ...c, goals: [c.goal] }));
  const ends = sizes.map((_, i) => sizes.slice(0, i + 1).reduce((a, b) => a + b, 0));
  if (ends.at(-1) !== chapters.length)
    throw new Error(
      `acts of ${String(ends.at(-1))} chapters for a journey of ${String(chapters.length)}`,
    );
  return ends.map((end, i) => {
    const group = chapters.slice(ends[i - 1] ?? 0, end);
    const all = (pick: (c: Chapter) => readonly string[]) =>
      [...new Set(group.flatMap(pick))].sort();
    return {
      goal: group.at(-1)?.goal ?? "",
      goals: group.map((c) => c.goal),
      areas: all((c) => c.areas),
      requiredAreas: all((c) => c.requiredAreas),
      bosses: all((c) => c.bosses),
    };
  });
}

/**
 * True when closing this area would leave an order already drawn with nowhere to go.
 * A forbidden area already drawn is judged without its own regions: closing that area is the order.
 * A merchant stays when any of their shops can still be reached.
 */
export function forbiddenAreaCutsOff(
  world: World,
  args: Readonly<Record<string, ArgValue>>,
  chosen: readonly OrderInstance[],
  items: readonly string[],
): boolean {
  const area = args["area"];
  if (typeof area !== "string") return false;
  const areas = [
    ...chosen.flatMap((order) => {
      const id = order.args["area"];
      return order.template.id === "forbidden-area" && typeof id === "string" ? [id] : [];
    }),
    area,
  ];
  const reached = reachWithoutAreas(world, areas, items).regions;
  return chosen.some((order) => {
    if (order.template.id === "forbidden-area") {
      const own = order.args["area"];
      if (typeof own !== "string") return false;
      const others = areas.filter((id) => id !== own);
      if (others.length === 0) return false;
      return (
        unreachableTarget(world, order.args, reachWithoutAreas(world, others, items).regions) !==
        undefined
      );
    }
    return unreachableTarget(world, order.args, reached) !== undefined;
  });
}

/**
 * An order that would ask nothing on top of the others (the analyses of 2026-10-21): attempts against a
 * boss that the deaths of the whole run already limit more tightly (every lost attempt is a death); a
 * chapter restriction the curse already holds; an order about a place the journey can no longer reach
 * once its forbidden areas are closed; a fight without Estus in a chapter that already forbids Estus,
 * or the other way round.
 */
function pointless(
  world: World,
  template: OrderTemplate,
  args: Readonly<Record<string, ArgValue>>,
  chapter: number | undefined,
  chosen: readonly (OrderInstance & { chapter?: number })[],
  items: readonly string[],
): boolean {
  const journey = (id: string, param: string) =>
    chosen.find((o) => o.template.id === id)?.args[param];
  const forbidden = chosen.flatMap((o) => {
    const area = o.args["area"];
    return o.template.id === "forbidden-area" && typeof area === "string" ? [area] : [];
  });
  // The area an order sends the player into: its own, its boss's, or its pickup's.
  const placeOf = (a: Readonly<Record<string, ArgValue>>): string | undefined => {
    if (typeof a["area"] === "string") return a["area"];
    const b = typeof a["boss"] === "string" ? world.bosses.get(a["boss"]) : undefined;
    const location = world.locations.find((l) => l.name === a["location"]);
    const region = b?.region ?? location?.region;
    return region === undefined ? undefined : (world.regions.get(region)?.area ?? undefined);
  };
  const place = placeOf(args);
  // One reach per distinct forbidden set (see reachWithoutAreas), shared with the validator.
  if (
    forbidden.length > 0 &&
    unreachableTarget(world, args, reachWithoutAreas(world, forbidden, items).regions) !== undefined
  )
    return true;
  // An area closed for the chapter (the other way) takes no other order of the chapter, and the other way round.
  const closedTogether = chosen.some(
    (o) =>
      o.chapter === chapter &&
      (o.template.id === "the-other-way") !== (template.id === "the-other-way") &&
      placeOf(o.args) === place,
  );
  if (place !== undefined && chapter !== undefined && closedTogether) return true;
  const inChapter = (id: string, restriction?: string) =>
    chosen.some(
      (o) =>
        o.chapter === chapter &&
        o.template.id === id &&
        (restriction === undefined || o.args["restriction"] === restriction),
    );
  switch (template.id) {
    case "counted-attempts": {
      const lives = journey("run-lives", "deaths");
      const attempts = args["attempts"];
      return typeof lives === "number" && typeof attempts === "number" && attempts - 1 >= lives;
    }
    case "chapter-restriction": {
      const curse = journey("accumulated-curse", "restrictions");
      if (typeof curse === "object" && curse.includes(args["restriction"] as string)) return true;
      return args["restriction"] === "no-estus" && inChapter("dry-fight");
    }
    case "dry-fight":
      return inChapter("chapter-restriction", "no-estus");
    // Resting at one bonfire of an area asks nothing where no bonfire of it may be used, and the other way round.
    case "one-bonfire":
    case "no-bonfire": {
      const other = template.id === "one-bonfire" ? "no-bonfire" : "one-bonfire";
      return chosen.some((o) => o.template.id === other && o.args["area"] === args["area"]);
    }
    default:
      return false;
  }
}

function templateOf(id: string): OrderTemplate {
  const template = catalog.find((t: OrderTemplate) => t.id === id);
  if (template === undefined) throw new Error(`no order "${id}" in the catalog`);
  return template;
}

/**
 * One challenge for a group of players of different skill (docs/07 in the workspace): the same seed gives
 * everyone the same orders, chapters, curve, areas, bosses, weapons, class and gift; only the numbers
 * follow each player's difficulty. The structure is generated for the hardest difficulty of the group,
 * then eased for each player: each chapter keeps its offset on the curve from the player's own difficulty.
 * Every number is monotonic (a higher level cap, more deaths, attempts or points, fewer restrictions never
 * make a run impossible), so a structure possible for the hardest player is possible for all; each eased
 * challenge is still validated. The hardest player gets exactly the solo challenge. Returns one challenge
 * per difficulty given, in the same order.
 */
export function generateGroup(
  world: World,
  config: Omit<GeneratorConfig, "difficulty">,
  difficulties: readonly Difficulty[],
): Challenge[] {
  const hardest = difficulties.reduce<Difficulty | undefined>(
    (a, b) => (a === undefined || rank(b) > rank(a) ? b : a),
    undefined,
  );
  if (hardest === undefined) throw new Error("a group needs at least one difficulty");
  const base = generate(world, { ...config, difficulty: hardest });
  return difficulties.map((difficulty) => ease(world, base, difficulty));
}

/** The same challenge with each number moved to the same relative place in an easier range. */
function ease(world: World, base: Challenge, difficulty: Difficulty): Challenge {
  const from = base.config.difficulty;
  const rescale = (value: number, a: readonly [number, number], b: readonly [number, number]) => {
    const u = a[1] === a[0] ? 0.5 : (value - a[0]) / (a[1] - a[0]);
    return Math.round(b[0] + u * (b[1] - b[0]));
  };
  const classLevel = world.classes.get(base.setup.startingClass)?.level ?? 1;
  const levelCap =
    base.config.levelCap ??
    Math.max(classLevel, rescale(base.setup.levelCap, LEVEL_CAPS[from], LEVEL_CAPS[difficulty]));
  const chapters = base.chapters.map((c) => ({ ...c, difficulty: shifted(difficulty, c.offset) }));

  const orders = base.orders.map(({ template, args, chapter }) => {
    const levels =
      chapter === undefined
        ? { from, to: difficulty }
        : {
            from: base.chapters[chapter]?.difficulty ?? from,
            to: chapters[chapter]?.difficulty ?? difficulty,
          };
    const eased: Record<string, ArgValue> = { ...args };
    for (const [name, spec] of Object.entries(template.params)) {
      const arg = args[name];
      if (spec.kind === "count" && typeof arg === "number")
        eased[name] = rescale(
          arg,
          rangeOf(template, name, levels.from),
          rangeOf(template, name, levels.to),
        );
      if (spec.kind === "restrictionList" && typeof arg === "object")
        eased[name] = fitCurse(arg, levels.to);
    }
    return { template, args: eased, ...(chapter !== undefined && { chapter }) };
  });

  return finish(
    world,
    { ...base.config, difficulty },
    { ...base.setup, levelCap },
    base.curve,
    chapters,
    orders,
  );
}

const rank = (d: Difficulty): number => DIFFICULTIES.indexOf(d);

function drawSetup(world: World, config: GeneratorConfig, rng: Random): Required<Setup> {
  const classes = [...world.classes.keys()].sort();
  const startingClass = config.startingClass ?? rng.pick(classes);
  const level = world.classes.get(startingClass)?.level;
  if (level === undefined) throw new Error(`unknown class "${startingClass}"`);
  const gifts = [...world.gifts].sort((a, b) => a.row - b.row);
  const gift: StartingGift | undefined =
    config.giftRow === undefined ? rng.pick(gifts) : gifts.find((g) => g.row === config.giftRow);
  if (gift === undefined) throw new Error(`unknown gift row ${String(config.giftRow)}`);
  const levelCap = Math.max(level, config.levelCap ?? rng.int(...LEVEL_CAPS[config.difficulty]));
  return { mode: "static", gift, startingClass, levelCap };
}
