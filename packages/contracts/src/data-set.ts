import { readFileSync } from "node:fs";
import type { RawDataSet } from "@darksouls-challenge/core";

const FILES = [
  "meta",
  "regions",
  "entrances",
  "locations",
  "classes",
  "bosses",
  "merchants",
  "milestones",
  "weapons",
  "spells",
  "areas",
  "treasures",
  "warnings",
] as const satisfies readonly (keyof RawDataSet)[];

/**
 * Reads a data set directory (`data/ds1/`) as plain JSON. The result is still untrusted: the core's
 * `parseWorld` checks it. `dir` must end with a slash, so the file names resolve inside it.
 */
export function loadDataSet(dir: URL): RawDataSet {
  const read = (file: string): unknown =>
    JSON.parse(readFileSync(new URL(`${file}.json`, dir), "utf8"));
  return Object.fromEntries(FILES.map((file) => [file, read(file)])) as Record<
    (typeof FILES)[number],
    unknown
  >;
}
