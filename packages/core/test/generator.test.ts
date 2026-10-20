import { describe, expect, it } from "vitest";
import {
  catalog,
  generate,
  generateGroup,
  orderText,
  parseWorld,
  Random,
  renderManual,
  restrictions,
  validate,
  type Challenge,
  type Difficulty,
  type Length,
  type OrderTemplate,
} from "../src/index.js";
import { readDataSet } from "./ds1.js";

describe("Random", () => {
  it("repeats the same sequence for the same seed, and only for it", () => {
    const draw = (seed: string) => {
      const rng = new Random(seed);
      return Array.from({ length: 5 }, () => rng.next());
    };
    expect(draw("a")).toEqual(draw("a"));
    expect(draw("a")).not.toEqual(draw("b"));
  });

  it("keeps integers in range and shuffles without losing items", () => {
    const rng = new Random("range");
    const ints = Array.from({ length: 500 }, () => rng.int(3, 5));
    expect(new Set(ints)).toEqual(new Set([3, 4, 5]));
    const list = ["a", "b", "c", "d", "e"];
    expect(rng.shuffle(list).sort()).toEqual(list);
  });

  it("puts heavier items first more often in a weighted shuffle", () => {
    const rng = new Random("weights");
    let heavyFirst = 0;
    for (let i = 0; i < 1000; i++)
      if (rng.weightedShuffle(["light", "heavy"], (x) => (x === "heavy" ? 9 : 1))[0] === "heavy")
        heavyFirst++;
    expect(heavyFirst).toBeGreaterThan(850); // 9 / (9 + 1) of the time
  });
});

describe("generate on the DS1 data set", () => {
  const world = parseWorld(readDataSet());

  it("gives the same challenge for the same seed and settings", () => {
    const config = { seed: "ashen-one", difficulty: "medium", length: "full" } as const;
    expect(renderManual(world, generate(world, config))).toEqual(
      renderManual(world, generate(world, config)),
    );
    expect(renderManual(world, generate(world, { ...config, seed: "other" }))).not.toEqual(
      renderManual(world, generate(world, config)),
    );
  });

  it("respects a class, gift and level cap the player fixes", () => {
    const challenge = generate(world, {
      seed: "fixed",
      difficulty: "hard",
      length: "short",
      startingClass: "Pyromancer",
      giftRow: 2406,
      levelCap: 1,
    });
    expect(challenge.setup.startingClass).toBe("Pyromancer");
    expect(challenge.setup.gift.items.map((i) => i.item)).toEqual(["Master Key"]);
    expect(challenge.setup.levelCap).toBe(1);
  });

  // Phase C's closing test (docs/06): many seeds, every challenge possible.
  it("only generates challenges that validate, in the planned number of orders", () => {
    const difficulties: Difficulty[] = ["easy", "medium", "hard", "extreme"];
    const lengths: Length[] = ["short", "full"];
    for (let i = 0; i < 40; i++) {
      const difficulty = difficulties[i % 4] ?? "medium";
      const length = lengths[Math.floor(i / 4) % 2] ?? "full";
      const challenge = generate(world, { seed: `seed-${String(i)}`, difficulty, length });
      const result = validate(world, challenge.setup, challenge.orders);
      expect(result.verdict, `seed-${String(i)}`).toBe("comfortable");
      expect(result.complete).toBe(true);
      const [min, max] = length === "short" ? [4, 6] : [8, 12];
      expect(challenge.orders.length).toBeGreaterThanOrEqual(min);
      expect(challenge.orders.length).toBeLessThanOrEqual(max);
    }
  }, 60_000);
});

describe("difficulty budget", () => {
  const world = parseWorld(readDataSet());
  const seeds = Array.from({ length: 12 }, (_, i) => `budget-${String(i)}`);
  const sample = (difficulty: Difficulty) =>
    seeds.map((seed) => generate(world, { seed, difficulty, length: "full" }));
  const tierOf = (id: string) => restrictions.find((r) => r.id === id)?.tier;
  const curseOf = (c: Challenge) =>
    c.orders.find((o) => o.template.id === "accumulated-curse")?.args["restrictions"] as
      string[] | undefined;
  const meanWeight = (cs: Challenge[]) => {
    const orders = cs.flatMap((c) => c.orders);
    return orders.reduce((sum, o) => sum + o.template.weight.difficulty, 0) / orders.length;
  };

  it("gives the easy level light orders and curses, and the extreme level heavy ones", () => {
    const easy = sample("easy");
    const extreme = sample("extreme");
    expect(meanWeight(easy)).toBeLessThan(meanWeight(extreme));
    for (const c of easy) {
      expect(curseOf(c)?.every((id) => tierOf(id) === "light") ?? true).toBe(true);
      const friction = c.orders.reduce((sum, o) => sum + o.template.weight.friction, 0);
      expect(friction).toBeLessThanOrEqual(8);
    }
  }, 60_000);
});

describe("group challenge (handicap)", () => {
  const world = parseWorld(readDataSet());
  const all = ["easy", "medium", "hard", "extreme"] as const;
  const counts = (c: Challenge) =>
    c.orders.flatMap((o) =>
      Object.entries(o.template.params)
        .filter(([, spec]) => spec.kind === "count")
        .map(([name]) => o.args[name] as number),
    );

  it("gives every player the same orders, with numbers that ease with the difficulty", () => {
    for (const seed of ["group-1", "group-2", "group-3", "group-4"]) {
      const group = generateGroup(world, { seed, length: "full" }, all);
      const [easy, medium, hard, extreme] = group as [Challenge, Challenge, Challenge, Challenge];
      // The hardest player gets exactly the solo challenge.
      expect(renderManual(world, extreme)).toEqual(
        renderManual(world, generate(world, { seed, length: "full", difficulty: "extreme" })),
      );
      for (const c of group) {
        expect(c.setup.startingClass).toBe(extreme.setup.startingClass);
        expect(c.orders.map((o) => o.template.id)).toEqual(
          extreme.orders.map((o) => o.template.id),
        );
        expect(validate(world, c.setup, c.orders).verdict).toBe("comfortable");
      }
      for (const [easier, harder] of [
        [easy, medium],
        [medium, hard],
        [hard, extreme],
      ] as const) {
        expect(easier.setup.levelCap).toBeGreaterThanOrEqual(harder.setup.levelCap);
        const pairs = counts(easier).map((n, i) => [n, counts(harder)[i] ?? 0] as const);
        for (const [e, h] of pairs) expect(e).toBeGreaterThanOrEqual(h);
        const curse = (c: Challenge) =>
          (c.orders.find((o) => o.template.id === "accumulated-curse")?.args["restrictions"] ??
            []) as string[];
        expect(curse(harder)).toEqual(expect.arrayContaining(curse(easier)));
      }
    }
  }, 60_000);

  it("refuses an empty group", () => {
    expect(() => generateGroup(world, { seed: "x", length: "short" }, [])).toThrow();
  });
});

describe("manual", () => {
  const world = parseWorld(readDataSet());
  const template = (id: string) => catalog.find((o) => o.id === id) as OrderTemplate;

  it("says 'Do not die' for no deaths, and defines what a death is", () => {
    const lives = { template: template("run-lives"), args: { deaths: 0 }, exceptions: [] };
    expect(orderText(world, lives)).toMatch(/^Do not die for the whole run\./);
    expect(orderText(world, { ...lives, args: { deaths: 1 } })).toMatch(/^You have 1 death /);
    const challenge = generate(world, { seed: "manual", difficulty: "medium", length: "short" });
    const manual = renderManual(world, { ...challenge, orders: [lives] });
    expect(manual).toContain("## Definitions");
    expect(manual).toContain("- **Death:**");
    expect(manual).not.toContain("- **Attempt:**");
  });

  it("writes milestones as what the player does", () => {
    const assigned = {
      template: template("assigned-weapon"),
      args: {
        from: "boss-taurus-demon",
        until: "both-bells",
        location: world.locations.find((l) => l.found === true && l.item === "Halberd")?.name ?? "",
      },
      exceptions: [],
    };
    expect(orderText(world, assigned)).toMatch(
      /^From the moment you defeat Taurus Demon until you have rung both bells: your weapon is the Halberd/,
    );
  });
});
