import { readFileSync } from "node:fs";
import type { RawDataSet } from "../src/index.js";

/** Reads data/ds1 the way a caller of the core would: plain JSON, still untrusted. */
export function readDataSet(): RawDataSet {
  const read = (file: string): unknown =>
    JSON.parse(readFileSync(new URL(`../../../data/ds1/${file}.json`, import.meta.url), "utf8"));
  return {
    meta: read("meta"),
    regions: read("regions"),
    entrances: read("entrances"),
    locations: read("locations"),
    classes: read("classes"),
    bosses: read("bosses"),
  };
}

export function readMandatory(): { items: string[]; regions: string[] } {
  const url = new URL("../../../data/ds1/mandatory.json", import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as { items: string[]; regions: string[] };
}
