import { describe, expect, it } from "vitest";
import {
  catalog,
  generate,
  InvalidOrderError,
  orderText,
  parseWorld,
  renderManual,
  validate,
  type ArgValue,
  type OrderInstance,
  type OrderTemplate,
  type Setup,
} from "../src/index.js";
import { domainsOf } from "../src/generator/draw.js";
import { readDataSet } from "./ds1.js";

const order = (id: string, args: Record<string, ArgValue>): OrderInstance => ({
  template: catalog.find((o) => o.id === id) as OrderTemplate,
  args,
});

// Block 13: orders about what an area holds, on the DS1 data set.
describe("area orders", () => {
  const world = parseWorld(readDataSet());
  const gift = world.gifts[0];
  if (gift === undefined) throw new Error("missing gift");
  const setup: Setup = { mode: "static", gift, startingClass: "Knight", levelCap: 60 };
  const chestsIn = (area: string) =>
    world.chests.filter((c) => world.regions.get(c.region)?.area === area).length;

  it("reads the chests of the world, without the Firelink rescue chest", () => {
    expect(world.chests.length).toBeGreaterThan(50);
    expect(chestsIn("anor-londo")).toBeGreaterThan(5);
  });

  it("needs every crystal lizard of the area within reach before the milestone", () => {
    // The Crystal Cave lies past the Duke's Archives, which open once the Lordvessel is placed.
    const hunt = (until: string) => order("lizard-hunt", { area: "crystal-cave", until });
    expect(validate(world, setup, [hunt("lordvessel-placed")]).problems).toEqual([
      "not every crystal lizard of crystal-cave can be reached before Lordvessel placed at the Firelink Altar",
    ]);
    expect(validate(world, setup, [hunt("boss-gwyn-lord-of-cinder")]).verdict).toBe("comfortable");
    expect(() =>
      validate(world, setup, [order("lizard-hunt", { area: "depths", until: "both-bells" })]),
    ).toThrow(InvalidOrderError);
  });

  it("counts the chests in the text, and refuses a wrong count", () => {
    const chests = chestsIn("anor-londo");
    const all = order("every-chest", {
      area: "anor-londo",
      chests,
      until: "boss-gwyn-lord-of-cinder",
    });
    expect(validate(world, setup, [all]).verdict).toBe("comfortable");
    expect(orderText(world, { ...all, exceptions: [] })).toBe(
      `In Anor Londo: open all ${String(chests)} chests before you defeat Gwyn, Lord of Cinder.`,
    );
    expect(() =>
      validate(world, setup, [{ ...all, args: { ...all.args, chests: chests + 1 } }]),
    ).toThrow(InvalidOrderError);
  });

  // Block 14: errands and routes.
  it("sends the player for a pickup only when it can be taken in time", () => {
    const found = world.locations.find(
      (l) => l.found === true && l.kind === "weapon" && l.region.startsWith("anor-londo"),
    );
    if (found === undefined) throw new Error("no weapon to find in Anor Londo");
    const errand = (until: string) => order("errand", { location: found.name, until });
    expect(validate(world, setup, [errand("both-bells")]).verdict).toBe("impossible");
    expect(validate(world, setup, [errand("lordvessel-placed")]).verdict).toBe("comfortable");
  });

  it("closes an area until a milestone only when another way exists", () => {
    const closed = (area: string, until: string) => order("the-other-way", { area, until });
    expect(validate(world, setup, [closed("depths", "both-bells")]).verdict).toBe("comfortable");
    expect(validate(world, setup, [closed("undead-parish", "bell-undead-parish")]).verdict).toBe(
      "impossible",
    );
    const hunt = order("lizard-hunt", { area: "crystal-cave", until: "boss-gwyn-lord-of-cinder" });
    expect(
      validate(world, setup, [hunt, closed("crystal-cave", "boss-gwyn-lord-of-cinder")]).problems,
    ).toContain("lizard-hunt sends you into crystal-cave, which the-other-way closes");
  });

  it("marks the journey's forbidden area in its chapter", () => {
    for (const seed of ["forbid-1", "forbid-2", "forbid-3", "forbid-4", "forbid-5", "forbid-6"]) {
      const challenge = generate(world, { seed, difficulty: "medium", length: "full" });
      const area = challenge.orders.find((o) => o.template.id === "forbidden-area")?.args["area"];
      if (typeof area !== "string") continue;
      expect(renderManual(world, challenge)).toContain(
        `${world.areas.get(area)?.name ?? area} (forbidden)`,
      );
      return;
    }
    throw new Error("no sample journey forbids an area");
  }, 60_000);

  // E11 and E12: those two bonfires are not always lit. One bonfire must not name them.
  // No bonfire still may: it never asks the player to rest at one of them.
  it("does not draw the Firelink Shrine bonfire or the first Anor Londo bonfire", () => {
    const domains = domainsOf(world);
    const offered = [...domains.bonfiresByArea.values()].flat();
    expect(offered).not.toContain("FS: Firelink Shrine Bonfire");
    expect(offered).not.toContain("AL: Anor Londo Bonfire");
    expect(domains.bonfiresByArea.get("anor-londo")).toEqual([
      "AL: Anor Londo - Residence Bonfire",
      "AL: Chamber of the Princess Bonfire",
      "AL: Darkmoon Tomb Bonfire",
    ]);
    expect(domains.bonfiresByArea.has("firelink-shrine")).toBe(false);
    expect(domains.areasWithBonfires).toEqual(
      expect.arrayContaining(["firelink-shrine", "anor-londo"]),
    );
  });

  it("names a bonfire without its area code", () => {
    const one = order("one-bonfire", {
      area: "anor-londo",
      bonfire: "AL: Darkmoon Tomb Bonfire",
    });
    expect(orderText(world, { ...one, exceptions: [] })).toBe(
      "In Anor Londo: rest only at the Darkmoon Tomb Bonfire.",
    );
  });
});
