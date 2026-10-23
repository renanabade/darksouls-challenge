import { describe, expect, it } from "vitest";
import { parseWorld, reach, startingItems, type World } from "../src/index.js";
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
  bosses: [],
  merchants: [],
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

  // start → boss (its death item) → after; start → shop, which closes for good once the boss is dead.
  // The shop needs a Flame, found either at the start or only past the boss.
  const closing = (flameAt: "start" | "after"): World =>
    parseWorld({
      meta: { start: "start", goal: "Boss Defeated" },
      regions: ["start", "boss", "after", "shop"].map((id) => ({
        id,
        name: id,
        area: "x",
        mandatory: false,
      })),
      entrances: [
        { from: "start", to: "boss", requires: true },
        { from: "boss", to: "after", requires: { has: "Boss Defeated" } },
        { from: "start", to: "shop", requires: { has: "Flame" }, before: "Boss Defeated" },
      ],
      locations: [
        {
          name: "1",
          region: "boss",
          item: "Boss Defeated",
          count: 1,
          category: "BOSS",
          mandatory: true,
        },
        { name: "2", region: flameAt, item: "Flame", count: 1, category: "KEY", mandatory: false },
      ],
      classes: { gifts: [] },
      bosses: [],
      merchants: [],
    });

  it("crosses an entrance that closes on an item only if it opens without that item", () => {
    expect(reach(closing("start")).regions.has("shop")).toBe(true);
    expect(reach(closing("after")).regions.has("shop")).toBe(false);
    expect(reach(closing("after"), { items: ["Flame"] }).regions.has("shop")).toBe(true);
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

  // Issue 38, E1/E2: the golem that holds Dusk appears once the Hydra is dead, and the Broken Pendant that opens
  // the DLC drops only after Dusk is freed.
  it("chains the Hydra, Dusk, the Broken Pendant and the DLC", () => {
    const withoutHydra = reach(world, {
      forbiddenItems: new Set(["Darkroot Basin Hydra Defeated"]),
    });
    expect(withoutHydra.regions.has("darkroot-basin")).toBe(true);
    for (const closed of ["darkroot-basin-princess-dusk", "sanctuary-garden", "oolacile-township"])
      expect(withoutHydra.regions.has(closed), closed).toBe(false);
    expect(withoutHydra.items.has("Broken Pendant")).toBe(false);
    expect(withoutHydra.items.has(world.goal)).toBe(true);
  });

  // E4/E5: the Bell Gargoyles' and the Centipede Demon's exit fogs go only on their death.
  it("waits for the Bell Gargoyles and the Centipede Demon", () => {
    const without = (boss: string) =>
      reach(world, { forbiddenItems: new Set([`${boss} Defeated`]) });
    const gargoyles = without("Bell Gargoyles");
    expect(gargoyles.items.has("Bell of Awakening #1")).toBe(false);
    expect(gargoyles.regions.has("undead-parish-oswald-of-carim")).toBe(false);
    expect(without("Centipede Demon").regions.has("lost-izalith")).toBe(false);
  });

  // E6: which bosses a run needs follows from what it starts with. The Thief starts with the Master Key.
  it("leaves the Taurus Demon optional with the Master Key, from the class or the gift", () => {
    const needsTaurus = (items: readonly string[]) =>
      !reach(world, { items, forbiddenItems: new Set(["Taurus Demon Defeated"]) }).items.has(
        world.goal,
      );
    const noGift = { mode: "static", gift: { row: 0, items: [] } } as const;
    const masterKeyGift = world.gifts.find((g) => g.items.some((i) => i.item === "Master Key"));
    if (masterKeyGift === undefined) throw new Error("no Master Key gift");
    const knight = { mode: "static", gift: masterKeyGift, startingClass: "Knight" } as const;
    expect(needsTaurus(startingItems(world, { ...noGift, startingClass: "Knight" }))).toBe(true);
    expect(needsTaurus(startingItems(world, { ...noGift, startingClass: "Thief" }))).toBe(false);
    expect(needsTaurus(startingItems(world, knight))).toBe(false);
  });

  // E3: the walk down from the Depths side of Blighttown needs no Lordvessel (a DSAP comfort rule).
  it("walks down Blighttown from the Depths without the Lordvessel", () => {
    const edge = world.entrances.find(
      (e) => e.from === "upper-blighttown-depths-side" && e.to === "lower-blighttown",
    );
    expect(edge?.requires).toBe(true);
  });
});
