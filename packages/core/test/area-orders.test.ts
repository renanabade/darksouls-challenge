import { describe, expect, it } from "vitest";
import {
  catalog,
  InvalidOrderError,
  orderText,
  parseWorld,
  validate,
  type ArgValue,
  type OrderInstance,
  type OrderTemplate,
  type Setup,
} from "../src/index.js";
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
