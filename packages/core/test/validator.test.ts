import { describe, expect, it } from "vitest";
import { alwaysLit } from "../src/bonfires.js";
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
 * Shops: the smith sells a Lantern at the forge; the smith and the trader both sell one at a shared
 * (virtual) stall. tower → a also needs the Lantern.
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
  forge: "hall",
  market: "hall",
  stall: null,
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
    { from: "tower", to: "a", requires: { all: [{ has: BELLS[0] }, { has: "Lantern" }] } },
    { from: "hall", to: "forge", requires: true },
    { from: "hall", to: "market", requires: true },
    { from: "forge", to: "stall", requires: true },
    { from: "market", to: "stall", requires: true },
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
    loc("forge", "Lantern", "SHOP_ITEM"),
    loc("stall", "Lantern", "SHOP_ITEM"),
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
  merchants: [
    { id: "smith", name: "Smith", regions: ["forge", "stall"] },
    { id: "trader", name: "Trader", regions: ["market", "stall"] },
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

  it("keeps a merchant who still has one reachable shop when another is cut off", () => {
    const world = parseWorld({
      ...raw,
      regions: [...raw.regions, { id: "deep", name: "deep", area: "wild", mandatory: false }],
      entrances: [...raw.entrances, { from: "hall", to: "deep", requires: true }],
      merchants: [
        ...raw.merchants,
        { id: "wanderer", name: "Wanderer", regions: ["market", "deep"] },
        { id: "hermit", name: "Hermit", regions: ["deep"] },
      ],
    });
    // market stays open. One reachable shop is enough: the order is about the merchant, not every stall.
    const kept = validate(world, setup(), [
      order("forbidden-area", { area: "wild" }),
      order("closed-merchant", { merchant: "wanderer" }),
    ]);
    expect(kept.verdict).toBe("comfortable");
    expect(kept.problems).toEqual([]);
    const cut = validate(world, setup(), [
      order("forbidden-area", { area: "wild" }),
      order("closed-merchant", { merchant: "hermit" }),
    ]);
    expect(cut.verdict).toBe("impossible");
    expect(cut.problems).toContain("closed-merchant: Hermit cannot be reached");
  });

  it("closes a merchant, keeping a shared shop open while another merchant sells there", () => {
    const smith = validate(small, setup(), [order("closed-merchant", { merchant: "smith" })]);
    expect(smith.orders[0]?.exceptions).toEqual([]);
    const both = validate(small, setup(), [
      order("closed-merchant", { merchant: "smith" }),
      order("closed-merchant", { merchant: "trader" }),
    ]);
    expect(both.verdict).toBe("comfortable");
    expect(both.orders.map((o) => o.exceptions)).toEqual([["Lantern"], []]);
  });

  // Every static order has a check; the live-only ones wait for the live mode's state.
  it("reports which orders it cannot check yet", () => {
    const result = validate(small, { ...setup(), mode: "live" }, [
      order("dry-fight", { boss: "gate-boss" }),
      order("boss-inheritance", { boss: "gate-boss", weapon: "x" }),
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

  // Derived from the graph (data set 0.2.0), not from memory. The Master Key opens no boss before a bell.
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

  const areas = [
    ...new Set([...world.regions.values()].flatMap((r) => (r.area === null ? [] : [r.area]))),
  ];

  // The two found pickups the graph needs: the key on the corpse in the first cell, and the Archives chest key.
  it("excepts in each area exactly the pickups the run cannot do without", () => {
    const exceptions = Object.fromEntries(
      areas.flatMap((area) => {
        const result = run([order("nothing-from-the-ground", { area })]);
        expect(result.verdict, area).toBe("comfortable");
        const list = result.orders[0]?.exceptions ?? [];
        return list.length > 0 ? [[area, list]] : [];
      }),
    );
    expect(exceptions).toEqual({
      "northern-undead-asylum": ["Dungeon Cell Key"],
      "the-dukes-archives": ["Archive Tower Giant Door Key"],
    });
  });

  // Issue 64: a chapter without rings was judged from the run's start, so the chapter of the Kiln was
  // allowed the rings that only the earlier Lord Souls need.
  it("excepts in a chapter without rings only what the chapter itself needs", () => {
    const souls = [
      "Lord Soul (Bed of Chaos)",
      "Bequeathed Lord Soul Shard (Four Kings)",
      "Bequeathed Lord Soul Shard (Seath)",
      "Lord Soul (Nito)",
    ];
    const rings = (from: string, until: string, lords: OrderInstance[] = []) => {
      const restriction = order("chapter-restriction", { from, until, restriction: "no-rings" });
      const result = run([...lords, restriction]);
      expect(result.verdict, `${from} → ${until}`).toBe("comfortable");
      return result.orders.at(-1)?.exceptions;
    };
    expect(rings("lordvessel-placed", "lord-souls-placed-3")).toEqual(["Covenant of Artorias"]);
    expect(rings("lordvessel-placed", "lord-souls-placed-2")).toEqual(["Orange Charred Ring"]);
    // Nito's soul is the last one: the chapter of the Kiln fights none of the other Lords.
    const lords = [order("lord-order", { order: souls })];
    expect(rings("lord-souls-placed-1", "kiln-open", lords)).toEqual([]);
    expect(rings("lord-souls-placed-1", "boss-gwyn-lord-of-cinder", lords)).toEqual([]);
    // Without an order of the Lord Souls, any of them may still be ahead.
    expect(rings("lord-souls-placed-1", "kiln-open")).toEqual(
      expect.arrayContaining(["Covenant of Artorias", "Orange Charred Ring"]),
    );
  }, 60_000);

  it("rejects an order whose place lies past a forbidden area", () => {
    const past = (orders: OrderInstance[]) =>
      run([order("forbidden-area", { area: "royal-wood" }), ...orders]);
    expect(past([order("no-bonfire", { area: "oolacile-township" })]).problems).toContain(
      "no-bonfire: Oolacile Township cannot be reached",
    );
    expect(past([order("dry-fight", { boss: "manus-father-of-the-abyss" })]).problems).toContain(
      "dry-fight: Manus, Father of the Abyss cannot be reached",
    );
    expect(past([order("dry-fight", { boss: "knight-artorias" })]).verdict).toBe("impossible");
    expect(past([order("dry-fight", { boss: "black-dragon-kalameet" })]).verdict).toBe(
      "impossible",
    );
    // The sanctuary is the way into the woods, so it stays open when the woods are closed.
    expect(past([order("dry-fight", { boss: "sanctuary-guardian" })]).verdict).toBe("comfortable");
    expect(past([order("forbidden-area", { area: "oolacile-township" })]).problems).toContain(
      "forbidden-area: Oolacile Township cannot be reached",
    );
  });

  // Issue 38, E11 and E12: the game's scripts put these bonfires out, or add them late.
  it("rejects a one-bonfire order that names a bonfire out for part of the run", () => {
    const windowed = world.locations.filter((l) => l.category === "BONFIRE" && !alwaysLit(l));
    expect(windowed.map((l) => l.name).sort()).toEqual([
      "AL: Anor Londo Bonfire",
      "AL: Chamber of the Princess Bonfire",
      "FS: Firelink Shrine Bonfire",
    ]);
    for (const { name: bonfire, unavailable } of windowed) {
      const result = run([order("one-bonfire", { area: "anor-londo", bonfire })]);
      expect(result.verdict, bonfire).toBe("impossible");
      expect(result.problems, bonfire).toEqual(
        (unavailable ?? []).map((w) => `${bonfire} cannot be the one bonfire: ${w.why}`),
      );
    }
    // Every window counts, not only the first.
    const raw = readDataSet();
    const twice = parseWorld({
      ...raw,
      locations: (raw.locations as Record<string, unknown>[]).map((l) =>
        l["name"] === "AL: Darkmoon Tomb Bonfire"
          ? {
              ...l,
              unavailable: [
                { from: true, until: { has: "Bell of Awakening #1" }, why: "first" },
                { from: { has: "Lordvessel" }, until: null, why: "second" },
              ],
            }
          : l,
      ),
    });
    const tomb = order("one-bonfire", { area: "anor-londo", bonfire: "AL: Darkmoon Tomb Bonfire" });
    expect(validate(twice, { mode: "static", gift }, [tomb]).problems).toEqual([
      "AL: Darkmoon Tomb Bonfire cannot be the one bonfire: first",
      "AL: Darkmoon Tomb Bonfire cannot be the one bonfire: second",
    ]);
    expect(
      run([order("one-bonfire", { area: "anor-londo", bonfire: "AL: Darkmoon Tomb Bonfire" })])
        .problems,
    ).toEqual([]);
    expect(run([order("no-bonfire", { area: "firelink-shrine" })]).verdict).toBe("comfortable");
    expect(run([order("no-bonfire", { area: "anor-londo" })]).verdict).toBe("comfortable");
  });

  it("can close any single merchant with no exception", () => {
    for (const merchant of world.merchants.keys()) {
      const result = run([order("closed-merchant", { merchant })]);
      expect(result.verdict, merchant).toBe("comfortable");
      expect(result.orders[0]?.exceptions, merchant).toEqual([]);
    }
  });
});
