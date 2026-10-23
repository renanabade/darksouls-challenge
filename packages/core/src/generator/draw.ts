import { elementalDefenses, isMeleeWeapon, SCHOOLS, type Boss, type Element } from "../build.js";
import type { Difficulty, OrderTemplate } from "../orders/index.js";
import { restrictions, type Tier } from "../orders/index.js";
import { reach } from "../reach.js";
import { evaluate } from "../requirement.js";
import { CRYSTAL_LIZARD, type ArgValue } from "../validator.js";
import type { Location, World } from "../world.js";
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

/**
 * Fewest corpse and chest pickups an area needs for "nothing from the ground" to cost anything: the
 * analysis of 20 generated challenges (2026-10-21) found it drawn for areas with two items.
 */
const MIN_PICKUPS = 5;
/**
 * Bonfires "one bonfire" must not hand out until their availability is modeled (issue 38, E11 and E12).
 * E11: the Firelink Shrine bonfire goes out after both bells, until Lautrec dies (flags 812 and 813,
 * flag 11500200). E12: the first Anor Londo bonfire, the Darkmoon Knightess's (object 1511960), goes out
 * with her (m15_01_00_00 Event_151). "No bonfire" still draws these areas: it never asks the player to
 * rest at one of them.
 */
const UNMODELED_BONFIRES = new Set<string>([
  "FS: Firelink Shrine Bonfire",
  "AL: Anor Londo Bonfire",
]);
/** What an errand sends the player for: equipment and spells, not consumables or keys. */
const ERRAND_KINDS = new Set(["weapon", "armor", "ring", "spell"]);
/** The restriction no chapter takes: levels are the level orders' business, and they last the whole run. */
const NOT_FOR_A_CHAPTER = new Set(["no-level-ups"]);

export interface Domains {
  readonly areas: readonly string[];
  readonly areasWithWeapons: readonly string[];
  /** Areas with armor to pick up, the only ones where "wear what you find" asks anything. */
  readonly areasWithArmor: readonly string[];
  readonly areasWithPickups: readonly string[];
  readonly areasWithBonfires: readonly string[];
  /** Areas with crystal lizards. */
  readonly areasWithLizards: readonly string[];
  /** Equipment and spells to pick up from a corpse or chest, by area (location names). */
  readonly errands: ReadonlyMap<string, readonly string[]>;
  /** How many chests each area holds, for areas with at least two. */
  readonly chestsByArea: ReadonlyMap<string, number>;
  /** The bonfires of each area with more than one, by location name. */
  readonly bonfiresByArea: ReadonlyMap<string, readonly string[]>;
  readonly bosses: readonly string[];
  /** Bosses the first bell does not need: defeating one of the others before it asks nothing. */
  readonly bossesBeforeBell: readonly string[];
  /** The elements that hurt each boss, weakest defense first (bosses with none are left out). */
  readonly bossElements: ReadonlyMap<string, readonly Element[]>;
  readonly merchants: readonly string[];
  readonly weaponLocations: readonly string[];
  /** The area of each weapon location, by the location's name. */
  readonly weaponLocationAreas: ReadonlyMap<string, string>;
  readonly weaponStyles: readonly string[];
  /** Schools of magic some spell of the data set belongs to. */
  readonly schools: readonly string[];
  readonly lordSouls: readonly string[];
}

const domainsCache = new WeakMap<World, Domains>();

/** What the generator draws from, read once per world. */
export function domainsOf(world: World): Domains {
  let domains = domainsCache.get(world);
  if (domains === undefined) domainsCache.set(world, (domains = readDomains(world)));
  return domains;
}

function readDomains(world: World): Domains {
  const sorted = (xs: Iterable<string>): string[] => [...new Set(xs)].sort();
  const counts = (xs: readonly string[]): Map<string, number> => {
    const tally = new Map<string, number>();
    for (const x of [...xs].sort()) tally.set(x, (tally.get(x) ?? 0) + 1);
    return tally;
  };
  const areaOf = (region: string): string | null => world.regions.get(region)?.area ?? null;
  const areasOf = (locations: readonly Location[]): string[] =>
    sorted(locations.flatMap((l) => areaOf(l.region) ?? []));
  const found = world.locations.filter((l) => l.found === true);
  const bonfires = world.locations.filter((l) => l.category === "BONFIRE");
  const stableBonfires = bonfires.filter((l) => !UNMODELED_BONFIRES.has(l.name));
  const weaponLocations = found.filter((l) => {
    const weapon = world.weapons.get(l.item);
    return weapon !== undefined && isMeleeWeapon(weapon);
  });
  const pickups = new Map<string, number>();
  for (const area of found.flatMap((l) => areaOf(l.region) ?? []))
    pickups.set(area, (pickups.get(area) ?? 0) + 1);
  const bell = world.milestones.get("bell-undead-parish");
  // The graph has no boss gates yet (data need G7): a bell in the same region as a boss can be rung, by
  // the graph, without defeating the boss. Such a boss is taken as one the bell needs.
  const bellRegions = new Set(
    world.locations.filter((l) => l.item.startsWith("Bell of Awakening")).map((l) => l.region),
  );
  const ringable = (boss: Boss): boolean => {
    if (bell === undefined) return true;
    // The first boss opens the run, a gate the graph does not hold either.
    if (bellRegions.has(boss.region) || `boss-${boss.id}` === RUN_START) return false;
    const r = reach(world, { forbiddenItems: new Set([boss.defeatedItem]) });
    return evaluate(bell.requires, {
      has: (i) => r.items.has(i),
      reached: (id) => r.regions.has(id),
    });
  };
  return {
    areas: sorted([...world.regions.values()].flatMap((r) => (r.area === null ? [] : [r.area]))),
    areasWithWeapons: areasOf(weaponLocations),
    areasWithArmor: areasOf(found.filter((l) => l.kind === "armor")),
    areasWithPickups: sorted([...pickups].filter(([, n]) => n >= MIN_PICKUPS).map(([a]) => a)),
    areasWithBonfires: areasOf(bonfires),
    areasWithLizards: areasOf(world.locations.filter((l) => l.category === CRYSTAL_LIZARD)),
    errands: new Map(
      sorted(found.flatMap((l) => areaOf(l.region) ?? [])).flatMap((area) => {
        const names = sorted(
          found
            .filter((l) => areaOf(l.region) === area && ERRAND_KINDS.has(l.kind ?? ""))
            .map((l) => l.name),
        );
        return names.length > 0 ? [[area, names] as const] : [];
      }),
    ),
    chestsByArea: new Map(
      [...counts(world.chests.flatMap((c) => areaOf(c.region) ?? []))].filter(([, n]) => n >= 2),
    ),
    bonfiresByArea: new Map(
      sorted(stableBonfires.flatMap((l) => areaOf(l.region) ?? []))
        .map(
          (area) =>
            [
              area,
              sorted(stableBonfires.filter((l) => areaOf(l.region) === area).map((l) => l.name)),
            ] as const,
        )
        .filter(([, names]) => names.length > 1),
    ),
    bosses: sorted(world.bosses.keys()),
    bossesBeforeBell: sorted([...world.bosses.values()].filter(ringable).map((b) => b.id)),
    // Not the bosses the graph lets the run pass without (G7): what "before the boss" holds would be wrong.
    bossElements: new Map(
      [...world.bosses.values()].flatMap((b) => {
        if (bellRegions.has(b.region) || `boss-${b.id}` === RUN_START) return [];
        const elements = elementalDefenses(b).map((d) => d.element);
        return elements.length > 0 ? [[b.id, elements] as const] : [];
      }),
    ),
    merchants: sorted(world.merchants.keys()),
    weaponLocations: sorted(weaponLocations.map((l) => l.name)),
    weaponLocationAreas: new Map(
      weaponLocations.flatMap((l) => {
        const area = areaOf(l.region);
        return area === null ? [] : [[l.name, area] as const];
      }),
    ),
    weaponStyles: sorted([...world.weapons.values()].filter(isMeleeWeapon).map((w) => w.category)),
    schools: SCHOOLS.filter((s) => [...world.spells.values()].some((spell) => spell.school === s)),
    lordSouls: sorted(world.locations.filter((l) => l.category === "LORD_SOUL").map((l) => l.item)),
  };
}

/** Where an order is drawn: its difficulty, and the chapter it belongs to (none for the whole journey). */
export interface DrawContext {
  readonly difficulty: Difficulty;
  readonly chapter?: {
    /** The milestone the chapter starts after, and the one that ends it. */
    readonly from: string;
    readonly until: string;
    readonly areas: readonly string[];
    readonly requiredAreas: readonly string[];
    readonly bosses: readonly string[];
    /** Areas of this chapter and the ones before it, where a weapon for it can come from. */
    readonly areasSoFar: readonly string[];
  };
  /** True when the level cap is the class's level: no order about levels would ask anything. */
  readonly levelsLocked: boolean;
}

/** Parameters for one order, or undefined when the order cannot be drawn here. */
export function drawArgs(
  template: OrderTemplate,
  domains: Domains,
  context: DrawContext,
  rng: Random,
): Record<string, ArgValue> | undefined {
  const { difficulty, chapter } = context;
  if (chapter !== undefined) return drawInChapter(template, domains, context, chapter, rng);
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
    case "accumulated-curse": {
      const ids = restrictions
        .map((r) => r.id)
        .filter((id) => !(context.levelsLocked && id === "no-level-ups"))
        .sort();
      return { restrictions: fitCurse(rng.shuffle(ids), difficulty) };
    }
    case "phase-swap": {
      // Schools of magic from medium up: switching to magic costs attributes, a catalyst and spells to buy,
      // which punishes a casual player and is the novelty a bored veteran looks for (docs/07, workspace).
      const styles = [...domains.weaponStyles, ...(difficulty === "easy" ? [] : domains.schools)];
      const [before, after] = rng.shuffle(styles.sort());
      return {
        milestone: rng.pick(STRETCH_ENDS.slice(0, -1)),
        before: before ?? "",
        after: after ?? "",
      };
    }
    case "lord-order":
      return { order: rng.shuffle(domains.lordSouls) };
    case "earned-levels":
      if (context.levelsLocked) return undefined;
      return { condition: rng.pick(CONDITIONS), points: count("points") };
    case "earned-upgrades":
      return {};
    default:
      return undefined;
  }
}

/**
 * An order of one chapter: its area or boss comes from the chapter, and a phase is the chapter itself.
 * An easy chapter keeps to the areas its goal needs: a casual player may never visit a detour, and an
 * order there would ask nothing of them (docs/07 in the workspace).
 */
function drawInChapter(
  template: OrderTemplate,
  domains: Domains,
  context: DrawContext,
  chapter: NonNullable<DrawContext["chapter"]>,
  rng: Random,
): Record<string, ArgValue> | undefined {
  const { difficulty } = context;
  const pool =
    difficulty === "easy" && chapter.requiredAreas.length > 0
      ? chapter.requiredAreas
      : chapter.areas;
  const areaFrom = (domain: readonly string[]): string | undefined => {
    const areas = pool.filter((a) => domain.includes(a));
    return areas.length > 0 ? rng.pick(areas) : undefined;
  };
  const boss = (): string | undefined =>
    chapter.bosses.length > 0 ? rng.pick(chapter.bosses) : undefined;
  const one = <K extends string>(name: K, value: string | undefined) =>
    value === undefined ? undefined : ({ [name]: value } as Record<K, string>);
  switch (template.id) {
    case "first-weapon-of-area": {
      const area = areaFrom(domains.areasWithWeapons);
      return area === undefined ? undefined : { area, until: chapter.until };
    }
    case "assigned-weapon": {
      const locations = domains.weaponLocations.filter((name) =>
        chapter.areasSoFar.includes(domains.weaponLocationAreas.get(name) ?? ""),
      );
      if (locations.length === 0) return undefined;
      return { from: chapter.from, until: chapter.until, location: rng.pick(locations) };
    }
    case "wear-what-you-find":
      return one("area", areaFrom(domains.areasWithArmor));
    case "nothing-from-the-ground":
      return one("area", areaFrom(domains.areasWithPickups));
    case "no-bonfire":
      return one("area", areaFrom(domains.areasWithBonfires));
    case "lizard-hunt": {
      const area = areaFrom(domains.areasWithLizards);
      return area === undefined ? undefined : { area, until: chapter.until };
    }
    case "every-chest": {
      const area = areaFrom([...domains.chestsByArea.keys()]);
      const chests = area === undefined ? undefined : domains.chestsByArea.get(area);
      return area === undefined || chests === undefined
        ? undefined
        : { area, chests, until: chapter.until };
    }
    case "errand": {
      const area = areaFrom([...domains.errands.keys()]);
      const names = area === undefined ? undefined : domains.errands.get(area);
      return names === undefined ? undefined : { location: rng.pick(names), until: chapter.until };
    }
    // A detour of the chapter, or a way through it that has another: the graph decides which.
    case "the-other-way": {
      const areas = chapter.areas.filter((a) => !chapter.requiredAreas.includes(a));
      return areas.length > 0 ? { area: rng.pick(areas), until: chapter.until } : undefined;
    }
    case "one-bonfire": {
      const area = areaFrom([...domains.bonfiresByArea.keys()]);
      const bonfires = area === undefined ? undefined : domains.bonfiresByArea.get(area);
      return area === undefined || bonfires === undefined
        ? undefined
        : { area, bonfire: rng.pick(bonfires) };
    }
    case "dry-fight":
      return one("boss", boss());
    case "counted-attempts": {
      const b = boss();
      if (b === undefined) return undefined;
      return { attempts: rng.int(...rangeOf(template, "attempts", difficulty)), boss: b };
    }
    // The element comes from the boss: the one it defends worst, or the one it resists most (when that is
    // another element).
    case "exploit-weakness":
    case "against-the-grain": {
      const weakest = template.id === "exploit-weakness";
      const options = chapter.bosses.filter(
        (b) => (domains.bossElements.get(b)?.length ?? 0) > (weakest ? 0 : 1),
      );
      if (options.length === 0) return undefined;
      const b = rng.pick(options);
      const elements = domains.bossElements.get(b) ?? [];
      const element = weakest ? elements[0] : elements.at(-1);
      return element === undefined ? undefined : { boss: b, element };
    }
    case "boss-before-bell": {
      // A boss of this chapter: with detours drawn among chapters, the others may be met later.
      const bosses = domains.bossesBeforeBell.filter((b) => chapter.bosses.includes(b));
      return bosses.length > 0 ? { boss: rng.pick(bosses) } : undefined;
    }
    case "chapter-restriction": {
      const tiers = CURSE[difficulty].tiers;
      const ids = restrictions
        .filter((r) => tiers.includes(r.tier) && !NOT_FOR_A_CHAPTER.has(r.id))
        .map((r) => r.id)
        .sort();
      return { from: chapter.from, until: chapter.until, restriction: rng.pick(ids) };
    }
    default:
      return undefined;
  }
}
