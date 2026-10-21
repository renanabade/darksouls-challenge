import type { Difficulty } from "../orders/index.js";
import { DIFFICULTIES } from "./draw.js";
import type { Random } from "./random.js";

/**
 * How difficulty moves across the chapters of a journey (decided by Renan, 2026-10-21): the chosen
 * difficulty is the level the curve moves around, not the level of every chapter.
 * - constant: every chapter at the chosen level;
 * - rising: a step below it at the start, a step above it at the end;
 * - peaks: the chosen level, with one chapter in four two steps above it; at extreme, where nothing is
 *   above, the peaks turn into valleys a step below (the evaluation of 2026-10-21);
 * - rollercoaster: a step below, at or above it, the level changing from chapter to chapter.
 * Whatever the curve, the last chapter is never below the chosen level: the end of the run is its climax.
 */
export type Curve = "constant" | "rising" | "peaks" | "rollercoaster";
export const CURVES: readonly Curve[] = ["constant", "rising", "peaks", "rollercoaster"];

/** One peak per this many chapters after the first (two in a journey of nine). */
const CHAPTERS_PER_PEAK = 4;

/**
 * Each chapter's distance from the chosen difficulty, in steps. Kept apart from the difficulty so a group
 * shares one curve: each player adds their own difficulty to the same offsets (a group's curve is drawn
 * for its hardest player).
 */
export function curveOffsets(
  curve: Curve,
  chapters: number,
  difficulty: Difficulty,
  rng: Random,
): number[] {
  switch (curve) {
    case "constant":
      return Array.from({ length: chapters }, () => 0);
    case "rising":
      return Array.from({ length: chapters }, (_, k) =>
        chapters === 1 ? 0 : Math.round(-1 + (2 * k) / (chapters - 1)),
      );
    case "peaks": {
      const height = shifted(difficulty, 1) === difficulty ? -1 : 2;
      // Never the first chapter (the Asylum is a tutorial), and a valley never the last.
      const places = Array.from({ length: chapters - (height < 0 ? 2 : 1) }, (_, k) => k + 1);
      const count = Math.max(1, Math.round((chapters - 1) / CHAPTERS_PER_PEAK));
      const peaks = new Set(rng.shuffle(places).slice(0, count));
      return Array.from({ length: chapters }, (_, k) => (peaks.has(k) ? height : 0));
    }
    case "rollercoaster": {
      // The level changes, not just the offset: at easy or extreme two offsets give the same level.
      const offsets: number[] = [];
      for (let k = 0; k < chapters; k++) {
        const previous = offsets[k - 1];
        const allowed = [-1, 0, 1].filter((o) => k < chapters - 1 || o >= 0);
        const changing = allowed.filter(
          (o) => previous === undefined || shifted(difficulty, o) !== shifted(difficulty, previous),
        );
        offsets.push(
          rng.pick(changing.length > 0 ? changing : allowed.filter((o) => o !== previous)),
        );
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
