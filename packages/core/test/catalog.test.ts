import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  catalog,
  modesOf,
  paramRefsOf,
  placeholdersOf,
  restrictions,
  type MilestoneRef,
  type OrderTemplate,
} from "../src/index.js";

const orders: readonly OrderTemplate[] = catalog;
const each = it.each(orders.map((o) => [o.number, o.id, o] as const));

describe("catalog", () => {
  it("has the orders of the catalog document, numbered from 1, each once", () => {
    expect(orders.map((o) => o.number)).toEqual(Array.from({ length: 23 }, (_, i) => i + 1));
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

  // The group handicap moves a number to the same relative place in an easier range; that only eases the
  // run if every bound of an easier range is at least the same bound of a harder one.
  it("gives every count a range per difficulty, never harder for an easier difficulty", () => {
    for (const order of orders) {
      for (const [name, spec] of Object.entries(order.params)) {
        if (spec.kind !== "count") continue;
        const ranges = spec.ranges;
        if (order.validation.static !== undefined)
          expect(ranges, `${order.id}.${name}`).toBeDefined();
        if (ranges === undefined) continue;
        const { easy, medium, hard, extreme } = ranges;
        for (const [min, max] of [easy, medium, hard, extreme])
          expect(min).toBeLessThanOrEqual(max);
        for (const [easier, harder] of [
          [easy, medium],
          [medium, hard],
          [hard, extreme],
        ] as const) {
          expect(easier[0]).toBeGreaterThanOrEqual(harder[0]);
          expect(easier[1]).toBeGreaterThanOrEqual(harder[1]);
        }
      }
    }
  });

  each("%i %s: has a deathless text only for a count that can be zero", (_n, _id, order) => {
    const zero = order.textIfZero;
    if (zero === undefined) return;
    expect(order.params[zero.param]?.ranges?.extreme[0]).toBe(0);
    expect(placeholdersOf(zero.text)).toEqual([]);
  });
});

describe("restrictions", () => {
  it("have unique ids and manual text", () => {
    expect(new Set(restrictions.map((r) => r.id)).size).toBe(restrictions.length);
    for (const r of restrictions) expect(r.text).toMatch(/^[A-Z].*\.$/);
  });

  it("have light ones enough for an easy curse, and heavy ones for an extreme curse", () => {
    const count = (tier: string) => restrictions.filter((r) => r.tier === tier).length;
    expect(count("light")).toBeGreaterThanOrEqual(2);
    expect(count("heavy")).toBeGreaterThanOrEqual(3);
  });
});

describe("placeholdersOf", () => {
  it("lists each placeholder once, in order", () => {
    expect(placeholdersOf("{a} and {b}, then {a}")).toEqual(["a", "b"]);
    expect(placeholdersOf("no placeholders")).toEqual([]);
  });
});
