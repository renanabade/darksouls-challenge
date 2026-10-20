import { describe, expect, it } from "vitest";
import {
  BELLS,
  catalog,
  InvalidOrderError,
  parseWorld,
  validate,
  type ArgValue,
  type OrderInstance,
  type OrderTemplate,
  type Setup,
  type World,
} from "../src/index.js";
import { readDataSet, readMandatory } from "./ds1.js";

const order = (id: string, args: Record<string, ArgValue> = {}): OrderInstance => {
  const template = catalog.find((o) => o.id === id) as OrderTemplate | undefined;
  if (template === undefined) throw new Error(`no order ${id}`);
  return { template, args };
};

/**
 * start → hall; hall → side, gate (a boss), tower (needs Key, found in the hall);
 * side → tower with the Master Key; tower → a (needs the first bell, rung in the tower);
 * a → b (needs Soul A); b → throne (needs both souls), where the goal boss is.
 */
const area = {
  start: "asylum",
  hall: "hall",
  gate: "hall",
  side: "side",
  tower: "tower",
  a: "lords",
  b: "lords",
  throne: "throne",
};
const loc = (region: string, item: string, category: string, found = false) => ({
  name: `${region}: ${item}`,
  region,
  item,
  count: 1,
  category,
  mandatory: false,
  found,
});
const raw = {
  meta: { start: "start", goal: "Lord Defeated" },
  regions: Object.entries(area).map(([id, a]) => ({ id, name: id, area: a, mandatory: false })),
  entrances: [
    { from: "start", to: "hall", requires: true },
    { from: "hall", to: "side", requires: true },
    { from: "hall", to: "gate", requires: true },
    { from: "hall", to: "tower", requires: { has: "Key" } },
    { from: "side", to: "tower", requires: { has: "Master Key" } },
    { from: "tower", to: "a", requires: { has: BELLS[0] } },
    { from: "a", to: "b", requires: { has: "Soul A" } },
    { from: "b", to: "throne", requires: { all: [{ has: "Soul A" }, { has: "Soul B" }] } },
  ],
  locations: [
    loc("hall", "Key", "CORPSE_ITEM", true),
    loc("hall", "Ring", "CHEST_ITEM", true),
    loc("side", "Junk", "CORPSE_ITEM", true),
    loc("gate", "Gate Boss Defeated", "BOSS"),
    loc("tower", BELLS[0] ?? "", "EVENT"),
    loc("a", "Soul A", "LORD_SOUL"),
    loc("b", "Soul B", "LORD_SOUL"),
    loc("throne", "Lord Defeated", "BOSS"),
  ],
  classes: {
    gifts: [
      { row: 1, items: ["(none)"] },
      { row: 2, items: ["Master Key"] },
    ],
  },
  bosses: [
    { id: "gate-boss", name: "Gate Boss", region: "gate" },
    { id: "lord", name: "Lord", region: "throne" },
  ],
};
const small: World = parseWorld(raw);
const [noGift, masterKey] = small.gifts;
const setup = (gift = noGift): Setup => {
  if (gift === undefined) throw new Error("missing gift");
  return { mode: "static", gift };
};

describe("validate", () => {
  it("forbids areas, refusing one the goal needs", () => {
    expect(validate(small, setup(), [order("forbidden-area", { area: "side" })]).verdict).toBe(
      "comfortable",
    );
    const result = validate(small, setup(), [order("forbidden-area", { area: "tower" })]);
    expect(result.verdict).toBe("impossible");
    expect(result.problems).toEqual(['the goal "Lord Defeated" cannot be reached']);
  });

  it("checks that a boss can die before any bell is rung", () => {
    expect(
      validate(small, setup(), [order("boss-before-bell", { boss: "gate-boss" })]).verdict,
    ).toBe("comfortable");
    expect(
      validate(small, setup(), [order("boss-before-bell", { boss: "lord" })]).problems,
    ).toEqual(["Lord cannot be defeated before a bell"]);
  });

  it("checks that the Lord Souls can be taken in the given order", () => {
    const ok = validate(small, setup(), [order("lord-order", { order: ["Soul A", "Soul B"] })]);
    expect(ok.verdict).toBe("comfortable");
    const ko = validate(small, setup(), [order("lord-order", { order: ["Soul B", "Soul A"] })]);
    expect(ko.problems).toEqual(["Soul B cannot be obtained before Soul A"]);
  });

  it("excepts only the pickups the game requires, given the starting gift", () => {
    const ground = order("nothing-from-the-ground", { area: "hall" });
    expect(validate(small, setup(), [ground]).orders[0]?.exceptions).toEqual(["Key"]);
    expect(validate(small, setup(masterKey), [ground]).orders[0]?.exceptions).toEqual([]);
  });

  it("validates orders together: one order can make another's exception necessary", () => {
    const result = validate(small, setup(masterKey), [
      order("forbidden-area", { area: "side" }),
      order("nothing-from-the-ground", { area: "hall" }),
    ]);
    expect(result.verdict).toBe("comfortable");
    expect(result.orders[1]?.exceptions).toEqual(["Key"]);
  });

  it("reports which orders it cannot check yet", () => {
    const result = validate(small, setup(), [
      order("dry-fight", { boss: "gate-boss" }),
      order("first-weapon-of-area", { area: "hall", until: "x" }),
    ]);
    expect(result.orders.map((o) => o.support)).toEqual(["weightOnly", "pending"]);
    expect(result.complete).toBe(false);
  });

  it("leaves order 5 pending when the data set has no found flag", () => {
    const unflagged = parseWorld({
      ...raw,
      locations: raw.locations.map((l) => ({ ...l, found: undefined })),
    });
    const result = validate(unflagged, setup(), [
      order("nothing-from-the-ground", { area: "hall" }),
    ]);
    expect(result.orders[0]?.support).toBe("pending");
  });

  it("rejects orders the generator filled in wrong", () => {
    // The wager is live only; asking for it in a static challenge is a generator bug.
    expect(() =>
      validate(small, setup(), [order("wager", { boss: "lord", restriction: "x" })]),
    ).toThrow(InvalidOrderError);
    expect(() => validate(small, setup(), [order("forbidden-area", { area: "nowhere" })])).toThrow(
      InvalidOrderError,
    );
    expect(() =>
      validate(small, setup(), [order("lord-order", { order: ["Soul A", "Soul A"] })]),
    ).toThrow(InvalidOrderError);
  });
});

describe("validate on the DS1 data set", () => {
  const world = parseWorld(readDataSet());
  const gift = world.gifts.find((g) => g.items.length === 0);
  const masterKeyGift = world.gifts.find((g) => g.items.some((i) => i.item === "Master Key"));
  if (gift === undefined || masterKeyGift === undefined) throw new Error("missing gifts");
  const run = (orders: OrderInstance[], g = gift) =>
    validate(world, { mode: "static", gift: g }, orders);

  it("names bells and Lord Souls that exist in the graph", () => {
    const items = new Set(world.locations.map((l) => l.item));
    expect(BELLS.filter((b) => !items.has(b))).toEqual([]);
    expect(world.locations.filter((l) => l.category === "LORD_SOUL")).toHaveLength(4);
  });

  it("refuses to forbid an area exactly when it holds a mandatory region", () => {
    const mandatory = new Set(readMandatory().regions);
    const areas = new Set(
      [...world.regions.values()].flatMap((r) => (r.area === null ? [] : [r.area])),
    );
    for (const area of areas) {
      const holdsMandatory = [...world.regions.values()].some(
        (r) => r.area === area && mandatory.has(r.id),
      );
      const verdict = run([order("forbidden-area", { area })]).verdict;
      expect(verdict, area).toBe(holdsMandatory ? "impossible" : "comfortable");
    }
  });

  // Derived from the graph (data set 0.1.0), not from memory. The Master Key opens no boss before a bell.
  it("finds the bosses that can die before any bell", () => {
    const before = (g = gift) =>
      [...world.bosses.keys()].filter(
        (boss) => run([order("boss-before-bell", { boss })], g).verdict === "comfortable",
      );
    expect(before().sort()).toEqual([
      "asylum-demon",
      "bell-gargoyles",
      "capra-demon",
      "ceaseless-discharge",
      "chaos-witch-quelaag",
      "gaping-dragon",
      "great-grey-wolf-sif",
      "moonlight-butterfly",
      "pinwheel",
      "stray-demon",
      "taurus-demon",
    ]);
    expect(before(masterKeyGift)).toEqual(before());
  });

  it("accepts every order of the four Lord Souls", () => {
    const souls = world.locations.filter((l) => l.category === "LORD_SOUL").map((l) => l.item);
    const permutations = (xs: string[]): string[][] =>
      xs.length <= 1
        ? [xs]
        : xs.flatMap((x, i) => permutations(xs.filter((_, j) => j !== i)).map((p) => [x, ...p]));
    for (const lords of permutations(souls)) {
      expect(run([order("lord-order", { order: lords })]).problems).toEqual([]);
    }
  });

  it("leaves order 5 pending until the data set exports the found flag", () => {
    const result = run([order("nothing-from-the-ground", { area: "undead-burg" })]);
    expect(result.orders[0]?.support).toBe("pending");
  });
});
