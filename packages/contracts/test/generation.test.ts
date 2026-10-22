import { generate, parseWorld } from "@darksouls-challenge/core";
import { describe, expect, it } from "vitest";
import { GenerationRequest, loadDataSet, runGeneration } from "../src/index.js";

const world = parseWorld(loadDataSet(new URL("../../../data/ds1/", import.meta.url)));

describe("GenerationRequest", () => {
  it("fills the defaults: one medium player, full length", () => {
    expect(GenerationRequest.parse({})).toEqual({ players: ["medium"], length: "full" });
  });

  it("refuses unknown fields, unknown difficulties and empty groups", () => {
    expect(GenerationRequest.safeParse({ sede: "x" }).success).toBe(false);
    expect(GenerationRequest.safeParse({ players: ["brutal"] }).success).toBe(false);
    expect(GenerationRequest.safeParse({ players: [] }).success).toBe(false);
    expect(GenerationRequest.safeParse({ levelCap: 0 }).success).toBe(false);
    expect(GenerationRequest.safeParse({ seed: "   " }).success).toBe(false);
  });
});

// Each generation validates its orders against the whole game: a few seconds on a slow machine.
describe("runGeneration", { timeout: 60_000 }, () => {
  it("gives a single player the core's solo challenge", () => {
    const request = GenerationRequest.parse({ seed: "ashen-one", players: ["hard"] });
    const [document] = runGeneration(world, request);
    const solo = generate(world, { seed: "ashen-one", difficulty: "hard", length: "full" });
    expect(document?.orders.map((o) => o.id)).toEqual(solo.orders.map((o) => o.template.id));
    expect(document?.manual).toContain("#");
  });

  it("draws a seed when none is given, and records it", () => {
    const [document] = runGeneration(world, GenerationRequest.parse({}), () => "drawn");
    expect(document?.config.seed).toBe("drawn");
  });

  it("gives a group one challenge per player, in order", () => {
    const request = GenerationRequest.parse({ seed: "group", players: ["easy", "extreme"] });
    const documents = runGeneration(world, request);
    expect(documents.map((d) => d.config.difficulty)).toEqual(["easy", "extreme"]);
  });

  it("is plain JSON: the same after a round trip", () => {
    const [document] = runGeneration(world, GenerationRequest.parse({ seed: "json" }));
    expect(JSON.parse(JSON.stringify(document))).toEqual(document);
  });
});
