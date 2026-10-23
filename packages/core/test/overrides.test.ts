import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// data/ds1/overrides.json: the corrections the export applies on top of the DSAP graph (SCHEMA.md). The export
// fails on a missing target; these tests check, on the exported files, that every override still names a record
// and that the record carries the correction, so a re-export that loses a fix fails here.

type Row = Record<string, unknown>;
interface Override {
  readonly id: string;
  readonly file: string;
  readonly op: "add" | "remove" | "replace" | "condition";
  readonly match?: Row;
  readonly value?: unknown;
  readonly field?: string;
  readonly source: string;
}

const read = (file: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../../data/ds1/${file}.json`, import.meta.url), "utf8"));

// A source cites the game: an event, a flag, a talk script, a map, a param row, or a test in play.
const GAME_EVIDENCE =
  /\b(Event_\d+|flags? \d+|t\d{6}|m\d{2}_\d{2}_\d{2}_\d{2}|[A-Z]\w*Param|in-game test)\b/;
// Never a path into the private pipeline.
const PRIVATE_PATH = /\\|\b(knowledge|tools|notes|gamefiles)\/|\.(py|md|json)\b/;

const equal = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const matches = (row: Row, match: Row): boolean =>
  Object.entries(match).every(([k, v]) => equal(row[k], v));
/** True when `requirement` holds `part` as itself or as a member of an `all`, at any depth. */
const contains = (requirement: unknown, part: unknown): boolean => {
  if (equal(requirement, part)) return true;
  const all = (requirement as { all?: unknown[] } | null)?.all;
  return Array.isArray(all) && all.some((r) => contains(r, part));
};

/** What is wrong with one override against the exported data; empty when it is applied. */
function overrideProblems(o: Override, data: (file: string) => unknown): string[] {
  const problems: string[] = [];
  if (!GAME_EVIDENCE.test(o.source)) problems.push(`${o.id}: source cites no game evidence`);
  if (PRIVATE_PATH.test(o.source)) problems.push(`${o.id}: source names a private path`);
  const rows = data(o.file);
  if (!Array.isArray(rows)) return [...problems, `${o.id}: ${o.file} is not a list file`];
  const list = rows as Row[];
  const match = o.match ?? (o.value as Row);
  const hits = list.filter((r) => matches(r, match));
  if (o.op === "remove") {
    if (hits.length > 0) problems.push(`${o.id}: the removed record is still there`);
    return problems;
  }
  if (hits.length !== 1)
    return [...problems, `${o.id}: target matches ${String(hits.length)} records`];
  const [row] = hits as [Row];
  if (o.op === "add" && !matches(row, o.value as Row)) problems.push(`${o.id}: not added`);
  if (o.op === "replace" && !matches(row, o.value as Row)) problems.push(`${o.id}: not replaced`);
  if (o.op === "condition" && !contains(row[o.field ?? "requires"], o.value))
    problems.push(`${o.id}: condition not applied`);
  return problems;
}

describe("data overrides", () => {
  const { overrides } = read("overrides") as { overrides: Override[] };

  it("have unique ids and known ops", () => {
    expect(new Set(overrides.map((o) => o.id)).size).toBe(overrides.length);
    for (const o of overrides) expect(["add", "remove", "replace", "condition"]).toContain(o.op);
  });

  it("are all applied to the exported data, each citing the game", () => {
    expect(overrides.flatMap((o) => overrideProblems(o, read))).toEqual([]);
  });

  it("are checked against the exported records", () => {
    const rows = [
      { from: "a", to: "b", requires: true },
      { from: "b", to: "c", requires: { all: [{ has: "x" }, { has: "y" }] } },
    ];
    const data = (file: string) => (file === "entrances" ? rows : undefined);
    const base = { file: "entrances", source: "m10_00_00_00 Event_11000532" } as const;
    const check = (o: Partial<Override>) =>
      overrideProblems({ ...base, id: "T", op: "add", ...o }, data);
    expect(check({ op: "condition", match: { from: "b" }, value: { has: "y" } })).toEqual([]);
    expect(check({ op: "replace", match: { from: "a" }, value: { requires: true } })).toEqual([]);
    expect(check({ op: "add", value: { from: "a", to: "b" } })).toEqual([]);
    expect(check({ op: "remove", match: { from: "z" } })).toEqual([]);
    expect(check({ op: "remove", match: { from: "a" } })).toEqual([
      "T: the removed record is still there",
    ]);
    expect(check({ op: "condition", match: { from: "z" }, value: true })).toEqual([
      "T: target matches 0 records",
    ]);
    expect(check({ op: "condition", match: { from: "a" }, value: { has: "y" } })).toEqual([
      "T: condition not applied",
    ]);
    expect(check({ file: "meta", op: "remove", match: {} })).toEqual([
      "T: meta is not a list file",
    ]);
    expect(check({ op: "remove", match: {}, source: "private research notes" })).toContain(
      "T: source cites no game evidence",
    );
    expect(
      check({ op: "remove", match: { from: "z" }, source: "Event_1 in knowledge/notes/x.md" }),
    ).toEqual(["T: source names a private path"]);
  });
});
