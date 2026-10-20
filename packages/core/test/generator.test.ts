import { describe, expect, it } from "vitest";
import {
  generate,
  parseWorld,
  Random,
  renderManual,
  validate,
  type Difficulty,
  type Length,
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
