import { describe, expect, it } from "vitest";
import {
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
import { readDataSet } from "./ds1.js";

const order = (id: string, args: Record<string, ArgValue>): OrderInstance => ({
  template: catalog.find((o) => o.id === id) as OrderTemplate,
  args,
});

/**
 * camp → yard (a Club and a Heavy Axe on corpses) → gate (the Brute) → keep (a Moon Blade, magic only)
 * → crypt (the Wraith, whom physical damage does not hurt; the goal) → throne (a Crown Sword).
 */
const loc = (region: string, item: string, category = "CORPSE_ITEM", found = true) => ({
  name: `${region}: ${item}`,
  region,
  item,
  count: 1,
  category,
  mandatory: false,
  found,
});
const weapon = (
  id: number,
  name: string,
  str: number,
  int: number,
  phys: number,
  magic: number,
  category = "sword",
) => ({
  id,
  name,
  category,
  melee: true,
  level: 0,
  hands: { both: true },
  req: { str, dex: 0, int, fth: 0 },
  baseDamage: { phys, magic, fire: 0, thunder: 0 },
});
const small: World = parseWorld({
  meta: { start: "camp", goal: "Wraith Defeated" },
  regions: [
    ["camp", "camp"],
    ["yard", "yard"],
    ["gate", "yard"],
    ["keep", "keep"],
    ["crypt", "keep"],
    ["throne", "throne"],
  ].map(([id, area]) => ({ id, name: id, area, mandatory: false })),
  entrances: [
    { from: "camp", to: "yard", requires: true },
    { from: "yard", to: "gate", requires: true },
    { from: "gate", to: "keep", requires: { has: "Brute Defeated" } },
    { from: "keep", to: "crypt", requires: true },
    { from: "crypt", to: "throne", requires: { has: "Wraith Defeated" } },
  ],
  locations: [
    loc("yard", "Club"),
    loc("yard", "Heavy Axe"),
    loc("keep", "Moon Blade"),
    loc("throne", "Crown Sword"),
    loc("gate", "Brute Defeated", "BOSS", false),
    loc("crypt", "Wraith Defeated", "BOSS", false),
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
    { id: "brute", name: "Brute", region: "gate", parts: [{ noDamage: [] }] },
    { id: "wraith", name: "Wraith", region: "crypt", parts: [{ noDamage: ["phys"] }] },
  ],
  merchants: [],
  milestones: [
    { id: "brute-dead", name: "Brute defeated", kind: "boss", requires: { has: "Brute Defeated" } },
    {
      id: "wraith-dead",
      name: "Wraith defeated",
      kind: "boss",
      requires: { has: "Wraith Defeated" },
    },
  ],
  weapons: [
    weapon(1, "Club", 10, 0, 100, 0, "hammer"),
    weapon(2, "Heavy Axe", 30, 0, 150, 0, "axe"), // two-handed: 20 Strength, 8 points for the Knight
    weapon(3, "Moon Blade", 0, 15, 0, 80), // 7 Intelligence points
    weapon(4, "Crown Sword", 0, 0, 0, 120),
  ],
});
const gift = small.gifts[0];
const setup = (levelCap: number): Setup => {
  if (gift === undefined) throw new Error("missing gift");
  return { mode: "static", gift, startingClass: "Knight", levelCap };
};

describe("first weapon of the area (worst case)", () => {
  const yard = order("first-weapon-of-area", { area: "yard", until: "brute-dead" });

  it("needs every weapon of the area to be wieldable within the level cap", () => {
    expect(validate(small, setup(10), [yard]).problems).toEqual([
      "Heavy Axe needs 8 attribute points; the build leaves 5 (found in yard, used until Brute defeated)",
    ]);
    expect(validate(small, setup(13), [yard]).verdict).toBe("comfortable");
  });

  it("needs every weapon to hurt the bosses of the stretch", () => {
    const keep = order("first-weapon-of-area", { area: "keep", until: "wraith-dead" });
    expect(validate(small, setup(12), [keep]).verdict).toBe("comfortable");
    const yardToWraith = order("first-weapon-of-area", { area: "yard", until: "wraith-dead" });
    expect(validate(small, setup(20), [yardToWraith]).problems[0]).toMatch(/cannot damage Wraith/);
  });

  it("refuses an area with no weapon to find", () => {
    const camp = order("first-weapon-of-area", { area: "camp", until: "brute-dead" });
    expect(validate(small, setup(20), [camp]).problems).toEqual([
      "there is no weapon to find in camp",
    ]);
  });
});

describe("assigned weapon (existence)", () => {
  const assigned = (location: string) =>
    order("assigned-weapon", { from: "brute-dead", until: "wraith-dead", location });

  it("accepts a weapon taken before the stretch ends that hurts its bosses", () => {
    expect(validate(small, setup(12), [assigned("keep: Moon Blade")]).verdict).toBe("comfortable");
    expect(validate(small, setup(11), [assigned("keep: Moon Blade")]).verdict).toBe("impossible");
  });

  it("refuses a weapon the bosses of the stretch shrug off, or one found too late", () => {
    expect(validate(small, setup(20), [assigned("yard: Club")]).problems[0]).toMatch(
      /Club cannot damage Wraith/,
    );
    expect(validate(small, setup(20), [assigned("throne: Crown Sword")]).problems).toEqual([
      'Crown Sword at "throne: Crown Sword" cannot be taken before the bosses until Wraith defeated',
    ]);
  });

  it("refuses to run without a class and a level cap", () => {
    const noBuild = { mode: "static" as const, gift: setup(0).gift };
    expect(() => validate(small, noBuild, [assigned("keep: Moon Blade")])).toThrow(
      InvalidOrderError,
    );
  });
});

describe("build restrictions and earned levels (worst case)", () => {
  const yard = order("first-weapon-of-area", { area: "yard", until: "brute-dead" });

  it("leaves no points when levels must be earned", () => {
    const earned = order("earned-levels", { condition: "x", points: 1 });
    expect(validate(small, setup(30), [yard, earned]).problems).toEqual([
      "Heavy Axe needs 8 attribute points; the build leaves 0 (found in yard, used until Brute defeated)",
    ]);
  });

  it("applies every restriction of the curse from the start", () => {
    const curse = (ids: string[]) => order("accumulated-curse", { restrictions: ids });
    // One-handed, the Heavy Axe needs 30 Strength: 18 points for the Knight.
    expect(validate(small, setup(20), [yard, curse(["no-estus"])]).verdict).toBe("comfortable");
    expect(
      validate(small, setup(20), [yard, curse(["no-estus", "one-handed"])]).problems[0],
    ).toMatch(/^Heavy Axe needs 18 attribute points/);
    expect(() => validate(small, setup(20), [curse(["no-such-thing"])])).toThrow(InvalidOrderError);
  });
});

describe("orders that contradict each other", () => {
  const assigned = order("assigned-weapon", {
    from: "brute-dead",
    until: "wraith-dead",
    location: "keep: Moon Blade",
  });

  it("lets two orders choose your weapon one after the other, with one build for all", () => {
    const first = order("first-weapon-of-area", { area: "yard", until: "brute-dead" });
    // Heavy Axe (8 Strength points) and Moon Blade (7 Intelligence points): 15 of the Knight's 15.
    expect(validate(small, setup(20), [first, assigned]).verdict).toBe("comfortable");
    expect(validate(small, setup(19), [first, assigned]).problems).toEqual([
      "Club and Heavy Axe and Moon Blade need 15 attribute points; the build leaves 14 (every weapon the orders may hand you)",
    ]);
  });

  it("refuses two orders that choose your weapon at the same time", () => {
    const first = order("first-weapon-of-area", { area: "yard", until: "wraith-dead" });
    expect(validate(small, setup(40), [first, assigned]).problems).toContain(
      "first-weapon-of-area and assigned-weapon would choose your weapon at the same time",
    );
    const swap = order("phase-swap", { milestone: "brute-dead", before: "hammer", after: "sword" });
    expect(validate(small, setup(40), [swap, assigned]).problems).toContain(
      "phase-swap and assigned-weapon would choose your weapon at the same time",
    );
  });

  it("applies a chapter restriction to the whole run, the worst case", () => {
    const yard = order("first-weapon-of-area", { area: "yard", until: "brute-dead" });
    const chapter = order("chapter-restriction", {
      from: "brute-dead",
      until: "wraith-dead",
      restriction: "one-handed",
    });
    expect(validate(small, setup(20), [yard, chapter]).problems[0]).toMatch(
      /^Heavy Axe needs 18 attribute points/,
    );
  });

  it("refuses to wear what you find under a curse of no armor", () => {
    const wear = order("wear-what-you-find", { area: "yard" });
    const curse = order("accumulated-curse", { restrictions: ["no-armor"] });
    expect(validate(small, setup(30), [wear, curse]).problems).toEqual([
      'the restriction "no-armor" contradicts the order "wear-what-you-find"',
    ]);
  });
});

describe("phase swap (existence)", () => {
  const swap = (before: string, after: string) =>
    order("phase-swap", { milestone: "brute-dead", before, after });

  it("finds a weapon of each style, in time, that one build can wield", () => {
    // Club (hammer, yard) until the Brute; Moon Blade (sword, magic) for the Wraith: 7 Intelligence points.
    expect(validate(small, setup(12), [swap("hammer", "sword")]).verdict).toBe("comfortable");
    expect(validate(small, setup(11), [swap("hammer", "sword")]).problems).toEqual([
      "no hammer and sword fit one build",
    ]);
  });

  it("needs the second style to hurt the bosses after the milestone", () => {
    expect(validate(small, setup(30), [swap("axe", "hammer")]).problems).toEqual([
      "no hammer can be taken for after Brute defeated",
    ]);
  });

  it("needs the first style before the milestone", () => {
    expect(validate(small, setup(30), [swap("sword", "hammer")]).problems).toEqual([
      "no sword can be taken before Brute defeated",
    ]);
  });
});

describe("weapon orders on the DS1 data set", () => {
  const world = parseWorld(readDataSet());

  const gift = world.gifts.find((g) => g.items.length === 0);
  if (gift === undefined) throw new Error("missing gift");
  const run = (startingClass: string, levelCap: number, orders: OrderInstance[]) =>
    validate(world, { mode: "static", gift, startingClass, levelCap }, orders);
  const areasWithWeapons = [
    "anor-londo",
    "blighttown",
    "darkroot-garden",
    "depths",
    "firelink-shrine",
    "new-londo-ruins",
    "painted-world-of-ariamis",
    "sens-fortress",
    "the-catacombs",
    "undead-burg",
    "undead-parish",
    "valley-of-drakes",
  ];

  // Derived from the data set (0.3.0): a Knight at soul level 30 can wield whatever melee weapon each
  // area offers until the Kiln; a level-1 Pyromancer has no points to spend, and every one needs some.
  it("gives a first weapon of the area that a Knight at level 30 can always use", () => {
    for (const area of areasWithWeapons) {
      const first = order("first-weapon-of-area", { area, until: "kiln-open" });
      expect(run("Knight", 30, [first]).verdict, area).toBe("comfortable");
      expect(run("Pyromancer", 1, [first]).verdict, area).toBe("impossible");
    }
  });

  it("excepts from 'no rings' exactly the rings the run needs", () => {
    const curse = order("accumulated-curse", { restrictions: ["no-rings", "no-estus"] });
    const result = run("Knight", 30, [curse]);
    expect(result.verdict).toBe("comfortable");
    expect(result.orders[0]?.exceptions).toEqual(["Covenant of Artorias", "Orange Charred Ring"]);
  });

  it("swaps fighting style at the Lordvessel when one build fits both", () => {
    const swap = order("phase-swap", {
      milestone: "lordvessel-obtained",
      before: "dagger",
      after: "halberd",
    });
    expect(run("Knight", 10, [swap]).verdict).toBe("comfortable");
    expect(run("Deprived", 6, [swap]).problems).toEqual(["no dagger and halberd fit one build"]);
  });

  describe("schools of magic as a style", () => {
    const swap = (milestone: string, before: string, after: string) =>
      order("phase-swap", { milestone, before, after });

    it("lets a Sorcerer start with sorceries: the class kit has a catalyst and Soul Arrow", () => {
      expect(run("Sorcerer", 20, [swap("bell-undead-parish", "sorcery", "sword")]).verdict).toBe(
        "comfortable",
      );
    });

    it("needs attunement for a slot: a Warrior has 8, and spends 2 points on it", () => {
      // Soul Arrow with a Sorcerer's Catalyst: Intelligence 10 (the Warrior has 9) and Attunement 10.
      const before = swap("bell-undead-parish", "sorcery", "dagger");
      expect(run("Warrior", 6, [before]).problems).toEqual(["no sorcery and dagger fit one build"]);
      expect(run("Warrior", 7, [before]).verdict).toBe("comfortable");
    });

    it("refuses pyromancy while Quelaag, whom fire does not hurt, is still to fight", () => {
      expect(
        run("Pyromancer", 30, [swap("bell-undead-parish", "pyromancy", "sword")]).verdict,
      ).toBe("comfortable");
      expect(
        run("Pyromancer", 30, [swap("bell-undead-parish", "sword", "pyromancy")]).problems,
      ).toEqual(["no pyromancy can be taken for after Undead Parish bell rung"]);
    });

    it("contradicts a curse of no magic", () => {
      const curse = order("accumulated-curse", { restrictions: ["no-magic"] });
      expect(
        run("Sorcerer", 30, [swap("bell-undead-parish", "sorcery", "sword"), curse]).problems,
      ).toContain('the restriction "no-magic" contradicts fighting with sorcery');
    });
  });

  it("assigns the Undead Parish halberd from the Taurus Demon to the first bell", () => {
    const halberd = world.locations.find((l) => l.found === true && l.item === "Halberd");
    if (halberd === undefined) throw new Error("no halberd");
    const assigned = order("assigned-weapon", {
      from: "boss-taurus-demon",
      until: "bell-undead-parish",
      location: halberd.name,
    });
    expect(run("Knight", 10, [assigned]).verdict).toBe("comfortable");
    expect(run("Pyromancer", 1, [assigned]).problems[0]).toMatch(
      /^Halberd needs \d+ attribute points/,
    );
    // The Parish lies past the Taurus Demon: from the Asylum Demon on, the halberd comes too late for him.
    expect(
      run("Knight", 10, [{ ...assigned, args: { ...assigned.args, from: "boss-asylum-demon" } }])
        .problems[0],
    ).toMatch(/cannot be taken before the bosses/);
  });
});

describe("element fights (block 12)", () => {
  const fight = (id: string, boss: string, element: string) => order(id, { boss, element });

  it("needs something that deals the element before the boss falls, within the build", () => {
    expect(validate(small, setup(12), [fight("exploit-weakness", "wraith", "magic")]).verdict).toBe(
      "comfortable",
    );
    expect(
      validate(small, setup(11), [fight("exploit-weakness", "wraith", "magic")]).problems,
    ).toEqual(["nothing that deals magic against Wraith fits the build"]);
    // The Moon Blade lies past the Brute.
    expect(
      validate(small, setup(20), [fight("against-the-grain", "brute", "magic")]).problems,
    ).toEqual(["nothing that deals magic can be taken before Brute"]);
    expect(validate(small, setup(20), [fight("against-the-grain", "wraith", "fire")]).verdict).toBe(
      "impossible",
    );
  });

  it("refuses two elements for one fight, and an element while an order chooses your weapon", () => {
    const both = [
      fight("exploit-weakness", "wraith", "magic"),
      fight("against-the-grain", "wraith", "fire"),
    ];
    expect(validate(small, setup(20), both).problems).toContain(
      "Wraith cannot be fought only with magic and only with fire",
    );
    const assigned = order("assigned-weapon", {
      from: "brute-dead",
      until: "wraith-dead",
      location: "keep: Moon Blade",
    });
    expect(
      validate(small, setup(20), [assigned, fight("exploit-weakness", "wraith", "magic")]).problems,
    ).toEqual(["assigned-weapon chooses your weapon, and exploit-weakness the element of a fight"]);
  });
});
