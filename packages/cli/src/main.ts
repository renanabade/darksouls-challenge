#!/usr/bin/env node
/**
 * Generates a static challenge and prints its manual (Markdown, or JSON with --json).
 *
 *   pnpm generate --seed ashen-one --difficulty medium --length epic --curve rising
 *   pnpm generate --seed ashen-one --class Knight --gift 2406 --level-cap 30 --json
 *   pnpm generate --seed ashen-one --players easy,hard   (one challenge for a group, with handicap)
 *   pnpm generate --code 8.07-K3F9QX2M7TAB              (a challenge code, as the site shows it)
 *
 * Without --seed or --code, a challenge code is drawn from the settings and printed, so the challenge can
 * be shared. A code holds every setting; with --code, only --players and --data are read.
 */
import { randomInt } from "node:crypto";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { GenerationRequest, loadDataSet, runGeneration } from "@darksouls-challenge/contracts";
import {
  CODE_DRAWS,
  dataToken,
  decodeChallengeCode,
  DIFFICULTIES,
  encodeChallengeCode,
  GENERATOR_VERSION,
  parseWorld,
  setupOptions,
  type Difficulty,
} from "@darksouls-challenge/core";
import { z } from "zod";

function main(): void {
  const { values } = parseArgs({
    options: {
      seed: { type: "string" },
      code: { type: "string" },
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
  const options = setupOptions(world);
  const code = values.code === undefined ? undefined : decodeChallengeCode(values.code, options);
  if (values.code !== undefined && code === undefined)
    throw new Error(`"${values.code}" is not a challenge code of this data set`);
  if (code !== undefined && code.generatorVersion !== GENERATOR_VERSION)
    process.stderr.write(
      `This code was made with generator ${code.generatorVersion}; this is generator ${GENERATOR_VERSION}, so it gives a different challenge.
`,
    );
  if (code !== undefined && code.dataToken !== dataToken(world.dataVersion))
    process.stderr.write(
      `This code was made with data ${code.dataToken}; this is data ${world.dataVersion}, so it gives a different challenge.
`,
    );
  const fixed = code?.config;
  const parsed = GenerationRequest.safeParse({
    seed: fixed?.seed ?? values.seed,
    players: (values.players ?? fixed?.difficulty ?? values.difficulty).split(/[\s,]+/),
    length: fixed?.length ?? values.length,
    curve: fixed === undefined ? values.curve : fixed.curve,
    startingClass: fixed === undefined ? values.class : fixed.startingClass,
    giftRow: fixed === undefined ? optionalNumber(values.gift) : fixed.giftRow,
    levelCap: fixed === undefined ? optionalNumber(values["level-cap"]) : fixed.levelCap,
  });
  if (!parsed.success) throw new Error(z.prettifyError(parsed.error));
  const request = parsed.data;
  // No seed: a code of these settings, for the hardest player (the group's challenge is drawn for them).
  if (request.seed === undefined) {
    const hardest = request.players.reduce<Difficulty>(
      (a, b) => (DIFFICULTIES.indexOf(b) > DIFFICULTIES.indexOf(a) ? b : a),
      "easy",
    );
    const { length, curve, startingClass, giftRow, levelCap } = request;
    const settings = {
      difficulty: hardest,
      length,
      ...(curve !== undefined && { curve }),
      ...(startingClass !== undefined && { startingClass }),
      ...(giftRow !== undefined && { giftRow }),
      ...(levelCap !== undefined && { levelCap }),
    };
    request.seed = encodeChallengeCode(options, settings, randomInt(CODE_DRAWS), {
      generator: GENERATOR_VERSION,
      data: world.dataVersion,
    });
  }
  const documents = runGeneration(world, request);
  if (values.json) {
    const out = values.players === undefined ? documents[0] : documents;
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  } else {
    process.stdout.write(documents.map((d) => d.manual).join("\n---\n\n"));
  }
}

function optionalNumber(text: string | undefined): number | undefined {
  return text === undefined ? undefined : Number(text);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
