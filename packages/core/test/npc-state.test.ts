import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseWorld, reach } from "../src/index.js";
import { readDataSet } from "./ds1.js";

// NPC and shop state from the game's scripts (issue 38), checked on the exported data set.

interface Merchant {
  readonly id: string;
  readonly stock: readonly { readonly name: string | null }[];
  readonly exclusive?: readonly {
    readonly id: string;
    readonly options: readonly { readonly flag: number; readonly items: readonly string[] }[];
  }[];
}

const read = (file: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../../data/ds1/${file}.json`, import.meta.url), "utf8"));
const merchants = new Map((read("merchants") as Merchant[]).map((m) => [m.id, m]));

describe("NPC state", () => {
  // E7: Domhnall sells the set of whichever of Ornstein and Smough dies last, never both.
  it("gives Domhnall's Ornstein and Smough sets as exclusive options", () => {
    const domhnall = merchants.get("domhnall-of-zena");
    const group = domhnall?.exclusive?.find((g) => g.id === "ornstein-or-smough");
    expect(group?.options.map((o) => o.flag)).toEqual([11510902, 11510903]);
    const [ornstein, smough] = group?.options.map((o) => o.items) ?? [];
    expect(ornstein?.every((i) => i.startsWith("Ornstein's"))).toBe(true);
    expect(smough?.every((i) => i.startsWith("Smough's"))).toBe(true);
    const stock = new Set(domhnall?.stock.map((s) => s.name));
    expect([...(ornstein ?? []), ...(smough ?? [])].filter((i) => !stock.has(i))).toEqual([]);
  });

  const world = parseWorld(readDataSet());
  const without = (item: string) => reach(world, { forbiddenItems: new Set([item]) }).regions;

  // E9: Domhnall comes to Firelink once both bells are rung, wherever the player has been.
  it("brings Domhnall to Firelink after both bells", () => {
    const edge = world.entrances.find((e) => e.to === "firelink-shrine-domhnall-of-zena");
    expect(edge?.requires).toEqual({
      all: [{ has: "Bell of Awakening #1" }, { has: "Bell of Awakening #2" }],
    });
    expect(without("Bell of Awakening #2").has("firelink-shrine-domhnall-of-zena")).toBe(false);
  });

  // E8 and E14: Logan sells at Firelink once rescued, and in the Archives before Seath dies.
  it("opens Logan's shops at Firelink and in the Archives without Seath", () => {
    const logan = world.merchants.get("logan");
    expect(logan?.regions).toEqual([
      "firelink-shrine-big-hat-logan",
      "the-dukes-archives-big-hat-logan",
    ]);
    const noSeath = without("Seath the Scaleless Defeated");
    expect(noSeath.has("the-dukes-archives-big-hat-logan")).toBe(true);
    expect(noSeath.has("firelink-shrine-big-hat-logan")).toBe(true);
    const sold = world.locations.filter((l) => l.region === "firelink-shrine-big-hat-logan");
    expect(sold.map((l) => l.item)).toContain("Sorcery: Soul Spear");
    const noCage = reach(world, { forbiddenRegions: new Set(["sens-fortress-after-cage-key"]) });
    expect(noCage.regions.has("firelink-shrine-big-hat-logan")).toBe(false);
  });
});
