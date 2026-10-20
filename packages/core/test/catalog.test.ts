import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  catalog,
  modesOf,
  paramRefsOf,
  placeholdersOf,
  type MilestoneRef,
  type OrderTemplate,
} from "../src/index.js";

const orders: readonly OrderTemplate[] = catalog;
const each = it.each(orders.map((o) => [o.number, o.id, o] as const));

describe("catalog", () => {
  it("has the twenty orders of the catalog document, each once", () => {
    expect(orders.map((o) => o.number)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(new Set(orders.map((o) => o.id)).size).toBe(orders.length);
  });

  each("%i %s: text placeholders are exactly its parameters and exceptions", (_n, _id, order) => {
    const expected = [...Object.keys(order.params)];
    if (order.exceptions) expected.push(order.exceptions.placeholder);
    expect(placeholdersOf(order.text).sort()).toEqual(expected.sort());
  });

  each("%i %s: every piece refers to a declared parameter of the right kind", (_n, _id, order) => {
    for (const { param, kind } of paramRefsOf(order)) {
      expect(order.params[param]?.kind, `${param} should be a ${kind}`).toBe(kind);
    }
  });

  each("%i %s: exists in at least one mode", (_n, _id, order) => {
    expect(modesOf(order).length).toBeGreaterThan(0);
  });

  // Principle: the static mode asks the player nothing.
  each("%i %s: only live orders ask or check the actual case", (_n, _id, order) => {
    if (order.asks !== undefined || order.command.kind === "offerChoice") {
      expect(modesOf(order)).toEqual(["live"]);
    }
    expect(order.validation.static).not.toBe("actualCase");
  });

  each("%i %s: exceptions go with automatic-exception validation", (_n, _id, order) => {
    const auto = Object.values(order.validation).includes("autoException");
    expect(order.exceptions !== undefined).toBe(auto);
  });

  it("has exactly four live-only orders: 4, 12, 19 and 20", () => {
    const liveOnly = orders.filter((o) => modesOf(o).join() === "live").map((o) => o.number);
    expect(liveOnly).toEqual([4, 12, 19, 20]);
  });

  it("only names milestones that exist in the data set", () => {
    const url = new URL("../../../data/ds1/milestones.json", import.meta.url);
    const ids = new Set(
      (JSON.parse(readFileSync(url, "utf8")) as { id: string }[]).map((m) => m.id),
    );
    const fixed = (ref: MilestoneRef | undefined): string[] =>
      ref === undefined || "param" in ref
        ? []
        : "milestone" in ref
          ? [ref.milestone]
          : [...ref.firstOf];
    const named = orders.flatMap((o) => [
      ...(o.trigger.kind === "milestone" ? fixed(o.trigger.milestone) : []),
      ...(o.scope.kind === "phase" ? [...fixed(o.scope.from), ...fixed(o.scope.until)] : []),
    ]);
    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((id) => !ids.has(id))).toEqual([]);
  });

  it("keeps count ranges ordered and growing easier to harder", () => {
    for (const order of orders) {
      for (const spec of Object.values(order.params)) {
        if (spec.ranges === undefined) continue;
        const { easy, medium, hard, extreme } = spec.ranges;
        for (const [min, max] of [easy, medium, hard, extreme])
          expect(min).toBeLessThanOrEqual(max);
        expect(easy[0]).toBeGreaterThan(medium[1]);
        expect(medium[0]).toBeGreaterThan(hard[1]);
        expect(hard[0]).toBeGreaterThan(extreme[1]);
      }
    }
  });
});

describe("placeholdersOf", () => {
  it("lists each placeholder once, in order", () => {
    expect(placeholdersOf("{a} and {b}, then {a}")).toEqual(["a", "b"]);
    expect(placeholdersOf("no placeholders")).toEqual([]);
  });
});
