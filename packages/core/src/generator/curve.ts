import type { Difficulty } from "../orders/index.js";
import { DIFFICULTIES } from "./draw.js";
import type { Random } from "./random.js";

/**
 * How difficulty moves across the chapters of a journey (decided by Renan, 2026-10-21): the chosen
 * difficulty is the level the curve moves around, not the level of every chapter.
 * - constant: every chapter at the chosen level;
 * - rising: a step below it at the start, a step above it at the end;
 * - peaks: the chosen level, with two chapters two steps above it;
 * - rollercoaster: a step below, at or above it, changing from chapter to chapter.
 */
export type Curve = "constant" | "rising" | "peaks" | "rollercoaster";
export const CURVES: readonly Curve[] = ["constant", "rising", "peaks", "rollercoaster"];

const PEAKS = 2;

/**
 * Each chapter's distance from the chosen difficulty, in steps. Kept apart from the difficulty so a group
 * shares one curve: each player adds their own difficulty to the same offsets.
 */
export function curveOffsets(curve: Curve, chapters: number, rng: Random): number[] {
  switch (curve) {
    case "constant":
      return Array.from({ length: chapters }, () => 0);
    case "rising":
      return Array.from({ length: chapters }, (_, k) =>
        chapters === 1 ? 0 : Math.round(-1 + (2 * k) / (chapters - 1)),
      );
    case "peaks": {
      // Never the first chapter: the Asylum is a tutorial.
      const peaks = new Set(
        rng.shuffle(Array.from({ length: chapters - 1 }, (_, k) => k + 1)).slice(0, PEAKS),
      );
      return Array.from({ length: chapters }, (_, k) => (peaks.has(k) ? 2 : 0));
    }
    case "rollercoaster": {
      const offsets: number[] = [];
      for (let k = 0; k < chapters; k++) {
        const previous = offsets[k - 1];
        offsets.push(rng.pick([-1, 0, 1].filter((o) => o !== previous)));
      }
      return offsets;
    }
  }
}

/** The difficulty a step offset away, held within easy and extreme. */
export function shifted(difficulty: Difficulty, offset: number): Difficulty {
  const index = DIFFICULTIES.indexOf(difficulty) + offset;
  return DIFFICULTIES[Math.max(0, Math.min(DIFFICULTIES.length - 1, index))] ?? difficulty;
}
