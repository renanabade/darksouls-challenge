import type { Difficulty } from "../orders/index.js";
import type { Curve } from "./curve.js";
import type { GeneratorConfig, Length } from "./generate.js";
import type { SetupOptions } from "./options.js";

/**
 * A challenge as one code to share (issue 64): "8.07-K3F9QX2M7TAB". Before the dash, the generator and
 * data versions that draw it; after it, twelve Crockford base32 characters holding every setting the
 * player can fix (0 when the seed draws it), a random draw, and a check character. The code is the
 * generator's seed, so the same code gives the same challenge, and a bare seed never stands for a run
 * whose settings it does not say.
 */
export interface ChallengeCode {
  readonly code: string;
  readonly generatorVersion: string;
  /** The data version as the code writes it: "07" for 0.7.0 (see dataToken). */
  readonly dataToken: string;
  /** What to generate; its seed is the code itself. */
  readonly config: GeneratorConfig;
}

/** The lists a code indexes into: its numbers are places in them, so they come from the data set. */
export type CodeOptions = Pick<
  SetupOptions,
  "classes" | "gifts" | "difficulties" | "lengths" | "curves"
>;

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
/** Bits per field, in the order they are packed: 55 bits, eleven characters, then the check. */
const FIELDS = [
  ["startingClass", 5],
  ["gift", 5],
  ["difficulty", 2],
  ["length", 2],
  ["curve", 3],
  ["levelCap", 10],
  ["draw", 28],
] as const;
type Field = (typeof FIELDS)[number][0];
const PAYLOAD = 11;
/** Draws a code can hold: 2^28. */
export const CODE_DRAWS = 2 ** 28;
const FORMAT = /^(\d+)\.(\d+)-([0-9A-Z]{12})$/;

/** A data version as a code writes it: the dots dropped, and a zero patch with them ("0.7.0" → "07"). */
export function dataToken(dataVersion: string): string {
  const parts = dataVersion.split(".");
  if (parts.length === 3 && parts[2] === "0") parts.pop();
  return parts.join("");
}

/**
 * The code of a challenge: its settings (absent ones are drawn by the seed) and a draw in
 * [0, CODE_DRAWS). Throws when a setting is not in the options.
 */
export function encodeChallengeCode(
  options: CodeOptions,
  settings: Omit<GeneratorConfig, "seed">,
  draw: number,
  versions: { readonly generator: string; readonly data: string },
): string {
  const place = <T>(list: readonly T[], value: T | undefined, what: string, drawn = true) => {
    if (value === undefined && drawn) return 0;
    const index = list.indexOf(value as T);
    if (index < 0) throw new RangeError(`no ${what} "${String(value)}" for a challenge code`);
    return drawn ? index + 1 : index;
  };
  const values: Record<Field, number> = {
    startingClass: place(
      options.classes.map((c) => c.name),
      settings.startingClass,
      "class",
    ),
    gift: place(
      options.gifts.map((g) => g.row),
      settings.giftRow,
      "gift",
    ),
    difficulty: place(options.difficulties, settings.difficulty, "difficulty", false),
    length: place(options.lengths, settings.length, "length", false),
    curve: place(options.curves, settings.curve, "curve"),
    levelCap: settings.levelCap ?? 0,
    draw,
  };
  let packed = 0n;
  for (const [field, bits] of FIELDS) {
    const value = values[field];
    if (!Number.isInteger(value) || value < 0 || value >= 2 ** bits)
      throw new RangeError(`${field} ${String(value)} does not fit a challenge code`);
    packed = (packed << BigInt(bits)) | BigInt(value);
  }
  const digits = Array.from({ length: PAYLOAD }, (_, i) =>
    Number((packed >> BigInt(5 * (PAYLOAD - 1 - i))) & 31n),
  );
  const payload = [...digits, checkOf(digits)].map((d) => ALPHABET[d] ?? "").join("");
  return `${versions.generator}.${dataToken(versions.data)}-${payload}`;
}

/**
 * Reads a code back, as typed: case, spaces and the letters Crockford reads as digits (O, I, L) do not
 * matter. Undefined when the text is not a code, its check fails, or a setting is not in the options.
 * The versions are the code's: the caller compares them with its own.
 */
export function decodeChallengeCode(text: string, options: CodeOptions): ChallengeCode | undefined {
  const match = FORMAT.exec(text.replace(/\s+/g, "").toUpperCase());
  if (match === null) return undefined;
  const [, generatorVersion = "", token = "", chars = ""] = match;
  const digits = Array.from(chars.replace(/O/g, "0").replace(/[IL]/g, "1"), (c) =>
    ALPHABET.indexOf(c),
  );
  if (digits.some((d) => d < 0)) return undefined;
  const check = digits.pop();
  if (check !== checkOf(digits)) return undefined;
  let packed = digits.reduce((n, d) => (n << 5n) | BigInt(d), 0n);
  const values = {} as Record<Field, number>;
  for (const [field, bits] of [...FIELDS].reverse()) {
    values[field] = Number(packed & BigInt(2 ** bits - 1));
    packed >>= BigInt(bits);
  }
  const at = <T>(list: readonly T[], value: number, drawn = true): T | undefined | null => {
    if (drawn && value === 0) return undefined;
    return list[drawn ? value - 1 : value] ?? null;
  };
  const startingClass = at(
    options.classes.map((c) => c.name),
    values.startingClass,
  );
  const giftRow = at(
    options.gifts.map((g) => g.row),
    values.gift,
  );
  const difficulty = at<Difficulty>(options.difficulties, values.difficulty, false);
  const length = at<Length>(options.lengths, values.length, false);
  const curve = at<Curve>(options.curves, values.curve);
  if (difficulty == null || length == null) return undefined;
  if (startingClass === null || giftRow === null || curve === null) return undefined;
  const code = `${generatorVersion}.${token}-${digits.map((d) => ALPHABET[d] ?? "").join("")}${ALPHABET[check] ?? ""}`;
  return {
    code,
    generatorVersion,
    dataToken: token,
    config: {
      seed: code,
      difficulty,
      length,
      ...(curve !== undefined && { curve }),
      ...(startingClass !== undefined && { startingClass }),
      ...(giftRow !== undefined && { giftRow }),
      ...(values.levelCap > 0 && { levelCap: values.levelCap }),
    },
  };
}

/** True when the text is written as a challenge code; whether it decodes is decodeChallengeCode's. */
export function isChallengeCode(text: string): boolean {
  return FORMAT.test(text);
}

/** The check character: each digit weighted by its place, modulo 31, so one mistyped character shows. */
function checkOf(digits: readonly number[]): number {
  return digits.reduce((sum, d, i) => (sum + d * (i + 1)) % 31, 0);
}
