import { describe, expect, it } from "vitest";
import {
  damages,
  isMeleeWeapon,
  pointsToWield,
  spellKit,
  strengthNeeded,
  type Boss,
  type Spell,
  type Weapon,
} from "../src/index.js";

const weapon = (overrides: Partial<Weapon> = {}): Weapon => ({
  id: 1,
  name: "Test Sword",
  category: "sword",
  melee: true,
  twoHandable: true,
  requirements: { str: 0, dex: 0, int: 0, fth: 0, att: 0 },
  damage: { phys: 100, magic: 0, fire: 0, thunder: 0 },
  casts: [],
  ...overrides,
});
const stats = { str: 10, dex: 10, int: 10, fth: 10, att: 10 };
const boss = (noDamage: Boss["parts"][number]["noDamage"][]): Boss => ({
  id: "b",
  name: "Boss",
  region: "r",
  defeatedItem: "Boss Defeated",
  parts: noDamage.map((n) => ({ noDamage: n })),
});

describe("strengthNeeded", () => {
  // Strength counts 1.5 times with both hands, rounded down (docs/04-dados.md, "Fatos de combate").
  it("lets 27 Strength two-hand a 40 Strength weapon, as the game does", () => {
    expect(strengthNeeded(40, true)).toBe(27);
    expect(Math.floor(26 * 1.5)).toBeLessThan(40);
  });

  it("rounds the effective Strength down", () => {
    expect(strengthNeeded(25, true)).toBe(17); // 16 * 1.5 = 24 < 25; 17 * 1.5 = 25.5 → 25
    expect(strengthNeeded(24, true)).toBe(16);
    expect(strengthNeeded(24, false)).toBe(24);
  });
});

describe("pointsToWield", () => {
  it("adds what each requirement lacks", () => {
    const w = weapon({ requirements: { str: 10, dex: 14, int: 12, fth: 9, att: 0 } });
    expect(pointsToWield(w, stats)).toBe(4 + 2);
  });

  it("uses both hands when that costs fewer points", () => {
    const heavy = weapon({ requirements: { str: 30, dex: 0, int: 0, fth: 0, att: 0 } });
    expect(pointsToWield(heavy, stats)).toBe(20 - 10);
    expect(pointsToWield({ ...heavy, twoHandable: false }, stats)).toBe(30 - 10);
  });
});

describe("damages", () => {
  it("needs some element that every part of the boss takes", () => {
    const magicOnly = weapon({ damage: { phys: 0, magic: 80, fire: 0, thunder: 0 } });
    expect(damages(weapon(), boss([["fire"]]))).toBe(true);
    expect(damages(magicOnly, boss([["magic"]]))).toBe(false);
    expect(damages(magicOnly, boss([[], ["magic"]]))).toBe(false);
  });
});

describe("isMeleeWeapon", () => {
  it("leaves out shields, catalysts and ammunition", () => {
    expect(isMeleeWeapon(weapon())).toBe(true);
    expect(isMeleeWeapon(weapon({ category: "shield" }))).toBe(false);
    expect(isMeleeWeapon(weapon({ category: "arrow", melee: false }))).toBe(false);
  });
});

describe("spellKit", () => {
  const catalyst = weapon({
    name: "Catalyst",
    category: "catalyst/talisman/flame",
    melee: false,
    requirements: { str: 6, dex: 0, int: 10, fth: 0, att: 0 },
    casts: ["sorcery"],
  });
  const spell = (overrides: Partial<Spell> = {}): Spell => ({
    name: "Arrow",
    item: "Sorcery: Arrow",
    school: "sorcery",
    requirements: { int: 14, fth: 0 },
    slots: 1,
    damage: { phys: 0, magic: 150, fire: 0, thunder: 0 },
    ...overrides,
  });

  it("fights with the spell's damage and needs both requirements and one slot of attunement", () => {
    const kit = spellKit(spell(), catalyst);
    expect(kit?.damage.magic).toBe(150);
    expect(kit?.damage.phys).toBe(0);
    expect(kit?.requirements).toEqual({ str: 6, dex: 0, int: 14, fth: 0, att: 10 });
    expect(pointsToWield(kit ?? catalyst, { ...stats, att: 8 })).toBe(4 + 2);
  });

  it("needs a catalyst of the spell's school, and leaves out two-slot spells", () => {
    expect(spellKit(spell({ school: "miracle" }), catalyst)).toBeUndefined();
    expect(spellKit(spell({ slots: 2 }), catalyst)).toBeUndefined();
  });
});
