import { describe, expect, it } from "vitest";
import { parseWorld, WorldParseError, type RawDataSet } from "../src/index.js";
import { readDataSet } from "./ds1.js";

const region = (id: string, extra: object = {}) => ({
  id,
  name: id,
  area: "a",
  mandatory: false,
  ...extra,
});
const location = (regionId: string, item: string) => ({
  name: `${regionId}: ${item}`,
  region: regionId,
  item,
  count: 1,
  category: "KEY",
  mandatory: false,
});

const raw = (overrides: Partial<RawDataSet> = {}): RawDataSet => ({
  meta: { start: "cell", goal: "Boss Defeated" },
  regions: [region("cell"), region("arena"), region("shop", { area: null, virtual: true })],
  entrances: [
    { from: "cell", to: "arena", requires: { any: [{ has: "Key" }, { has: "Master Key" }] } },
    { from: "arena", to: "cell", requires: true, walkBack: false },
  ],
  locations: [location("cell", "Key"), location("arena", "Boss Defeated")],
  classes: {
    classes: [],
    gifts: [
      { row: 1, items: ["(none)"] },
      { row: 2, items: ["Master Key"] },
    ],
  },
  ...overrides,
});

const problemsOf = (data: RawDataSet): readonly string[] => {
  try {
    parseWorld(data);
  } catch (error) {
    if (error instanceof WorldParseError) return error.problems;
    throw error;
  }
  return [];
};

describe("parseWorld", () => {
  it("builds the world and applies the schema defaults", () => {
    const world = parseWorld(raw());
    expect(world.start).toBe("cell");
    expect(world.regions.get("shop")).toMatchObject({ area: null, virtual: true });
    expect(world.regions.get("cell")?.virtual).toBe(false);
    expect(world.entrances.map((e) => e.walkBack)).toEqual([true, false]);
  });

  it("reads starting gifts, with counts and the empty gift", () => {
    const classes = {
      gifts: [
        { row: 1, items: ["(none)"] },
        { row: 2, items: ["Black Firebomb x10"] },
        { row: 3, items: ["Master Key"] },
      ],
    };
    expect(parseWorld(raw({ classes })).gifts).toEqual([
      { row: 1, items: [] },
      { row: 2, items: [{ item: "Black Firebomb", count: 10 }] },
      { row: 3, items: [{ item: "Master Key", count: 1 }] },
    ]);
  });

  it("accepts an item that only a starting gift gives", () => {
    expect(problemsOf(raw())).toEqual([]);
  });

  it("reports every broken reference at once", () => {
    const problems = problemsOf(
      raw({
        meta: { start: "nowhere", goal: "Nothing" },
        entrances: [
          {
            from: "cell",
            to: "void",
            requires: { all: [{ has: "Ghost Key" }, { region: "limbo" }] },
          },
        ],
        locations: [location("cell", "Key"), location("attic", "Boss Defeated")],
      }),
    );
    expect(problems).toEqual([
      'unknown region "nowhere" at meta.start',
      'goal "Nothing" is not an item of any location at meta.goal',
      'unknown region "void" at entrances[0].to',
      'unknown region "limbo" at entrances[0].requires',
      'item "Ghost Key" cannot be obtained at entrances[0].requires',
      'unknown region "attic" at locations[1].region',
    ]);
  });

  it("reports shape problems with their path, bad requirements included", () => {
    const problems = problemsOf(
      raw({
        regions: [
          region("cell"),
          region("cell"),
          { id: "arena", name: "", area: 1, mandatory: "no" },
        ],
        entrances: [{ from: "cell", to: "arena", requires: { has: "" } }],
      }),
    );
    expect(problems).toEqual([
      'duplicate region "cell" at regions[1].id',
      "expected a non-empty string at regions[2].name",
      "expected a non-empty string at regions[2].area",
      "expected a boolean at regions[2].mandatory",
      '"has" must be a non-empty string at entrances[0].requires.has',
    ]);
  });

  it("rejects files that are not the expected containers", () => {
    expect(problemsOf(raw({ meta: [], regions: {}, classes: null }))).toEqual([
      "expected an object at meta",
      "expected a non-empty string at meta.start",
      "expected a non-empty string at meta.goal",
      "expected an array at regions",
      "expected an object at classes",
      "expected an array at classes.gifts",
      'unknown region "cell" at entrances[0].from',
      'unknown region "arena" at entrances[0].to',
      'item "Master Key" cannot be obtained at entrances[0].requires',
      'unknown region "arena" at entrances[1].from',
      'unknown region "cell" at entrances[1].to',
      'unknown region "cell" at locations[0].region',
      'unknown region "arena" at locations[1].region',
    ]);
  });

  it("loads the DS1 data set", () => {
    const world = parseWorld(readDataSet());
    expect(world.regions.size).toBeGreaterThan(100);
    expect(world.gifts.some((g) => g.items.length === 0)).toBe(true);
  });
});
