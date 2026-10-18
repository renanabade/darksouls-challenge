import {
  itemsOf,
  parseRequirement,
  regionsOf,
  RequirementParseError,
  type Requirement,
} from "./requirement.js";

/**
 * The world graph the core works on, built from data/ds1 (see its SCHEMA.md).
 * Only the fields the core uses are kept; the rest of each file stays in the data set.
 */
export interface Region {
  readonly id: string;
  readonly name: string;
  /** Null only for virtual shop-logic nodes. */
  readonly area: string | null;
  readonly mandatory: boolean;
  readonly virtual: boolean;
}

export interface Entrance {
  readonly from: string;
  readonly to: string;
  readonly requires: Requirement;
  /** False when the way back on foot is known not to exist. The way back, when it exists, is its own entrance. */
  readonly walkBack: boolean;
}

export interface Location {
  readonly name: string;
  readonly region: string;
  readonly item: string;
  readonly count: number;
  readonly category: string;
  readonly mandatory: boolean;
}

export interface GiftItem {
  readonly item: string;
  readonly count: number;
}

/** A starting gift. "(none)" is a gift with no items. */
export interface StartingGift {
  readonly row: number;
  readonly items: readonly GiftItem[];
}

export interface World {
  readonly start: string;
  readonly goal: string;
  readonly regions: ReadonlyMap<string, Region>;
  readonly entrances: readonly Entrance[];
  readonly locations: readonly Location[];
  readonly gifts: readonly StartingGift[];
}

/** The parsed JSON of each data set file, still untrusted. Reading the files is the caller's job. */
export interface RawDataSet {
  readonly meta: unknown;
  readonly regions: unknown;
  readonly entrances: unknown;
  readonly locations: unknown;
  readonly classes: unknown;
}

export class WorldParseError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`invalid data set (${String(problems.length)} problems):\n${problems.join("\n")}`);
    this.name = "WorldParseError";
    this.problems = problems;
  }
}

type Fields = Readonly<Record<string, unknown>>;

/** Collects every problem instead of stopping at the first, so one pipeline run can fix them all. */
class Checker {
  readonly problems: string[] = [];

  fail(path: string, message: string): void {
    this.problems.push(`${message} at ${path}`);
  }

  array(value: unknown, path: string): readonly unknown[] {
    if (Array.isArray(value)) return value;
    this.fail(path, "expected an array");
    return [];
  }

  object(value: unknown, path: string): Fields | undefined {
    if (typeof value === "object" && value !== null && !Array.isArray(value))
      return value as Fields;
    this.fail(path, "expected an object");
    return undefined;
  }

  string(fields: Fields, key: string, path: string): string {
    const value = fields[key];
    if (typeof value === "string" && value !== "") return value;
    this.fail(`${path}.${key}`, "expected a non-empty string");
    return "";
  }

  nullableString(fields: Fields, key: string, path: string): string | null {
    return fields[key] === null ? null : this.string(fields, key, path);
  }

  boolean(fields: Fields, key: string, path: string, fallback?: boolean): boolean {
    const value = fields[key];
    if (typeof value === "boolean") return value;
    if (value === undefined && fallback !== undefined) return fallback;
    this.fail(`${path}.${key}`, "expected a boolean");
    return false;
  }

  integer(fields: Fields, key: string, path: string): number {
    const value = fields[key];
    if (Number.isInteger(value)) return value as number;
    this.fail(`${path}.${key}`, "expected an integer");
    return 0;
  }

  requirement(value: unknown, path: string): Requirement {
    try {
      return parseRequirement(value, path);
    } catch (error) {
      if (!(error instanceof RequirementParseError)) throw error;
      this.problems.push(error.message);
      return false;
    }
  }
}

/** "Black Firebomb x10" → 10 Black Firebombs; "(none)" → nothing. */
function parseGiftItem(text: string): GiftItem | undefined {
  if (text === "(none)") return undefined;
  const match = /^(.+) x(\d+)$/.exec(text);
  return match?.[1] !== undefined && match[2] !== undefined
    ? { item: match[1], count: Number(match[2]) }
    : { item: text, count: 1 };
}

/**
 * Turns the data set into a World, checking shapes and cross-file references:
 * every region id points to a region, every `has` names an obtainable item, start and goal exist.
 * Throws a WorldParseError listing every problem found.
 */
export function parseWorld(raw: RawDataSet): World {
  const check = new Checker();

  const meta = check.object(raw.meta, "meta") ?? {};
  const start = check.string(meta, "start", "meta");
  const goal = check.string(meta, "goal", "meta");

  const regions = new Map<string, Region>();
  for (const [i, value] of check.array(raw.regions, "regions").entries()) {
    const path = `regions[${String(i)}]`;
    const fields = check.object(value, path);
    if (fields === undefined) continue;
    const region: Region = {
      id: check.string(fields, "id", path),
      name: check.string(fields, "name", path),
      area: check.nullableString(fields, "area", path),
      mandatory: check.boolean(fields, "mandatory", path),
      virtual: check.boolean(fields, "virtual", path, false),
    };
    if (regions.has(region.id)) check.fail(`${path}.id`, `duplicate region "${region.id}"`);
    regions.set(region.id, region);
  }

  const entrances: Entrance[] = [];
  for (const [i, value] of check.array(raw.entrances, "entrances").entries()) {
    const path = `entrances[${String(i)}]`;
    const fields = check.object(value, path);
    if (fields === undefined) continue;
    entrances.push({
      from: check.string(fields, "from", path),
      to: check.string(fields, "to", path),
      requires: check.requirement(fields["requires"], `${path}.requires`),
      walkBack: check.boolean(fields, "walkBack", path, true),
    });
  }

  const locations: Location[] = [];
  for (const [i, value] of check.array(raw.locations, "locations").entries()) {
    const path = `locations[${String(i)}]`;
    const fields = check.object(value, path);
    if (fields === undefined) continue;
    locations.push({
      name: check.string(fields, "name", path),
      region: check.string(fields, "region", path),
      item: check.string(fields, "item", path),
      count: check.integer(fields, "count", path),
      category: check.string(fields, "category", path),
      mandatory: check.boolean(fields, "mandatory", path),
    });
  }

  const gifts: StartingGift[] = [];
  const classes = check.object(raw.classes, "classes") ?? {};
  for (const [i, value] of check.array(classes["gifts"], "classes.gifts").entries()) {
    const path = `classes.gifts[${String(i)}]`;
    const fields = check.object(value, path);
    if (fields === undefined) continue;
    const items: GiftItem[] = [];
    for (const [j, text] of check.array(fields["items"], `${path}.items`).entries()) {
      if (typeof text !== "string" || text === "") {
        check.fail(`${path}.items[${String(j)}]`, "expected a non-empty string");
        continue;
      }
      const item = parseGiftItem(text);
      if (item !== undefined) items.push(item);
    }
    gifts.push({ row: check.integer(fields, "row", path), items });
  }

  // Cross-file references. Shape problems above already have their own message, so empty ids are skipped.
  const obtainable = new Set([
    ...locations.map((l) => l.item),
    ...gifts.flatMap((g) => g.items.map((i) => i.item)),
  ]);
  const region = (id: string, path: string): void => {
    if (id !== "" && !regions.has(id)) check.fail(path, `unknown region "${id}"`);
  };
  region(start, "meta.start");
  if (goal !== "" && !locations.some((l) => l.item === goal)) {
    check.fail("meta.goal", `goal "${goal}" is not an item of any location`);
  }
  for (const [i, e] of entrances.entries()) {
    const path = `entrances[${String(i)}]`;
    region(e.from, `${path}.from`);
    region(e.to, `${path}.to`);
    for (const id of regionsOf(e.requires)) region(id, `${path}.requires`);
    for (const item of itemsOf(e.requires)) {
      if (!obtainable.has(item))
        check.fail(`${path}.requires`, `item "${item}" cannot be obtained`);
    }
  }
  for (const [i, l] of locations.entries()) region(l.region, `locations[${String(i)}].region`);

  if (check.problems.length > 0) throw new WorldParseError(check.problems);
  return { start, goal, regions, entrances, locations, gifts };
}
