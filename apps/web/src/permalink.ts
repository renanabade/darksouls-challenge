import {
  dataToken,
  decodeChallengeCode,
  type ChallengeCode,
  type Difficulty,
  type GeneratorConfig,
  type Length,
  type SetupOptions,
} from "@darksouls-challenge/core";

/** What the form holds. An empty class or gift is drawn by the seed; an empty code asks for a new challenge. */
export interface FormState {
  readonly code: string;
  readonly startingClass: string;
  readonly giftRow: string;
  readonly difficulty: Difficulty;
  readonly length: Length;
}

export const DEFAULT_FORM: FormState = {
  code: "",
  startingClass: "",
  giftRow: "",
  difficulty: "medium",
  length: "full",
};

/** The site's own versions, which a link is checked against. */
export interface Versions {
  readonly generator: string;
  readonly data: string;
}

/** The link of a challenge: its code, which holds every setting and both versions. */
export function toQuery(code: string): string {
  return new URLSearchParams({ c: code }).toString();
}

/** The form's settings for a code's challenge: what the code fixes, the rest drawn. */
export function formOf(code: ChallengeCode): FormState {
  const { config } = code;
  return {
    code: "",
    startingClass: config.startingClass ?? "",
    giftRow: config.giftRow === undefined ? "" : String(config.giftRow),
    difficulty: config.difficulty,
    length: config.length,
  };
}

/** The generator's config for the form's settings, under a seed (a code, or a legacy link's seed). */
export function configOf(form: FormState, seed: string): GeneratorConfig {
  return { seed, ...settingsOf(form) };
}

/** The form's settings, as a challenge code holds them. */
export function settingsOf(form: FormState): Omit<GeneratorConfig, "seed"> {
  return {
    difficulty: form.difficulty,
    length: form.length,
    ...(form.startingClass !== "" && { startingClass: form.startingClass }),
    ...(form.giftRow !== "" && { giftRow: Number(form.giftRow) }),
  };
}

/** Why a code may not give the challenge it gave when it was made: another generator or data set. */
export function versionNotices(code: ChallengeCode, versions: Versions): string[] {
  const notices: string[] = [];
  if (code.generatorVersion !== versions.generator)
    notices.push(
      `This code was made with generator ${code.generatorVersion}. This site runs generator ${versions.generator}, so the same code now gives a different challenge.`,
    );
  if (code.dataToken !== dataToken(versions.data))
    notices.push(
      `This code was made with data ${code.dataToken}. This site runs data ${versions.data}, so the same code now gives a different challenge.`,
    );
  return notices;
}

/**
 * What a link asks for: a challenge code; a legacy link's seed and settings (from before the codes,
 * generator 7 and earlier); or, with no seed, only settings for a new challenge.
 */
export type Link =
  | { readonly kind: "code"; readonly code: ChallengeCode }
  | { readonly kind: "seed"; readonly form: FormState; readonly seed: string }
  | { readonly kind: "settings"; readonly form: FormState };

export interface ReadLink {
  /** Undefined when the link asks for nothing the page can generate. */
  readonly link?: Link;
  /** What the link held that the page could not use, and why the challenge may differ from the shared one. */
  readonly notices: readonly string[];
}

/** Reads a link back. Values the options do not hold are dropped with a notice, never silently. */
export function fromQuery(search: string, options: SetupOptions, versions: Versions): ReadLink {
  const params = new URLSearchParams(search);
  const code = params.get("c");
  if (code !== null) {
    const decoded = decodeChallengeCode(code, options);
    if (decoded === undefined)
      return { notices: [`"${code.slice(0, 40)}" in this link is not a challenge code.`] };
    return { link: { kind: "code", code: decoded }, notices: versionNotices(decoded, versions) };
  }

  const notices: string[] = [];
  const pick = <T extends string>(name: string, values: readonly T[], fallback: T): T => {
    const value = params.get(name);
    if (value === null) return fallback;
    const found = values.find((v) => v === value);
    if (found === undefined)
      notices.push(
        `The link's ${name} "${value.slice(0, 40)}" is not one of the options: ${fallback} is used.`,
      );
    return found ?? fallback;
  };
  const drawn = (name: string, value: string | null, valid: boolean): string => {
    if (value === null || value === "") return "";
    if (!valid)
      notices.push(
        `The link's ${name} "${value.slice(0, 40)}" is not one of the options: it is drawn.`,
      );
    return valid ? value : "";
  };
  const startingClass = params.get("class");
  const gift = params.get("gift");
  const form: FormState = {
    code: "",
    startingClass: drawn(
      "class",
      startingClass,
      options.classes.some((c) => c.name === startingClass),
    ),
    giftRow: drawn(
      "gift",
      gift,
      options.gifts.some((g) => String(g.row) === gift),
    ),
    difficulty: pick("difficulty", options.difficulties, DEFAULT_FORM.difficulty),
    length: pick("length", options.lengths, DEFAULT_FORM.length),
  };
  const asksSomething = ["seed", "class", "gift", "difficulty", "length"].some((p) =>
    params.has(p),
  );
  if (!asksSomething) return { notices: [] };
  const seed = params.get("seed")?.trim() ?? "";
  if (seed === "") return { link: { kind: "settings", form }, notices };
  const version = params.get("v");
  if (version !== versions.generator)
    notices.push(
      version === null
        ? `This link does not say which generator made it. This site runs generator ${versions.generator}, so the seed may now give a different challenge.`
        : `This link was made with generator ${version}. This site runs generator ${versions.generator}, so the same seed and settings now give a different challenge.`,
    );
  return { link: { kind: "seed", form, seed: seed.slice(0, 64) }, notices };
}
