import type { SetupOptions } from "@darksouls-challenge/core";
import { describe, expect, it } from "vitest";
import { DEFAULT_FORM, fromQuery, toQuery } from "../src/permalink.js";

const options: SetupOptions = {
  classes: [{ name: "Knight", level: 9, stats: { str: 11, dex: 11, int: 9, fth: 11, att: 10 } }],
  gifts: [
    { row: 2400, label: "None" },
    { row: 2406, label: "Master Key" },
  ],
  difficulties: ["easy", "medium", "hard", "extreme"],
  lengths: ["short", "full", "epic"],
};

describe("permalink", () => {
  it("reads back the seed, the settings and the generator version", () => {
    const form = {
      seed: "ashen-one",
      startingClass: "Knight",
      giftRow: "2406",
      difficulty: "hard",
      length: "epic",
    } as const;
    const query = toQuery(form, "7");
    expect(query).toBe("seed=ashen-one&class=Knight&gift=2406&difficulty=hard&length=epic&v=7");
    expect(fromQuery(`?${query}`, options)).toEqual({ form, version: "7" });
  });

  it("leaves out what the seed draws", () => {
    expect(toQuery({ ...DEFAULT_FORM, seed: "x" }, "7")).toBe(
      "seed=x&difficulty=medium&length=full&v=7",
    );
  });

  it("drops values the options do not hold, and needs a seed", () => {
    const link = fromQuery("?seed=x&class=Wizard&gift=1&difficulty=insane&length=long", options);
    expect(link).toEqual({ form: { ...DEFAULT_FORM, seed: "x" } });
    expect(fromQuery("?class=Knight", options)).toBeUndefined();
    expect(fromQuery("?seed=%20", options)).toBeUndefined();
  });
});
