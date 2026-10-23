import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generate, parseWorld, renderManual, validate, type Difficulty } from "../src/index.js";
import { readDataSet } from "./ds1.js";

// Slow: about a second per short journey on a Windows laptop, where the suite already runs close to its
// timeouts. CI on Linux runs them on every pull request; on Windows, set SLOW=1 to run them.
const skip = process.platform === "win32" && process.env["SLOW"] !== "1";
const difficulties: readonly Difficulty[] = ["easy", "medium", "hard", "extreme"];
const difficulty = (i: number): Difficulty => difficulties[i % difficulties.length] ?? "medium";
const HOUR = 3_600_000;

describe.skipIf(skip)("many seeds (slow)", () => {
  const world = parseWorld(readDataSet());

  // Issue 38: across 1000 seeds, every challenge passes the validator, reachability included.
  it(
    "validates the challenge of every one of 1000 seeds",
    () => {
      const failed: string[] = [];
      for (let i = 0; i < 1000; i++) {
        const seed = `property-${String(i)}`;
        try {
          const challenge = generate(world, { seed, difficulty: difficulty(i), length: "short" });
          const result = validate(world, challenge.setup, challenge.orders);
          if (result.verdict !== "comfortable")
            failed.push(`${seed}: ${result.problems.join("; ")}`);
        } catch (error) {
          failed.push(`${seed}: ${String(error)}`);
        }
      }
      expect(failed).toEqual([]);
    },
    HOUR,
  );

  // Locks what generator 6 draws on data 0.7.0: twenty seeds per class, one hash per manual. A change here
  // is a change of the challenges players share, and needs a version bump.
  it(
    "draws the same manuals for twenty seeds of each class",
    () => {
      const hashes = Object.fromEntries(
        [...world.classes.keys()].sort().map((startingClass) => [
          startingClass,
          Array.from({ length: 20 }, (_, i) => {
            const challenge = generate(world, {
              seed: `snapshot-${String(i)}`,
              difficulty: difficulty(i),
              length: "short",
              startingClass,
            });
            const manual = renderManual(world, challenge);
            return createHash("sha256").update(manual).digest("hex").slice(0, 16);
          }),
        ]),
      );
      expect(hashes).toMatchSnapshot();
    },
    HOUR,
  );
});
