#!/usr/bin/env node
/**
 * Generates a static challenge and prints its manual (Markdown, or JSON with --json).
 *
 *   pnpm generate --seed ashen-one --difficulty medium --length full
 *   pnpm generate --seed ashen-one --class Knight --gift 2406 --level-cap 30 --json
 *
 * Without --seed, a random one is drawn and printed, so the challenge can be shared.
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import {
  generate,
  orderText,
  parseWorld,
  renderManual,
  type Difficulty,
  type Length,
  type RawDataSet,
} from "@darksouls-challenge/core";

const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard", "extreme"];
const LENGTHS: readonly Length[] = ["short", "full"];

function readDataSet(dir: URL): RawDataSet {
  const read = (file: string): unknown =>
    JSON.parse(readFileSync(new URL(`${file}.json`, dir), "utf8"));
  return {
    meta: read("meta"),
    regions: read("regions"),
    entrances: read("entrances"),
    locations: read("locations"),
    classes: read("classes"),
    bosses: read("bosses"),
    merchants: read("merchants"),
    milestones: read("milestones"),
    weapons: read("weapons"),
    areas: read("areas"),
  };
}

function oneOf<T extends string>(name: string, value: string, allowed: readonly T[]): T {
  if (!(allowed as readonly string[]).includes(value))
    throw new Error(`--${name} must be one of: ${allowed.join(", ")}`);
  return value as T;
}

function main(): void {
  const { values } = parseArgs({
    options: {
      seed: { type: "string" },
      difficulty: { type: "string", default: "medium" },
      length: { type: "string", default: "full" },
      class: { type: "string" },
      gift: { type: "string" },
      "level-cap": { type: "string" },
      data: { type: "string" },
      json: { type: "boolean", default: false },
    },
  });
  const dataDir = values.data
    ? new URL(`file:///${values.data.replace(/\\/g, "/").replace(/\/?$/, "/")}`)
    : new URL("../../../data/ds1/", import.meta.url);
  const world = parseWorld(readDataSet(dataDir));
  const challenge = generate(world, {
    seed: values.seed ?? randomBytes(4).toString("hex"),
    difficulty: oneOf("difficulty", values.difficulty, DIFFICULTIES),
    length: oneOf("length", values.length, LENGTHS),
    ...(values.class !== undefined && { startingClass: values.class }),
    ...(values.gift !== undefined && { giftRow: Number(values.gift) }),
    ...(values["level-cap"] !== undefined && { levelCap: Number(values["level-cap"]) }),
  });
  if (values.json) {
    const orders = challenge.orders.map((o) => ({
      id: o.template.id,
      args: o.args,
      exceptions: o.exceptions,
      text: orderText(world, o),
    }));
    process.stdout.write(`${JSON.stringify({ ...challenge, orders }, null, 2)}\n`);
  } else {
    process.stdout.write(renderManual(world, challenge));
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
