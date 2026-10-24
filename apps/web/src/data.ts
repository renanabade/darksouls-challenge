import type { RawDataSet } from "@darksouls-challenge/core";
import areas from "../../../data/ds1/areas.json";
import bosses from "../../../data/ds1/bosses.json";
import classes from "../../../data/ds1/classes.json";
import entrances from "../../../data/ds1/entrances.json";
import locations from "../../../data/ds1/locations.json";
import merchants from "../../../data/ds1/merchants.json";
import meta from "../../../data/ds1/meta.json";
import milestones from "../../../data/ds1/milestones.json";
import regions from "../../../data/ds1/regions.json";
import spells from "../../../data/ds1/spells.json";
import treasures from "../../../data/ds1/treasures.json";
import warnings from "../../../data/ds1/warnings.json";
import weapons from "../../../data/ds1/weapons.json";

/**
 * The data set, bundled into the worker: the same files the contracts' loader reads from disk. Still
 * untrusted: the core's `parseWorld` checks it.
 */
export const dataSet: RawDataSet = {
  meta,
  regions,
  entrances,
  locations,
  classes,
  bosses,
  merchants,
  milestones,
  weapons,
  spells,
  areas,
  treasures,
  warnings,
};
