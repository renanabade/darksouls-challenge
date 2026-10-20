import { catalog, type Difficulty, type OrderTemplate } from "../orders/index.js";
import { validate, type ArgValue, type OrderInstance, type Setup } from "../validator.js";
import type { StartingGift, World } from "../world.js";
import { domainsOf, drawArgs } from "./draw.js";
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
export const GENERATOR_VERSION = "1";

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
 * Generates a static challenge: draws the setup, then adds orders one at a time in a shuffled order,
 * keeping an order only when the whole set still validates as comfortable. An order whose parameters fail
 * is retried with new ones, then left out (the "repair" of docs/03). Same config and data, same challenge.
 */
export function generate(world: World, config: GeneratorConfig): Challenge {
  const rng = new Random(`${config.seed}|${world.dataVersion}|${GENERATOR_VERSION}`);
  const setup = drawSetup(world, config, rng);
  const domains = domainsOf(world);
  const target = rng.int(...(ORDER_COUNTS[config.length] as [number, number]));

  const candidates = rng.shuffle(
    catalog.filter((t: OrderTemplate) => t.validation.static !== undefined && t.optIn !== true),
  );
  let chosen: OrderInstance[] = [];
  let exceptions: readonly (readonly string[])[] = [];
  const usedAreas = new Set<string>();
  for (const template of candidates) {
    if (chosen.length >= target) break;
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
      if (typeof area === "string") usedAreas.add(area);
      break;
    }
  }

  const orders = chosen
    .map((o, i) => ({ ...o, exceptions: exceptions[i] ?? [] }))
    .sort((a, b) => a.template.number - b.template.number);
  return { config, dataVersion: world.dataVersion, setup, orders };
}

function drawSetup(world: World, config: GeneratorConfig, rng: Random): Required<Setup> {
  const classes = [...world.classes.keys()].sort();
  const startingClass = config.startingClass ?? rng.pick(classes);
  const level = world.classes.get(startingClass)?.level;
  if (level === undefined) throw new Error(`unknown class "${startingClass}"`);
  const gifts = [...world.gifts].sort((a, b) => a.row - b.row);
  const gift: StartingGift | undefined =
    config.giftRow === undefined ? rng.pick(gifts) : gifts.find((g) => g.row === config.giftRow);
  if (gift === undefined) throw new Error(`unknown gift row ${String(config.giftRow)}`);
  const levelCap = Math.max(
    level,
    config.levelCap ?? rng.int(...(LEVEL_CAPS[config.difficulty] as [number, number])),
  );
  return { mode: "static", gift, startingClass, levelCap };
}
