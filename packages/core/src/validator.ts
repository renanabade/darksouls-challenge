import type { Mode, OrderTemplate } from "./orders/index.js";
import { reach, type Reach } from "./reach.js";
import type { Location, StartingGift, World } from "./world.js";

/** A parameter value drawn by the generator: an id, a number, or a list of ids. */
export type ArgValue = string | number | readonly string[];

/** A catalog order with its parameters filled in. */
export interface OrderInstance {
  readonly template: OrderTemplate;
  readonly args: Readonly<Record<string, ArgValue>>;
}

/** The challenge parameters every check uses. The class and the level cap come with the build checks. */
export interface Setup {
  readonly mode: Mode;
  readonly gift: StartingGift;
}

/**
 * impossible: some order cannot be followed. unexpected: possible only with a jump, a farm or a long
 * detour. comfortable: possible as intended. The graph does not mark unexpected paths yet, so this
 * validator only answers impossible or comfortable.
 */
export type Verdict = "impossible" | "unexpected" | "comfortable";

/** graph: checked on the world graph. weightOnly: never impossible. pending: no check exists yet. */
export type Support = "graph" | "weightOnly" | "pending";

export interface OrderResult {
  readonly id: string;
  readonly support: Support;
  /** Items the order must except because the game requires them (automatic exception). */
  readonly exceptions: readonly string[];
}

export interface ValidationResult {
  readonly verdict: Verdict;
  /** Why the set is impossible; empty otherwise. */
  readonly problems: readonly string[];
  /** One result per order, in the order given. */
  readonly orders: readonly OrderResult[];
  /** True when every order was checked; a generator must not hand out a challenge with pending orders. */
  readonly complete: boolean;
}

/** A programming error in the generator: an order with missing or unknown parameters, or in the wrong mode. */
export class InvalidOrderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidOrderError";
  }
}

export const BELLS: readonly string[] = ["Bell of Awakening #1", "Bell of Awakening #2"];
/** Location categories of things bought from a merchant. */
const SHOP = new Set(["SHOP_ITEM", "SHOP_EXTENDED_ITEM", "MISSABLE_SHOP_ITEM"]);

interface Constraints {
  readonly regions: Set<string>;
  readonly locations: Set<Location>;
}

/** Returns why the constraints break the challenge, or undefined when they do not. */
type Check = (constraints: Constraints) => string | undefined;

/**
 * Validates a set of orders on the world graph. The orders are checked together: every forbidden area
 * and every forbidden pickup applies to every other check, so a combination that is impossible is
 * refused even when each order alone is possible.
 */
export function validate(
  world: World,
  setup: Setup,
  orders: readonly OrderInstance[],
): ValidationResult {
  const startItems = setup.gift.items.map((i) => i.item);
  const run = (c: Constraints, forbiddenItems?: ReadonlySet<string>): Reach =>
    reach(world, {
      items: startItems,
      forbiddenRegions: c.regions,
      forbiddenLocations: c.locations,
      ...(forbiddenItems && { forbiddenItems }),
    });

  const constraints: Constraints = { regions: new Set(), locations: new Set() };
  const checks: Check[] = [
    (c) =>
      run(c).items.has(world.goal) ? undefined : `the goal "${world.goal}" cannot be reached`,
  ];
  const failures = (c: Constraints): string[] => checks.flatMap((check) => check(c) ?? []);

  const results: { id: string; support: Support; exceptions: string[] }[] = [];
  // Orders that forbid locations but except what the game requires. Candidates are listed once every
  // order is read, because a shared shop closes only when all its merchants are closed.
  const exceptionOrders: { result: { exceptions: string[] }; candidates: () => Location[] }[] = [];
  const closedMerchants = new Set<string>();

  for (const [index, { template, args }] of orders.entries()) {
    const label = `order ${String(index)} (${template.id})`;
    const validation = template.validation[setup.mode];
    if (validation === undefined)
      throw new InvalidOrderError(`${label} does not exist in ${setup.mode} mode`);
    const result = { id: template.id, support: "graph" as Support, exceptions: [] as string[] };
    results.push(result);

    switch (template.id) {
      case "forbidden-area":
        for (const id of areaRegions(world, stringArg(args, "area", label), label))
          constraints.regions.add(id);
        break;

      case "boss-before-bell": {
        const boss = world.bosses.get(stringArg(args, "boss", label));
        if (boss === undefined) throw new InvalidOrderError(`${label}: unknown boss`);
        const bells = new Set(BELLS);
        checks.push((c) =>
          run(c, bells).items.has(boss.defeatedItem)
            ? undefined
            : `${boss.name} cannot be defeated before a bell`,
        );
        break;
      }

      case "lord-order": {
        const order = lordSoulOrder(world, args, label);
        checks.push((c) => {
          for (const [k, soul] of order.entries()) {
            const later = order.slice(k + 1);
            if (!run(c, new Set(later)).items.has(soul))
              return `${soul} cannot be obtained before ${later.join(", ")}`;
          }
          return undefined;
        });
        break;
      }

      case "nothing-from-the-ground": {
        const regions = areaRegions(world, stringArg(args, "area", label), label);
        // Without the found flag, a required pickup could be missed and an impossible order pass.
        if (world.locations.every((l) => l.found !== undefined)) {
          exceptionOrders.push({
            result,
            candidates: () =>
              world.locations.filter((l) => l.found === true && regions.has(l.region)),
          });
        } else result.support = "pending";
        break;
      }

      case "closed-merchant": {
        const merchant = world.merchants.get(stringArg(args, "merchant", label));
        if (merchant === undefined) throw new InvalidOrderError(`${label}: unknown merchant`);
        closedMerchants.add(merchant.id);
        // A shop region is closed when every merchant selling there is closed.
        const isClosed = (region: string): boolean =>
          [...world.merchants.values()].every(
            (m) => !m.regions.includes(region) || closedMerchants.has(m.id),
          );
        exceptionOrders.push({
          result,
          candidates: () =>
            world.locations.filter(
              (l) =>
                SHOP.has(l.category) && merchant.regions.includes(l.region) && isClosed(l.region),
            ),
        });
        break;
      }

      default:
        result.support = validation === "weightOnly" ? "weightOnly" : "pending";
    }
  }

  // Automatic exceptions, once every other constraint is known. Each candidate location is forbidden in
  // turn; one that breaks a check stays allowed and goes on the list. Checks only get harder as more is
  // forbidden, so every item on the list is needed by the final set: the list cannot be shortened.
  // A location two orders cover (a shop shared by two closed merchants) is decided by the first one.
  if (failures(constraints).length === 0) {
    const decided = new Set<Location>();
    for (const { result, candidates } of exceptionOrders) {
      const pickups = candidates().filter((l) => !decided.has(l));
      pickups.forEach((l) => decided.add(l));
      pickups.forEach((l) => constraints.locations.add(l));
      if (failures(constraints).length === 0) continue;
      pickups.forEach((l) => constraints.locations.delete(l));
      for (const location of pickups) {
        constraints.locations.add(location);
        if (failures(constraints).length > 0) {
          constraints.locations.delete(location);
          if (!result.exceptions.includes(location.item)) result.exceptions.push(location.item);
        }
      }
    }
  }

  const problems = failures(constraints);
  return {
    verdict: problems.length > 0 ? "impossible" : "comfortable",
    problems,
    orders: results,
    complete: results.every((r) => r.support !== "pending"),
  };
}

function stringArg(args: Readonly<Record<string, ArgValue>>, name: string, label: string): string {
  const value = args[name];
  if (typeof value !== "string") throw new InvalidOrderError(`${label}: "${name}" must be an id`);
  return value;
}

function areaRegions(world: World, area: string, label: string): Set<string> {
  const ids = [...world.regions.values()].filter((r) => r.area === area).map((r) => r.id);
  if (ids.length === 0) throw new InvalidOrderError(`${label}: unknown area "${area}"`);
  return new Set(ids);
}

/** The order argument must name every Lord Soul of the graph exactly once. */
function lordSoulOrder(
  world: World,
  args: Readonly<Record<string, ArgValue>>,
  label: string,
): readonly string[] {
  const value = args["order"];
  const souls = new Set(
    world.locations.filter((l) => l.category === "LORD_SOUL").map((l) => l.item),
  );
  if (
    !Array.isArray(value) ||
    value.length !== souls.size ||
    new Set(value).size !== value.length ||
    !value.every((soul: string) => souls.has(soul))
  ) {
    throw new InvalidOrderError(
      `${label}: "order" must list each Lord Soul once: ${[...souls].join(", ")}`,
    );
  }
  return value as readonly string[];
}
