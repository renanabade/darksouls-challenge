import { isMeleeWeapon } from "../build.js";
import type { Difficulty, OrderTemplate } from "../orders/index.js";
import { restrictions, type Tier } from "../orders/index.js";
import type { ArgValue } from "../validator.js";
import type { World } from "../world.js";
import type { Random } from "./random.js";

/**
 * Draws the parameters of an order from the game data. Every list is sorted before it is drawn from, so
 * the result depends only on the seed. Count ranges live in the catalog; they and the curse budgets are
 * first estimates (Proposto, to tune by playing).
 */

/** Easiest to hardest. */
export const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard", "extreme"];

/** The ends of the five stretches of a run (docs/02, "Ritmo"). */
export const STRETCH_ENDS = [
  "bell-undead-parish",
  "both-bells",
  "lordvessel-obtained",
  "lordvessel-placed",
  "kiln-open",
] as const;
const RUN_START = "boss-asylum-demon";

/**
 * The accumulated curse is drawn by weight, not by size (docs/07 in the workspace): each tier costs
 * points, and each difficulty has a budget and the tiers it may draw from. An easy curse holds only light
 * restrictions; an extreme one can stack the heavy ones.
 */
const TIER_COST: Readonly<Record<Tier, number>> = { light: 1, medium: 2, heavy: 3 };
const CURSE: Readonly<Record<Difficulty, { budget: number; tiers: readonly Tier[] }>> = {
  easy: { budget: 2, tiers: ["light"] },
  medium: { budget: 4, tiers: ["light", "medium"] },
  hard: { budget: 7, tiers: ["light", "medium", "heavy"] },
  extreme: { budget: 10, tiers: ["light", "medium", "heavy"] },
};
export const CONDITIONS = [
  "on your first attempt",
  "without drinking Estus",
  "without summoning help",
] as const;

/** The range a count parameter is drawn from at a difficulty. */
export function rangeOf(
  template: OrderTemplate,
  param: string,
  difficulty: Difficulty,
): readonly [number, number] {
  const range = template.params[param]?.ranges?.[difficulty];
  if (range === undefined) throw new Error(`no range for ${template.id}.${param}`);
  return range;
}

/**
 * A curse built in layers, one per difficulty up to the given one: the easy layer first, then what the
 * medium budget adds, and so on, each taking restrictions in the given order while they fit. So the curse
 * grows harder boss by boss, and fitting a harder curse to an easier difficulty gives back exactly its
 * first layers, never an empty list: what the group handicap relies on.
 */
export function fitCurse(ids: readonly string[], difficulty: Difficulty): string[] {
  const fitted: string[] = [];
  let spent = 0;
  for (const level of DIFFICULTIES.slice(0, DIFFICULTIES.indexOf(difficulty) + 1)) {
    const { budget, tiers } = CURSE[level];
    for (const id of ids) {
      const tier = restrictions.find((r) => r.id === id)?.tier;
      if (tier === undefined || !tiers.includes(tier) || fitted.includes(id)) continue;
      if (spent + TIER_COST[tier] > budget) continue;
      fitted.push(id);
      spent += TIER_COST[tier];
    }
  }
  return fitted;
}

export interface Domains {
  readonly areas: readonly string[];
  readonly areasWithWeapons: readonly string[];
  readonly bosses: readonly string[];
  readonly merchants: readonly string[];
  readonly weaponLocations: readonly string[];
  readonly weaponStyles: readonly string[];
  readonly lordSouls: readonly string[];
}

export function domainsOf(world: World): Domains {
  const sorted = (xs: Iterable<string>): string[] => [...new Set(xs)].sort();
  const areaOf = (region: string): string | null => world.regions.get(region)?.area ?? null;
  const weaponLocations = world.locations.filter((l) => {
    const weapon = world.weapons.get(l.item);
    return l.found === true && weapon !== undefined && isMeleeWeapon(weapon);
  });
  return {
    areas: sorted([...world.regions.values()].flatMap((r) => (r.area === null ? [] : [r.area]))),
    areasWithWeapons: sorted(weaponLocations.flatMap((l) => areaOf(l.region) ?? [])),
    bosses: sorted(world.bosses.keys()),
    merchants: sorted(world.merchants.keys()),
    weaponLocations: sorted(weaponLocations.map((l) => l.name)),
    weaponStyles: sorted([...world.weapons.values()].filter(isMeleeWeapon).map((w) => w.category)),
    lordSouls: sorted(world.locations.filter((l) => l.category === "LORD_SOUL").map((l) => l.item)),
  };
}

/** Parameters for one order, or undefined when the order is not generated (live only, opt-in). */
export function drawArgs(
  template: OrderTemplate,
  domains: Domains,
  difficulty: Difficulty,
  rng: Random,
): Record<string, ArgValue> | undefined {
  const count = (param: string): number => rng.int(...rangeOf(template, param, difficulty));
  const stretch = (): { from: string; until: string } => {
    const i = rng.int(0, STRETCH_ENDS.length - 1);
    return {
      from: i === 0 ? RUN_START : (STRETCH_ENDS[i - 1] as string),
      until: STRETCH_ENDS[i] as string,
    };
  };
  switch (template.id) {
    case "first-weapon-of-area":
      return { area: rng.pick(domains.areasWithWeapons), until: rng.pick(STRETCH_ENDS) };
    case "assigned-weapon":
      return { ...stretch(), location: rng.pick(domains.weaponLocations) };
    case "wear-what-you-find":
    case "nothing-from-the-ground":
    case "no-bonfire":
    case "forbidden-area":
      return { area: rng.pick(domains.areas) };
    case "dry-fight":
    case "boss-before-bell":
      return { boss: rng.pick(domains.bosses) };
    case "closed-merchant":
      return { merchant: rng.pick(domains.merchants) };
    case "counted-attempts":
      return { attempts: count("attempts"), boss: rng.pick(domains.bosses) };
    case "run-lives":
      return { deaths: count("deaths") };
    case "accumulated-curse":
      return {
        restrictions: fitCurse(rng.shuffle(restrictions.map((r) => r.id).sort()), difficulty),
      };
    case "phase-swap": {
      const [before, after] = rng.shuffle(domains.weaponStyles);
      return {
        milestone: rng.pick(STRETCH_ENDS.slice(0, -1)),
        before: before ?? "",
        after: after ?? "",
      };
    }
    case "lord-order":
      return { order: rng.shuffle(domains.lordSouls) };
    case "earned-levels":
      return { condition: rng.pick(CONDITIONS), points: count("points") };
    case "earned-upgrades":
      return {};
    default:
      return undefined;
  }
}
