import { catalog, type Difficulty, type OrderTemplate } from "../orders/index.js";
import { validate, type ArgValue, type OrderInstance, type Setup } from "../validator.js";
import type { StartingGift, World } from "../world.js";
import { DIFFICULTIES, domainsOf, drawArgs, fitCurse, rangeOf } from "./draw.js";
import { Random } from "./random.js";

export type Length = "short" | "full";

export interface GeneratorConfig {
  readonly seed: string;
  readonly difficulty: Difficulty;
  readonly length: Length;
  /** Fixed by the player; drawn by the seed when absent. */
  readonly startingClass?: string;
  readonly giftRow?: number;
  readonly levelCap?: number;
}

export interface GeneratedOrder {
  readonly template: OrderTemplate;
  readonly args: Readonly<Record<string, ArgValue>>;
  readonly exceptions: readonly string[];
}

export interface Challenge {
  readonly config: GeneratorConfig;
  readonly dataVersion: string;
  readonly setup: Required<Setup>;
  /** In catalog order. */
  readonly orders: readonly GeneratedOrder[];
}

/** Version of the drawing rules; part of the seed, so a change in the rules never reuses an old draw. */
export const GENERATOR_VERSION = "2";

/** Soul level cap per difficulty (Proposto, to tune by playing); never below the class's level. */
const LEVEL_CAPS: Readonly<Record<Difficulty, readonly [number, number]>> = {
  easy: [60, 90],
  medium: [35, 55],
  hard: [18, 30],
  extreme: [1, 12],
};
/** Orders in a challenge (docs/02, "Ritmo"). */
const ORDER_COUNTS: Readonly<Record<Length, readonly [number, number]>> = {
  short: [4, 6],
  full: [8, 12],
};
/** Fresh parameters tried for an order before it is left out. */
const ATTEMPTS = 6;

/**
 * The budget of a challenge (docs/07 in the workspace). Difficulty: the average weight an order may have,
 * so an easy challenge is mostly light orders; hard and extreme have no ceiling. Friction (time, searching,
 * repetition) has a ceiling by length, because no profile enjoys a challenge made of chores.
 */
const DIFFICULTY_PER_ORDER: Readonly<Record<Difficulty, number>> = {
  easy: 1.5,
  medium: 2,
  hard: Infinity,
  extreme: Infinity,
};
const FRICTION_BUDGET: Readonly<Record<Length, number>> = { short: 4, full: 8 };
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
 * Generates a static challenge: draws the setup, then adds orders one at a time in a shuffled order,
 * keeping an order only when it fits the budget and the whole set still validates as comfortable. An order
 * whose parameters fail is retried with new ones, then left out (the "repair" of docs/03). Same config and
 * data, same challenge.
 */
export function generate(world: World, config: GeneratorConfig): Challenge {
  const rng = new Random(`${config.seed}|${world.dataVersion}|${GENERATOR_VERSION}`);
  const setup = drawSetup(world, config, rng);
  const domains = domainsOf(world);
  const target = rng.int(...ORDER_COUNTS[config.length]);
  const difficultyBudget = target * DIFFICULTY_PER_ORDER[config.difficulty];
  const bias = WEIGHT_BIAS[config.difficulty];

  const candidates = rng.weightedShuffle(
    catalog.filter((t: OrderTemplate) => t.validation.static !== undefined && t.optIn !== true),
    (t) => t.weight.difficulty ** bias,
  );
  let chosen: OrderInstance[] = [];
  let exceptions: readonly (readonly string[])[] = [];
  let difficulty = 0;
  let friction = 0;
  const usedAreas = new Set<string>();
  for (const template of candidates) {
    if (chosen.length >= target) break;
    // Leave room for the orders still to come, at the lightest weight.
    const after = difficulty + template.weight.difficulty + (target - chosen.length - 1);
    if (after > difficultyBudget) continue;
    if (friction + template.weight.friction > FRICTION_BUDGET[config.length]) continue;
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const args = drawArgs(template, domains, config.difficulty, rng);
      if (args === undefined) break;
      const area = args["area"];
      if (typeof area === "string" && usedAreas.has(area)) continue; // one order per area
      const next = [...chosen, { template, args }];
      const result = validate(world, setup, next);
      if (result.verdict !== "comfortable" || !result.complete) continue;
      chosen = next;
      exceptions = result.orders.map((o) => o.exceptions);
      difficulty += template.weight.difficulty;
      friction += template.weight.friction;
      if (typeof area === "string") usedAreas.add(area);
      break;
    }
  }

  const orders = chosen
    .map((o, i) => ({ ...o, exceptions: exceptions[i] ?? [] }))
    .sort((a, b) => a.template.number - b.template.number);
  return { config, dataVersion: world.dataVersion, setup, orders };
}

/**
 * One challenge for a group of players of different skill (docs/07 in the workspace): the same seed gives
 * everyone the same orders, areas, bosses, weapons, class and gift; only the numbers follow each player's
 * difficulty. The structure is generated for the hardest difficulty of the group, then eased for each
 * player. Every number is monotonic (a higher level cap, more deaths, attempts or points, fewer
 * restrictions never make a run impossible), so a structure possible for the hardest player is possible
 * for all; each eased challenge is still validated. The hardest player gets exactly the solo challenge.
 * Returns one challenge per difficulty given, in the same order.
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

  const orders: OrderInstance[] = base.orders.map(({ template, args }) => {
    const eased: Record<string, ArgValue> = { ...args };
    for (const [name, spec] of Object.entries(template.params)) {
      const arg = args[name];
      if (spec.kind === "count" && typeof arg === "number")
        eased[name] = rescale(
          arg,
          rangeOf(template, name, from),
          rangeOf(template, name, difficulty),
        );
      if (spec.kind === "restrictionList" && typeof arg === "object")
        eased[name] = fitCurse(arg, difficulty);
    }
    return { template, args: eased };
  });

  const setup = { ...base.setup, levelCap };
  const result = validate(world, setup, orders);
  if (result.verdict !== "comfortable" || !result.complete)
    throw new Error(`the ${difficulty} version of seed ${base.config.seed} does not validate`);
  return {
    config: { ...base.config, difficulty },
    dataVersion: base.dataVersion,
    setup,
    orders: orders.map((o, i) => ({ ...o, exceptions: result.orders[i]?.exceptions ?? [] })),
  };
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
