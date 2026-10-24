import type { Difficulty, Length, SetupOptions } from "@darksouls-challenge/core";

/** What the form holds. An empty class or gift is drawn by the seed. */
export interface FormState {
  readonly seed: string;
  readonly startingClass: string;
  readonly giftRow: string;
  readonly difficulty: Difficulty;
  readonly length: Length;
}

export const DEFAULT_FORM: FormState = {
  seed: "",
  startingClass: "",
  giftRow: "",
  difficulty: "medium",
  length: "full",
};

/**
 * The link of a challenge: its seed, its settings and the generator version that drew it. Settings drawn
 * by the seed are left out, so the link stays short.
 */
export function toQuery(form: FormState, generatorVersion: string): string {
  const params = new URLSearchParams();
  params.set("seed", form.seed);
  if (form.startingClass !== "") params.set("class", form.startingClass);
  if (form.giftRow !== "") params.set("gift", form.giftRow);
  params.set("difficulty", form.difficulty);
  params.set("length", form.length);
  params.set("v", generatorVersion);
  return params.toString();
}

export interface Permalink {
  readonly form: FormState;
  /** The generator version the link was made with; absent on a link without one. */
  readonly version?: string;
}

/**
 * Reads a link back. Values the options do not hold are dropped, so a hand-edited link falls back to the
 * defaults instead of failing. Undefined when the link has no seed: nothing to generate.
 */
export function fromQuery(search: string, options: SetupOptions): Permalink | undefined {
  const params = new URLSearchParams(search);
  const seed = params.get("seed")?.trim() ?? "";
  if (seed === "") return undefined;
  const pick = <T extends string>(value: string | null, values: readonly T[], fallback: T): T =>
    values.find((v) => v === value) ?? fallback;
  const startingClass = params.get("class") ?? "";
  const gift = params.get("gift") ?? "";
  const version = params.get("v");
  return {
    form: {
      seed: seed.slice(0, 64),
      startingClass: options.classes.some((c) => c.name === startingClass) ? startingClass : "",
      giftRow: options.gifts.some((g) => String(g.row) === gift) ? gift : "",
      difficulty: pick(params.get("difficulty"), options.difficulties, DEFAULT_FORM.difficulty),
      length: pick(params.get("length"), options.lengths, DEFAULT_FORM.length),
    },
    ...(version !== null && { version }),
  };
}
