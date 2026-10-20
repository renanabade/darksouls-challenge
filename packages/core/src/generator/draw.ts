import { isMeleeWeapon } from "../build.js";
import type { Difficulty, OrderTemplate } from "../orders/index.js";
import { restrictions } from "../orders/index.js";
import type { ArgValue } from "../validator.js";
import type { World } from "../world.js";
import type { Random } from "./random.js";

/**
 * Draws the parameters of an order from the game data. Every list is sorted before it is drawn from, so
 * the result depends only on the seed. Ranges not in the catalog are first estimates (Proposto, to tune by
 * playing).
 */

/** The ends of the five stretches of a run (docs/02, "Ritmo"). */
export const STRETCH_ENDS = [
  "bell-undead-parish",
  "both-bells",
  "lordvessel-obtained",
  "lordvessel-placed",
  "kiln-open",
] as const;
const RUN_START = "boss-asylum-demon";

const COUNT_RANGES: Readonly<
  Record<string, Readonly<Record<Difficulty, readonly [number, number]>>>
> = {
  deaths: { easy: [25, 35], medium: [12, 20], hard: [5, 10], extreme: [1, 3] },
  points: { easy: [3, 4], medium: [2, 3], hard: [1, 2], extreme: [1, 1] },
};
const CURSE_LENGTH: Readonly<Record<Difficulty, number>> = {
  easy: 2,
  medium: 3,
  hard: 4,
  extreme: 5,
};
export const CONDITIONS = [
  "on your first attempt",
  "without drinking Estus",
  "without summoning help",
] as const;

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
  const count = (param: string): number => {
    const range = template.params[param]?.ranges?.[difficulty] ?? COUNT_RANGES[param]?.[difficulty];
    if (range === undefined) throw new Error(`no range for ${template.id}.${param}`);
    return rng.int(range[0], range[1]);
  };
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
        restrictions: rng
          .shuffle(restrictions.map((r) => r.id).sort())
          .slice(0, CURSE_LENGTH[difficulty]),
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
