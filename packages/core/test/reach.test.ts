import { describe, expect, it } from "vitest";
import { parseWorld, reach, type World } from "../src/index.js";
import { readDataSet, readMandatory } from "./ds1.js";

/** start → a (needs Key, found in start) → b (needs Gem, found in a); c needs b reached and the Gem. */
const small: World = parseWorld({
  meta: { start: "start", goal: "Gem" },
  regions: ["start", "a", "b", "c"].map((id) => ({ id, name: id, area: "x", mandatory: false })),
  entrances: [
    { from: "start", to: "a", requires: { has: "Key" } },
    { from: "a", to: "b", requires: { any: [{ has: "Gem" }, { has: "Lockpick" }] } },
    { from: "a", to: "c", requires: { all: [{ region: "b" }, { has: "Gem" }] } },
    { from: "start", to: "c", requires: false },
  ],
  locations: [
    { name: "1", region: "start", item: "Key", count: 1, category: "KEY", mandatory: true },
    { name: "2", region: "a", item: "Gem", count: 1, category: "KEY", mandatory: true },
  ],
  classes: { gifts: [{ row: 1, items: ["Lockpick"] }] },
});

const sorted = (set: ReadonlySet<string>): string[] => [...set].sort();

describe("reach", () => {
  it("opens paths with items picked up on the way, round after round", () => {
    const result = reach(small);
    expect(sorted(result.regions)).toEqual(["a", "b", "c", "start"]);
    expect(sorted(result.items)).toEqual(["Gem", "Key"]);
  });

  it("never takes forbidden items, so what they open stays closed", () => {
    expect(sorted(reach(small, { forbiddenItems: new Set(["Key"]) }).regions)).toEqual(["start"]);
    expect(sorted(reach(small, { forbiddenItems: new Set(["Gem"]) }).regions)).toEqual([
      "a",
      "start",
    ]);
  });

  it("uses starting items as alternatives", () => {
    const result = reach(small, { items: ["Lockpick"], forbiddenItems: new Set(["Gem"]) });
    expect(sorted(result.regions)).toEqual(["a", "b", "start"]);
  });

  it("never enters forbidden regions, nor goes through them", () => {
    expect(sorted(reach(small, { forbiddenRegions: new Set(["a"]) }).regions)).toEqual(["start"]);
  });
});

describe("reach on the DS1 data set", () => {
  const world = parseWorld(readDataSet());
  const mandatory = readMandatory();

  it.each(world.gifts.map((g) => [g.row, g.items.map((i) => i.item)] as const))(
    "reaches every region and the goal with starting gift %i",
    (_row, items) => {
      const result = reach(world, { items });
      expect([...world.regions.keys()].filter((id) => !result.regions.has(id))).toEqual([]);
      expect(result.items.has(world.goal)).toBe(true);
    },
  );

  // Cross-check with the pipeline's removal analysis (mandatory.json), computed in another language.
  // The pipeline leaves out what is mandatory by definition: the goal itself and the start region.
  it("finds the same mandatory items as the pipeline", () => {
    const items = new Set(world.locations.map((l) => l.item));
    items.delete(world.goal);
    const found = [...items].filter(
      (item) => !reach(world, { forbiddenItems: new Set([item]) }).items.has(world.goal),
    );
    expect(found.sort()).toEqual([...mandatory.items].sort());
  });

  it("finds the same mandatory regions as the pipeline", () => {
    const found = [...world.regions.keys()].filter(
      (id) =>
        id !== world.start &&
        !reach(world, { forbiddenRegions: new Set([id]) }).items.has(world.goal),
    );
    expect(found.sort()).toEqual([...mandatory.regions].sort());
  });
});
