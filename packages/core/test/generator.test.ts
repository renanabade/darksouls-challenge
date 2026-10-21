import { describe, expect, it } from "vitest";
import {
  catalog,
  chaptersOf,
  CURVES,
  curveOffsets,
  generate,
  generateGroup,
  orderText,
  parseWorld,
  Random,
  renderManual,
  restrictions,
  shifted,
  validate,
  type Challenge,
  type Chapter,
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
  }, 30_000);

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

  // Many seeds, every challenge possible, and each chapter's rules about the chapter's own areas and bosses.
  const difficulties: Difficulty[] = ["easy", "medium", "hard", "extreme"];
  const sample = Array.from({ length: 24 }, (_, i) => {
    const difficulty = difficulties[i % 4] ?? "medium";
    const length = (["short", "full", "epic"] as const)[Math.floor(i / 4) % 3] ?? "full";
    return generate(world, { seed: `seed-${String(i)}`, difficulty, length });
  });

  it("only generates journeys that validate, longer as the length grows", () => {
    const sizes: Record<Length, number[]> = { short: [], full: [], epic: [] };
    for (const challenge of sample) {
      const result = validate(world, challenge.setup, challenge.orders);
      expect(result.verdict, challenge.config.seed).toBe("comfortable");
      expect(result.complete).toBe(true);
      sizes[challenge.config.length].push(challenge.orders.length);
      for (const order of challenge.orders) {
        if (order.chapter === undefined) continue;
        const chapter = challenge.chapters[order.chapter];
        const { area, boss } = order.args;
        if (typeof area === "string") expect(chapter?.areas).toContain(area);
        if (typeof boss === "string" && order.template.id !== "boss-before-bell")
          expect(chapter?.bosses).toContain(boss);
      }
    }
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(Math.max(...sizes.short)).toBeLessThanOrEqual(13);
    expect(mean(sizes.short)).toBeLessThan(mean(sizes.full));
    expect(mean(sizes.full)).toBeLessThan(mean(sizes.epic));
    expect(Math.min(...sizes.epic)).toBeGreaterThanOrEqual(20);
  });

  // The analysis of 20 challenges (2026-10-21): orders that asked nothing.
  it("draws no order that asks nothing", () => {
    const pickups = (area: string, kind?: string) =>
      world.locations.filter(
        (l) =>
          l.found === true &&
          world.regions.get(l.region)?.area === area &&
          (kind === undefined || l.kind === kind),
      ).length;
    for (const challenge of sample) {
      const classLevel = world.classes.get(challenge.setup.startingClass)?.level;
      const ids = challenge.orders.map((o) => o.template.id);
      const curse = challenge.orders.find((o) => o.template.id === "accumulated-curse")?.args[
        "restrictions"
      ] as string[] | undefined;
      if (challenge.setup.levelCap === classLevel) {
        expect(ids).not.toContain("earned-levels");
        expect(curse ?? []).not.toContain("no-level-ups");
      }
      const deaths = challenge.orders.find((o) => o.template.id === "run-lives")?.args["deaths"];
      for (const { template, args } of challenge.orders) {
        const area = args["area"] as string;
        if (template.id === "wear-what-you-find") expect(pickups(area, "armor")).toBeGreaterThan(0);
        if (template.id === "nothing-from-the-ground")
          expect(pickups(area)).toBeGreaterThanOrEqual(5);
        if (template.id === "boss-before-bell")
          expect(["asylum-demon", "bell-gargoyles"]).not.toContain(args["boss"]);
        if (template.id === "counted-attempts" && typeof deaths === "number")
          expect((args["attempts"] as number) - 1).toBeLessThan(deaths);
        if (template.id === "chapter-restriction")
          expect(curse ?? []).not.toContain(args["restriction"]);
      }
    }
  });
});

describe("chapters", () => {
  const world = parseWorld(readDataSet());
  const lords = [
    "Lord Soul (Nito)",
    "Bequeathed Lord Soul Shard (Seath)",
    "Bequeathed Lord Soul Shard (Four Kings)",
    "Lord Soul (Bed of Chaos)",
  ];
  const chapters = chaptersOf(world, lords);

  it("cuts the run at the Asylum, the bells, the Lordvessel, each Lord Soul and the Kiln", () => {
    expect(chapters.map((c) => c.goal)).toEqual([
      "boss-asylum-demon",
      "bell-undead-parish",
      "both-bells",
      "lordvessel-placed",
      "lord-souls-placed-1",
      "lord-souls-placed-4",
      "lord-souls-placed-3",
      "lord-souls-placed-2",
      "boss-gwyn-lord-of-cinder",
    ]);
  });

  // Derived from the data set (0.5.0), not typed in: what each goal cannot be reached without.
  it("puts each area and boss where the run meets it", () => {
    const at = (k: number): Chapter => {
      const chapter = chapters[k];
      if (chapter === undefined) throw new Error(`no chapter ${String(k)}`);
      return chapter;
    };
    expect(at(0).areas).toEqual(["northern-undead-asylum"]);
    expect(at(1).requiredAreas).toEqual(expect.arrayContaining(["undead-burg", "undead-parish"]));
    expect(at(2).areas).toEqual(expect.arrayContaining(["blighttown", "quelaags-domain"]));
    expect(at(3).areas).toEqual(
      expect.arrayContaining(["sens-fortress", "anor-londo", "painted-world-of-ariamis"]),
    );
    expect(at(4).areas).toEqual(["the-catacombs", "tomb-of-the-giants"]);
    expect(at(5).areas).toEqual(expect.arrayContaining(["the-dukes-archives"]));
    expect(at(6).bosses).toEqual(["four-kings", "great-grey-wolf-sif"]);
    expect(at(8).areas).toEqual(["kiln-of-the-first-flame"]);
    const bosses = chapters.flatMap((c) => c.bosses);
    expect(bosses.sort()).toEqual([...world.bosses.keys()].sort());
  });
});

describe("difficulty curves", () => {
  it("keeps every offset within two steps, rising for the rising curve", () => {
    for (const curve of CURVES) {
      const offsets = curveOffsets(curve, 9, new Random(curve));
      expect(offsets).toHaveLength(9);
      for (const o of offsets) expect(Math.abs(o)).toBeLessThanOrEqual(2);
      if (curve === "constant") expect(new Set(offsets)).toEqual(new Set([0]));
      if (curve === "rising")
        for (let k = 1; k < 9; k++)
          expect(offsets[k] ?? 0).toBeGreaterThanOrEqual(offsets[k - 1] ?? 0);
      if (curve === "peaks") expect(offsets.filter((o) => o === 2)).toHaveLength(2);
      if (curve === "rollercoaster")
        for (let k = 1; k < 9; k++) expect(offsets[k]).not.toBe(offsets[k - 1]);
    }
  });

  it("holds a shifted difficulty within easy and extreme", () => {
    expect(shifted("easy", -1)).toBe("easy");
    expect(shifted("medium", 1)).toBe("hard");
    expect(shifted("hard", 2)).toBe("extreme");
  });

  it("gives a chapter on a peak harder numbers than the rest", () => {
    const world = parseWorld(readDataSet());
    const challenge = generate(world, {
      seed: "peaks",
      difficulty: "easy",
      length: "epic",
      curve: "peaks",
    });
    const levels = challenge.chapters.map((c) => c.difficulty);
    expect(levels.filter((d) => d === "hard")).toHaveLength(2);
    expect(levels.filter((d) => d === "easy")).toHaveLength(7);
  }, 30_000);
});

describe("difficulty budget", () => {
  const world = parseWorld(readDataSet());
  const seeds = Array.from({ length: 12 }, (_, i) => `budget-${String(i)}`);
  const sample = (difficulty: Difficulty) =>
    seeds.map((seed) => generate(world, { seed, difficulty, length: "full", curve: "constant" }));
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
      for (const o of c.orders.filter((o) => o.template.id === "chapter-restriction"))
        expect(tierOf(o.args["restriction"] as string)).toBe("light");
    }
    const orders = easy.flatMap((c) => c.orders);
    const friction = orders.reduce((sum, o) => sum + o.template.weight.friction, 0);
    expect(friction / orders.length).toBeLessThanOrEqual(1);
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

  it("lays the journey out in chapters, numbering rules across the manual", () => {
    const challenge = generate(world, { seed: "chapters", difficulty: "hard", length: "epic" });
    const manual = renderManual(world, challenge);
    expect(manual).toContain("## Rules of the journey\n\n1. **");
    expect(manual).toContain("## Chapter 1: The Asylum");
    expect(manual).toMatch(
      /## Chapter \d: Lord Soul: Nito\n\nUntil you place the Lord Soul \(Nito\)/,
    );
    const numbers = [...manual.matchAll(/^(\d+)\. \*\*/gm)].map((m) => Number(m[1]));
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
    expect(numbers).toHaveLength(challenge.orders.length);
  }, 30_000);

  it("writes a chapter restriction as the chapter's stretch", () => {
    const chapter = {
      template: template("chapter-restriction"),
      args: { from: "bell-undead-parish", until: "both-bells", restriction: "no-rolling" },
      exceptions: [],
    };
    expect(orderText(world, chapter)).toBe(
      "From the moment you ring the bell of the Undead Parish until you have rung both bells: do not roll.",
    );
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
