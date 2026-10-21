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
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import {
  CURVES,
  DIFFICULTIES,
  generate,
  generateGroup,
  LENGTHS,
  orderText,
  parseWorld,
  renderManual,
  type Challenge,
  type RawDataSet,
} from "@darksouls-challenge/core";

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
    spells: read("spells"),
    areas: read("areas"),
    treasures: read("treasures"),
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
    ? new URL(`file:///${values.data.replace(/\\/g, "/").replace(/\/?$/, "/")}`)
    : new URL("../../../data/ds1/", import.meta.url);
  const world = parseWorld(readDataSet(dataDir));
  const config = {
    seed: values.seed ?? randomBytes(4).toString("hex"),
    length: oneOf("length", values.length, LENGTHS),
    ...(values.curve !== undefined && { curve: oneOf("curve", values.curve, CURVES) }),
    ...(values.class !== undefined && { startingClass: values.class }),
    ...(values.gift !== undefined && { giftRow: Number(values.gift) }),
    ...(values["level-cap"] !== undefined && { levelCap: Number(values["level-cap"]) }),
  };
  const challenges: Challenge[] =
    values.players === undefined
      ? [
          generate(world, {
            ...config,
            difficulty: oneOf("difficulty", values.difficulty, DIFFICULTIES),
          }),
        ]
      : generateGroup(
          world,
          config,
          values.players.split(/[\s,]+/).map((d) => oneOf("players", d, DIFFICULTIES)),
        );
  if (values.json) {
    const json = challenges.map((challenge) => ({
      ...challenge,
      orders: challenge.orders.map((o) => ({
        id: o.template.id,
        ...(o.chapter !== undefined && { chapter: o.chapter }),
        args: o.args,
        exceptions: o.exceptions,
        text: orderText(world, o),
      })),
    }));
    const out = values.players === undefined ? json[0] : json;
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  } else {
    process.stdout.write(challenges.map((c) => renderManual(world, c)).join("\n---\n\n"));
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
