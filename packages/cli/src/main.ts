#!/usr/bin/env node
/**
 * Generates a static challenge and prints its manual (Markdown, or JSON with --json).
 *
 *   pnpm generate --seed ashen-one --difficulty medium --length epic --curve rising
 *   pnpm generate --seed ashen-one --class Knight --gift 2406 --level-cap 30 --json
 *   pnpm generate --seed ashen-one --players easy,hard   (one challenge for a group, with handicap)
 *
 * Without --seed, a random one is drawn and printed, so the challenge can be shared.
 */
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { GenerationRequest, loadDataSet, runGeneration } from "@darksouls-challenge/contracts";
import { parseWorld } from "@darksouls-challenge/core";
import { z } from "zod";

function main(): void {
  const { values } = parseArgs({
    options: {
      seed: { type: "string" },
      difficulty: { type: "string", default: "medium" },
      players: { type: "string" },
      length: { type: "string", default: "full" },
      curve: { type: "string" },
      class: { type: "string" },
      gift: { type: "string" },
      "level-cap": { type: "string" },
      data: { type: "string" },
      json: { type: "boolean", default: false },
    },
  });
  const dataDir = values.data
    ? pathToFileURL(values.data.replace(/[\\/]?$/, "/"))
    : new URL("../../../data/ds1/", import.meta.url);
  const world = parseWorld(loadDataSet(dataDir));
  const parsed = GenerationRequest.safeParse({
    seed: values.seed,
    players: (values.players ?? values.difficulty).split(/[\s,]+/),
    length: values.length,
    curve: values.curve,
    startingClass: values.class,
    giftRow: values.gift === undefined ? undefined : Number(values.gift),
    levelCap: values["level-cap"] === undefined ? undefined : Number(values["level-cap"]),
  });
  if (!parsed.success) throw new Error(z.prettifyError(parsed.error));
  const documents = runGeneration(world, parsed.data);
  if (values.json) {
    const out = values.players === undefined ? documents[0] : documents;
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  } else {
    process.stdout.write(documents.map((d) => d.manual).join("\n---\n\n"));
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
