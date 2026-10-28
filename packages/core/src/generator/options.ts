import type { Stats } from "../build.js";
import type { Difficulty } from "../orders/index.js";
import type { World } from "../world.js";
import { CURVES, type Curve } from "./curve.js";
import { DIFFICULTIES } from "./draw.js";
import { LENGTHS, type Length } from "./generate.js";

/** What a client may fix before generating, from the data set; the rest is drawn by the seed. */
export interface SetupOptions {
  readonly classes: readonly {
    readonly name: string;
    readonly level: number;
    readonly stats: Stats;
  }[];
  /** By row; the label lists the gift's items ("Prism Stone x10"), or says "None". */
  readonly gifts: readonly { readonly row: number; readonly label: string }[];
  readonly difficulties: readonly Difficulty[];
  readonly lengths: readonly Length[];
  readonly curves: readonly Curve[];
}

export function setupOptions(world: World): SetupOptions {
  return {
    classes: [...world.classes.values()]
      .map(({ name, level, stats }) => ({ name, level, stats }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    gifts: [...world.gifts]
      .sort((a, b) => a.row - b.row)
      .map((g) => ({
        row: g.row,
        label:
          g.items.length === 0
            ? "None"
            : g.items
                .map((i) => (i.count > 1 ? `${i.item} x${String(i.count)}` : i.item))
                .join(", "),
      })),
    difficulties: DIFFICULTIES,
    lengths: LENGTHS,
    curves: CURVES,
  };
}
