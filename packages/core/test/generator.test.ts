import { describe, expect, it } from "vitest";
import { forbiddenAreaCutsOff } from "../src/generator/generate.js";
import {
  catalog,
  chaptersOf,
  CURVES,
  curveOffsets,
  elementalDefenses,
  generate,
  generateGroup,
  orderText,
  parseWorld,
  Random,
  renderManual,
  restrictions,
  shifted,
  validate,
  type ArgValue,
  type Challenge,
  type Chapter,
  type Difficulty,
  type Length,
  type OrderInstance,
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

  // Royal Wood is the only way into the Township and the Chasm. Forbidding it must not leave those
  // places, or their bosses, anywhere in the manual.
  it("does not send the player past a forbidden area", () => {
    const challenge = generate(world, {
      seed: "ashen-one",
      difficulty: "medium",
      length: "full",
    });
    expect(challenge.orders.find((o) => o.template.id === "forbidden-area")?.args["area"]).toBe(
      "royal-wood",
    );
    const manual = renderManual(world, challenge);
    for (const name of ["Oolacile Township", "Chasm of the Abyss", "Manus", "Kalameet"])
      expect(manual, name).not.toContain(name);
    expect(manual).toContain("Royal Wood (forbidden)");
    expect(manual).toContain("Oolacile Sanctuary");
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
        if (typeof boss === "string") expect(chapter?.bosses).toContain(boss);
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
      const forbidden = challenge.orders.find((o) => o.template.id === "forbidden-area")?.args[
        "area"
      ];
      const noEstus = new Set(
        challenge.orders.flatMap((o) =>
          o.template.id === "chapter-restriction" && o.args["restriction"] === "no-estus"
            ? [o.chapter]
            : [],
        ),
      );
      for (const { template, args, chapter } of challenge.orders) {
        const area = args["area"] as string;
        const boss = world.bosses.get(args["boss"] as string);
        if (forbidden !== undefined && template.id !== "forbidden-area") {
          expect(area).not.toBe(forbidden);
          if (boss !== undefined) expect(world.regions.get(boss.region)?.area).not.toBe(forbidden);
        }
        if (template.id === "dry-fight") expect(noEstus.has(chapter)).toBe(false);
        // Block 12: the element follows the boss's defenses, never a boss the graph lets the run skip (G7).
        if (template.id === "exploit-weakness" || template.id === "against-the-grain") {
          expect(["asylum-demon", "bell-gargoyles"]).not.toContain(args["boss"]);
          const defenses = (boss ? elementalDefenses(boss) : []).map((d) => d.element);
          expect(args["element"]).toBe(
            template.id === "exploit-weakness" ? defenses[0] : defenses.at(-1),
          );
        }
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

  // The evaluation of 20 journeys (2026-10-21): every detour in its first chapter gave chapters of 1 to 9
  // areas, the same for every seed.
  it("draws detours among their chapters, balancing the chapters and keeping the way in order", () => {
    const drawn = Array.from({ length: 30 }, (_, i) =>
      chaptersOf(world, lords, new Random(`balance-${String(i)}`)),
    );
    const widest = (cs: Chapter[]) => Math.max(...cs.map((c) => c.areas.length));
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(drawn.map(widest))).toBeLessThan(widest(chapters));
    expect(new Set(drawn.map((cs) => JSON.stringify(cs.map((c) => c.areas)))).size).toBeGreaterThan(
      5,
    );
    const chapterOf = (cs: Chapter[], area: string) => cs.findIndex((c) => c.areas.includes(area));
    for (const cs of drawn) {
      expect(cs.flatMap((c) => c.bosses).sort()).toEqual([...world.bosses.keys()].sort());
      // What each goal needs never moves; a detour never comes before its way in, nor after the Lord Souls.
      for (const [k, c] of chapters.entries())
        expect(cs[k]?.requiredAreas).toEqual(c.requiredAreas);
      expect(chapterOf(cs, "depths")).toBeLessThanOrEqual(chapterOf(cs, "blighttown"));
      expect(chapterOf(cs, "ash-lake")).toBeGreaterThanOrEqual(chapterOf(cs, "the-great-hollow"));
      expect(cs.at(-1)?.areas).toEqual(["kiln-of-the-first-flame"]);
    }
  });
});

describe("difficulty curves", () => {
  it("keeps every offset within two steps, rising for the rising curve", () => {
    for (const curve of CURVES) {
      const offsets = curveOffsets(curve, 9, "medium", new Random(curve));
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

  it("turns peaks into valleys at extreme, and never ends below the chosen level", () => {
    for (let i = 0; i < 50; i++) {
      const valleys = curveOffsets("peaks", 9, "extreme", new Random(`valley-${String(i)}`));
      expect(valleys.filter((o) => o === -1)).toHaveLength(2);
      expect(valleys.filter((o) => o !== -1).every((o) => o === 0)).toBe(true);
      // The rollercoaster changes level at the edges too, but for the last step back up.
      for (const level of ["easy", "extreme"] as const) {
        const ride = curveOffsets("rollercoaster", 9, level, new Random(`ride-${String(i)}`)).map(
          (o) => shifted(level, o),
        );
        for (let k = 1; k < 8; k++) expect(ride[k]).not.toBe(ride[k - 1]);
      }
      for (const curve of CURVES)
        for (const chapters of [4, 9])
          for (const level of ["easy", "extreme"] as const)
            expect(
              curveOffsets(curve, chapters, level, new Random(`end-${String(i)}`)).at(-1),
            ).toBeGreaterThanOrEqual(0);
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

  it("groups a short journey in four acts, with rules in each", () => {
    for (const seed of ["act-1", "act-2", "act-3"]) {
      const challenge = generate(world, { seed, difficulty: "medium", length: "short" });
      expect(challenge.chapters.map((c) => c.goals.length)).toEqual([2, 2, 4, 1]);
      expect(challenge.chapters[0]?.areas).toContain("northern-undead-asylum");
      for (const k of [0, 1, 2, 3]) expect(challenge.orders.map((o) => o.chapter)).toContain(k);
      const manual = renderManual(world, challenge);
      expect(manual).toContain("## Act 1: The first bell");
      expect(manual).toContain("## Act 3: The Lord Souls");
      expect(manual).not.toContain("## Chapter");
    }
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

describe("a forbidden area drawn after another order", () => {
  // parish → deep (wild) → grove (woods). The woods have no other entrance.
  // The Wanderer sells in the parish and in the wild; the Hermit sells only in the wild.
  const loc = (region: string, item: string, category: string, found = false) => ({
    name: `${region}: ${item}`,
    region,
    item,
    count: 1,
    category,
    mandatory: false,
    found,
  });
  const weapon = (id: number, name: string, category: string) => ({
    id,
    name,
    category,
    melee: true,
    hands: { both: true },
    req: { str: 10, dex: 0, int: 0, fth: 0 },
    baseDamage: { phys: 100, magic: 0, fire: 0, thunder: 0 },
  });
  const milestone = (id: string, name: string, kind: string, requires: unknown) => ({
    id,
    name,
    kind,
    requires,
  });
  const bell = "Bell of Awakening #1";
  const bell2 = "Bell of Awakening #2";
  const world = parseWorld({
    meta: { start: "asylum", goal: "Gwyn Defeated" },
    regions: [
      ["asylum", "asylum"],
      ["parish", "parish"],
      ["stall", "parish"],
      ["blight", "blight"],
      ["altar", "altar"],
      ["kiln", "kiln"],
      ["deep", "wild"],
      ["grove", "woods"],
    ].map(([id, area]) => ({ id, name: id, area, mandatory: false })),
    entrances: [
      { from: "asylum", to: "parish", requires: true },
      { from: "parish", to: "stall", requires: true },
      { from: "parish", to: "blight", requires: { has: bell } },
      { from: "blight", to: "altar", requires: { has: bell2 } },
      { from: "altar", to: "kiln", requires: { has: "Lordvessel" } },
      { from: "parish", to: "deep", requires: true },
      { from: "deep", to: "grove", requires: true },
    ],
    locations: [
      loc("asylum", "Asylum Demon Defeated", "BOSS"),
      loc("parish", bell, "EVENT"),
      loc("parish", "Club", "CORPSE_ITEM", true),
      loc("parish", "Shortsword", "CORPSE_ITEM", true),
      loc("blight", bell2, "EVENT"),
      loc("altar", "Lordvessel", "EVENT"),
      loc("kiln", "Gwyn Defeated", "BOSS"),
      loc("stall", "Moss", "SHOP_ITEM"),
      loc("deep", "Moss", "SHOP_ITEM"),
    ],
    classes: {
      classes: [
        {
          name: "Knight",
          level: 5,
          stats: { strength: 12, dexterity: 10, intelligence: 8, faith: 8, attunement: 10 },
        },
      ],
      gifts: [{ row: 1, items: ["(none)"] }],
    },
    bosses: [
      { id: "asylum-demon", name: "Asylum Demon", region: "asylum" },
      { id: "gwyn", name: "Gwyn", region: "kiln" },
    ],
    merchants: [
      { id: "wanderer", name: "Wanderer", regions: ["stall", "deep"] },
      { id: "hermit", name: "Hermit", regions: ["deep"] },
    ],
    milestones: [
      milestone("boss-asylum-demon", "Asylum", "boss", { has: "Asylum Demon Defeated" }),
      milestone("bell-undead-parish", "First bell", "bell", { has: bell }),
      milestone("both-bells", "Both bells", "bell", { all: [{ has: bell }, { has: bell2 }] }),
      milestone("lordvessel-obtained", "Lordvessel", "item", { has: "Lordvessel" }),
      milestone("lordvessel-placed", "Lordvessel placed", "item", { has: "Lordvessel" }),
      milestone("kiln-open", "Kiln", "area", { region: "kiln" }),
      milestone("gwyn-dead", "Gwyn", "boss", { has: "Gwyn Defeated" }),
    ],
    weapons: [weapon(1, "Club", "hammer"), weapon(2, "Shortsword", "sword")],
  });
  const drawn = (id: string, args: Record<string, ArgValue>): OrderInstance => {
    const template = catalog.find((o) => o.id === id);
    if (template === undefined) throw new Error(`no order ${id}`);
    return { template, args };
  };

  it("skips the draw when the area would cut off an order already chosen", () => {
    // no-bonfire is weight-only, so the draw loop would have kept it without validating the set.
    // Closing the wild is the only way the woods then fail, and that failure must happen here.
    const woods = drawn("no-bonfire", { area: "woods" });
    expect(forbiddenAreaCutsOff(world, { area: "wild" }, [woods], [])).toBe(true);
    expect(forbiddenAreaCutsOff(world, { area: "blight" }, [woods], [])).toBe(false);
    const township = drawn("forbidden-area", { area: "woods" });
    expect(forbiddenAreaCutsOff(world, { area: "wild" }, [township], [])).toBe(true);
    const hermit = drawn("closed-merchant", { merchant: "hermit" });
    expect(forbiddenAreaCutsOff(world, { area: "wild" }, [hermit], [])).toBe(true);
    // The parish stall is still open, so the Wanderer is not a reason to skip the draw.
    const wanderer = drawn("closed-merchant", { merchant: "wanderer" });
    expect(forbiddenAreaCutsOff(world, { area: "wild" }, [wanderer], [])).toBe(false);

    for (const seed of ["cut-off", "later-area", "reroll", "merchant-first"]) {
      const challenge = generate(world, { seed, difficulty: "easy", length: "full" });
      const forbidden = challenge.orders.flatMap((o) =>
        o.template.id === "forbidden-area" && o.args["area"] === "wild" ? [o] : [],
      );
      const closed = challenge.orders.some(
        (o) => o.template.id === "closed-merchant" && o.args["merchant"] === "hermit",
      );
      expect(forbidden.length > 0 && closed, seed).toBe(false);
      expect(validate(world, challenge.setup, challenge.orders).verdict, seed).toBe("comfortable");
    }
  });
});
