import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

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
});
