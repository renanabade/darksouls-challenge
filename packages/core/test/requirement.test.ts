import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  evaluate,
  itemsOf,
  parseRequirement,
  RequirementParseError,
  type Requirement,
  type RequirementContext,
} from "../src/index.js";

const context = (items: string[], regions: string[] = []): RequirementContext => ({
  has: (item) => items.includes(item),
  reached: (region) => regions.includes(region),
});

describe("evaluate", () => {
  it("handles constants", () => {
    expect(evaluate(true, context([]))).toBe(true);
    expect(evaluate(false, context([]))).toBe(false);
  });

  it("checks items and regions against the context", () => {
    expect(evaluate({ has: "Master Key" }, context(["Master Key"]))).toBe(true);
    expect(evaluate({ has: "Master Key" }, context([]))).toBe(false);
    expect(evaluate({ region: "firelink-shrine" }, context([], ["firelink-shrine"]))).toBe(true);
  });

  it("combines with all / any, including nesting", () => {
    const req: Requirement = {
      all: [{ region: "sens-fortress" }, { any: [{ has: "Cage Key" }, { has: "Master Key" }] }],
    };
    expect(evaluate(req, context(["Master Key"], ["sens-fortress"]))).toBe(true);
    expect(evaluate(req, context(["Master Key"]))).toBe(false);
    expect(evaluate(req, context([], ["sens-fortress"]))).toBe(false);
  });
});

describe("itemsOf", () => {
  it("collects every item named anywhere in the expression", () => {
    const req: Requirement = { all: [{ has: "A" }, { any: [{ has: "B" }, { region: "r" }] }] };
    expect([...itemsOf(req)].sort()).toEqual(["A", "B"]);
  });
});

describe("parseRequirement", () => {
  it("accepts every shape of the schema", () => {
    const raw = { any: [true, { has: "A" }, { all: [{ region: "r" }, false] }] };
    expect(parseRequirement(raw)).toEqual(raw);
  });

  it.each([
    [null, "$"],
    [[], "$"],
    [{}, "$"],
    [{ has: "A", region: "r" }, "$"],
    [{ has: "" }, "$.has"],
    [{ all: [] }, "$.all"],
    [{ any: [{ has: "A" }, { nope: 1 }] }, "$.any[1]"],
  ])("rejects %j with the path of the bad node", (raw, path) => {
    expect(() => parseRequirement(raw)).toThrow(RequirementParseError);
    try {
      parseRequirement(raw);
    } catch (error) {
      expect((error as RequirementParseError).path).toBe(path);
    }
  });

  it("parses every requirement in the DS1 data set", () => {
    const url = new URL("../../../data/ds1/entrances.json", import.meta.url);
    const entrances = JSON.parse(readFileSync(url, "utf8")) as { requires: unknown }[];
    expect(entrances.length).toBeGreaterThan(0);
    for (const [i, entrance] of entrances.entries()) {
      expect(() => parseRequirement(entrance.requires, `entrances[${String(i)}]`)).not.toThrow();
    }
  });
});
