import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseWorld, reach, startingItems } from "../src/index.js";
import { readDataSet } from "./ds1.js";

// NPC and shop state from the game's scripts (issue 38), checked on the exported data set.

interface Merchant {
  readonly id: string;
  readonly regions: readonly string[];
  readonly leaves?: readonly { readonly flag: number; readonly when: string }[];
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

  // E18: Kaathe appears after the Four Kings only while the Lordvessel is not placed, and leaves for
  // good once refused or attacked.
  it("opens Kaathe after the Four Kings, before the Lordvessel is placed", () => {
    const kaathe = merchants.get("darkstalker-kaathe");
    expect(kaathe?.regions).toEqual(["the-abyss-darkstalker-kaathe"]);
    expect(kaathe?.leaves?.map((l) => l.flag)).toEqual([1677]);
    const edge = world.entrances.find((e) => e.to === "the-abyss-darkstalker-kaathe");
    expect(edge?.before).toBe("Lordvessel Placed");
    expect(reach(world).regions.has("the-abyss-darkstalker-kaathe")).toBe(true);
    const placed = reach(world, { items: ["Lordvessel Placed"] });
    expect(placed.regions.has("the-abyss-darkstalker-kaathe")).toBe(false);
    expect(without("Four Kings Defeated").has("the-abyss-darkstalker-kaathe")).toBe(false);
  });

  // E15: Rhea is lost once two more main bosses die after she reaches the Parish, or once her stock is
  // bought out; her shop, opened by the rescue in the Tomb of the Giants, stays on the graph.
  it("records the two ways Rhea leaves, after the Tomb of the Giants", () => {
    const rhea = merchants.get("rhea-of-thorolund");
    expect(rhea?.leaves?.map((l) => l.flag)).toEqual([1177, 1181]);
    const shop = reach(world, { forbiddenRegions: new Set(["tomb-of-the-giants"]) });
    expect(rhea?.regions.some((r) => shop.regions.has(r))).toBe(false);
  });

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

  // E13: Quelana waits for an upgraded Pyromancy Flame (Laurentius or Eingyi upgrades it), and leaves for
  // good if the Bed of Chaos dies before she is met.
  it("opens Quelana with a Pyromancy Flame and an upgrader, before the Bed of Chaos dies", () => {
    const quelana = "lower-blighttown-quelana-of-izalith";
    const laurentius = "firelink-shrine-laurentius-of-the-great-swamp";
    const edge = world.entrances.find((e) => e.to === quelana);
    expect(edge?.before).toBe("Bed of Chaos Defeated");
    const noGift = { mode: "static", gift: { row: 0, items: [] } } as const;
    const pyromancer = startingItems(world, { ...noGift, startingClass: "Pyromancer" });
    const knight = startingItems(world, { ...noGift, startingClass: "Knight" });
    const noLaurentius = new Set([laurentius]);
    expect(pyromancer).toContain("Pyromancy Flame");
    expect(
      reach(world, { items: pyromancer, forbiddenRegions: noLaurentius }).regions.has(quelana),
    ).toBe(true);
    expect(
      reach(world, { items: knight, forbiddenRegions: noLaurentius }).regions.has(quelana),
    ).toBe(false);
    expect(reach(world, { items: knight }).regions.has(quelana)).toBe(true);
    const bedDead = reach(world, { items: [...knight, "Bed of Chaos Defeated"] });
    expect(bedDead.regions.has(quelana)).toBe(false);
  });
});
