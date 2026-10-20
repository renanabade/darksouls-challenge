import {
  parseBosses,
  parseClasses,
  parseSpells,
  parseWeapons,
  type Boss,
  type StartingClass,
  type Spell,
  type Weapon,
} from "./build.js";
import { Checker } from "./check.js";
import { itemsOf, regionsOf, type Requirement } from "./requirement.js";

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
  /**
   * A corpse or chest pickup (what the catalog calls "found"), joined to the game's treasures.
   * Undefined until the data set exports it; DSAP categories cannot tell (see the pipeline's data needs).
   */
  readonly found?: boolean;
  /** weapon, armor, ring, spell, good, or other (graph events and renamed items). Undefined in older data. */
  readonly kind?: string;
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

/** A place name of the game (PlaceNames), grouping regions. */
export interface Area {
  readonly id: string;
  readonly name: string;
  readonly dlc: boolean;
}

/** A fixed point of the progression (a boss, a bell, the Lordvessel...), as a requirement on the graph. */
export interface Milestone {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly requires: Requirement;
}

export interface Merchant {
  readonly id: string;
  readonly name: string;
  /** Regions holding this merchant's shop locations. A virtual region is shared by every merchant selling there. */
  readonly regions: readonly string[];
}

export interface World {
  /** The data set's version (meta.dataVersion); part of a challenge's identity. */
  readonly dataVersion: string;
  readonly start: string;
  readonly goal: string;
  readonly regions: ReadonlyMap<string, Region>;
  readonly entrances: readonly Entrance[];
  readonly locations: readonly Location[];
  readonly gifts: readonly StartingGift[];
  readonly bosses: ReadonlyMap<string, Boss>;
  readonly merchants: ReadonlyMap<string, Merchant>;
  readonly milestones: ReadonlyMap<string, Milestone>;
  /** By name. */
  readonly weapons: ReadonlyMap<string, Weapon>;
  /** By name. */
  readonly spells: ReadonlyMap<string, Spell>;
  /** Starting classes, by name. */
  readonly classes: ReadonlyMap<string, StartingClass>;
  readonly areas: ReadonlyMap<string, Area>;
}

/** The parsed JSON of each data set file, still untrusted. Reading the files is the caller's job. */
export interface RawDataSet {
  readonly meta: unknown;
  readonly regions: unknown;
  readonly entrances: unknown;
  readonly locations: unknown;
  readonly classes: unknown;
  readonly bosses: unknown;
  readonly merchants: unknown;
  /** Absent means none: small test worlds need no milestones, weapons or area names. */
  readonly milestones?: unknown;
  readonly weapons?: unknown;
  readonly spells?: unknown;
  readonly areas?: unknown;
}

export class WorldParseError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`invalid data set (${String(problems.length)} problems):\n${problems.join("\n")}`);
    this.name = "WorldParseError";
    this.problems = problems;
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
    const location: Location = {
      name: check.string(fields, "name", path),
      region: check.string(fields, "region", path),
      item: check.string(fields, "item", path),
      count: check.integer(fields, "count", path),
      category: check.string(fields, "category", path),
      mandatory: check.boolean(fields, "mandatory", path),
    };
    locations.push({
      ...location,
      ...(fields["found"] !== undefined && { found: check.boolean(fields, "found", path) }),
      ...(fields["kind"] !== undefined && { kind: check.string(fields, "kind", path) }),
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

  const bosses = parseBosses(check, raw.bosses, (r) =>
    locations.filter((l) => l.category === "BOSS" && l.region === r).map((l) => l.item),
  );
  [...bosses.values()].forEach((b, i) => {
    region(b.region, `bosses[${String(i)}].region`);
  });

  const merchants = new Map<string, Merchant>();
  for (const [i, value] of check.array(raw.merchants, "merchants").entries()) {
    const path = `merchants[${String(i)}]`;
    const fields = check.object(value, path);
    if (fields === undefined) continue;
    const id = check.string(fields, "id", path);
    const merchantRegions: string[] = [];
    for (const [j, r] of check.array(fields["regions"], `${path}.regions`).entries()) {
      if (typeof r !== "string" || r === "") {
        check.fail(`${path}.regions[${String(j)}]`, "expected a non-empty string");
        continue;
      }
      region(r, `${path}.regions[${String(j)}]`);
      merchantRegions.push(r);
    }
    if (merchants.has(id)) check.fail(`${path}.id`, `duplicate merchant "${id}"`);
    merchants.set(id, { id, name: check.string(fields, "name", path), regions: merchantRegions });
  }

  const milestones = new Map<string, Milestone>();
  for (const [i, value] of check.array(raw.milestones ?? [], "milestones").entries()) {
    const path = `milestones[${String(i)}]`;
    const fields = check.object(value, path);
    if (fields === undefined) continue;
    const milestone: Milestone = {
      id: check.string(fields, "id", path),
      name: check.string(fields, "name", path),
      kind: check.string(fields, "kind", path),
      requires: check.requirement(fields["requires"], `${path}.requires`),
    };
    for (const item of itemsOf(milestone.requires)) {
      if (!obtainable.has(item))
        check.fail(`${path}.requires`, `item "${item}" cannot be obtained`);
    }
    if (milestones.has(milestone.id))
      check.fail(`${path}.id`, `duplicate milestone "${milestone.id}"`);
    milestones.set(milestone.id, milestone);
  }

  const weapons = parseWeapons(check, raw.weapons ?? []);
  const spells = parseSpells(check, raw.spells ?? []);
  const classList = parseClasses(check, classes["classes"] ?? []);

  const areas = new Map<string, Area>();
  for (const [i, value] of check.array(raw.areas ?? [], "areas").entries()) {
    const path = `areas[${String(i)}]`;
    const fields = check.object(value, path);
    if (fields === undefined) continue;
    const area: Area = {
      id: check.string(fields, "id", path),
      name: check.string(fields, "name", path),
      dlc: check.boolean(fields, "dlc", path),
    };
    areas.set(area.id, area);
  }

  if (check.problems.length > 0) throw new WorldParseError(check.problems);
  return {
    dataVersion: typeof meta["dataVersion"] === "string" ? meta["dataVersion"] : "",
    start,
    goal,
    regions,
    entrances,
    locations,
    gifts,
    bosses,
    merchants,
    milestones,
    weapons,
    spells,
    classes: classList,
    areas,
  };
}
