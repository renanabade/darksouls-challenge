import type { Checker } from "./check.js";

/**
 * Character builds: weapons, starting classes, bosses' damage immunities, and the rules that say whether a
 * weapon can be wielded within a level cap and whether it hurts a boss. Game rules used here, with their
 * sources, are in the planning docs (docs/04-dados.md, "Fatos de combate").
 */

export type Attribute = "str" | "dex" | "int" | "fth";
export type Stats = Readonly<Record<Attribute, number>>;
export type Element = "phys" | "magic" | "fire" | "thunder";

export interface Weapon {
  readonly id: number;
  readonly name: string;
  readonly category: string;
  readonly melee: boolean;
  /** Can be held with both hands (Strength then counts 1.5 times for requirements). */
  readonly twoHandable: boolean;
  readonly requirements: Stats;
  /** Base damage per element at +0. */
  readonly damage: Readonly<Record<Element, number>>;
}

export interface StartingClass {
  readonly name: string;
  /** Soul level at the start. */
  readonly level: number;
  readonly stats: Stats;
}

export interface BossPart {
  /** Elements that deal this part no damage at all. */
  readonly noDamage: readonly Element[];
}

export interface Boss {
  readonly id: string;
  readonly name: string;
  readonly region: string;
  /**
   * The graph item for this boss's death: the BOSS location of its region. Matched by region, not by
   * name, because the names can differ between sources.
   */
  readonly defeatedItem: string;
  readonly parts: readonly BossPart[];
}

const ATTRIBUTES: readonly Attribute[] = ["str", "dex", "int", "fth"];
const ELEMENTS: readonly Element[] = ["phys", "magic", "fire", "thunder"];
/** Element names as bosses.json writes them. */
const ELEMENT_NAMES: Readonly<Record<string, Element>> = {
  phys: "phys",
  mag: "magic",
  magic: "magic",
  fire: "fire",
  thunder: "thunder",
};
const CLASS_STATS: Readonly<Record<Attribute, string>> = {
  str: "strength",
  dex: "dexterity",
  int: "intelligence",
  fth: "faith",
};

/** Weapons that can be "your weapon": melee, and not a shield, a catalyst or ammunition. */
const NOT_A_WEAPON = new Set([
  "shield",
  "catalyst/talisman/flame",
  "bow",
  "crossbow",
  "arrow",
  "bolt",
]);

export function isMeleeWeapon(weapon: Weapon): boolean {
  return weapon.melee && !NOT_A_WEAPON.has(weapon.category);
}

/**
 * Strength a character needs to meet a requirement. With both hands, Strength counts 1.5 times, rounded
 * down: the least s with floor(1.5 s) >= r is ceil(2r / 3).
 */
export function strengthNeeded(requirement: number, twoHanded: boolean): number {
  return twoHanded ? Math.ceil((2 * requirement) / 3) : requirement;
}

/** Attribute points a character must still spend to wield the weapon, choosing one or two hands. */
export function pointsToWield(weapon: Weapon, stats: Stats): number {
  const missing = (need: number, have: number): number => Math.max(0, need - have);
  const others =
    missing(weapon.requirements.dex, stats.dex) +
    missing(weapon.requirements.int, stats.int) +
    missing(weapon.requirements.fth, stats.fth);
  const oneHanded = missing(strengthNeeded(weapon.requirements.str, false), stats.str);
  const twoHanded = weapon.twoHandable
    ? missing(strengthNeeded(weapon.requirements.str, true), stats.str)
    : oneHanded;
  return others + Math.min(oneHanded, twoHanded);
}

/** True when the weapon hurts every part of the boss: some element of its damage is not nullified there. */
export function damages(weapon: Weapon, boss: Boss): boolean {
  return boss.parts.every((part) =>
    ELEMENTS.some((e) => weapon.damage[e] > 0 && !part.noDamage.includes(e)),
  );
}

export function parseWeapons(check: Checker, raw: unknown): Map<string, Weapon> {
  const weapons = new Map<string, Weapon>();
  for (const [i, value] of check.array(raw, "weapons").entries()) {
    const path = `weapons[${String(i)}]`;
    const fields = check.object(value, path);
    if (fields === undefined) continue;
    const req = check.object(fields["req"], `${path}.req`) ?? {};
    const base = check.object(fields["baseDamage"], `${path}.baseDamage`) ?? {};
    const hands = check.object(fields["hands"], `${path}.hands`) ?? {};
    const weapon: Weapon = {
      id: check.integer(fields, "id", path),
      name: check.string(fields, "name", path),
      category: check.string(fields, "category", path),
      melee: check.boolean(fields, "melee", path),
      twoHandable: check.boolean(hands, "both", `${path}.hands`),
      requirements: {
        str: check.integer(req, "str", `${path}.req`),
        dex: check.integer(req, "dex", `${path}.req`),
        int: check.integer(req, "int", `${path}.req`),
        fth: check.integer(req, "fth", `${path}.req`),
      },
      damage: {
        phys: check.number(base, "phys", `${path}.baseDamage`),
        magic: check.number(base, "magic", `${path}.baseDamage`),
        fire: check.number(base, "fire", `${path}.baseDamage`),
        thunder: check.number(base, "thunder", `${path}.baseDamage`),
      },
    };
    // Unique weapons have one row per reinforcement level under the same name (the export labels them as
    // infusions; see the pipeline's data needs). The lowest id is the base weapon, the one found in the world.
    const known = weapons.get(weapon.name);
    if (known === undefined || weapon.id < known.id) weapons.set(weapon.name, weapon);
  }
  return weapons;
}

export function parseClasses(check: Checker, raw: unknown): Map<string, StartingClass> {
  const classes = new Map<string, StartingClass>();
  for (const [i, value] of check.array(raw, "classes.classes").entries()) {
    const path = `classes.classes[${String(i)}]`;
    const fields = check.object(value, path);
    if (fields === undefined) continue;
    const stats = check.object(fields["stats"], `${path}.stats`) ?? {};
    const read = (a: Attribute): number => check.integer(stats, CLASS_STATS[a], `${path}.stats`);
    const name = check.string(fields, "name", path);
    classes.set(name, {
      name,
      level: check.integer(fields, "level", path),
      stats: Object.fromEntries(ATTRIBUTES.map((a) => [a, read(a)])) as Record<Attribute, number>,
    });
  }
  return classes;
}

/** Bosses, each linked to the BOSS location of its region (`deathItems`: region → items there). */
export function parseBosses(
  check: Checker,
  raw: unknown,
  deathItems: (region: string) => string[],
): Map<string, Boss> {
  const bosses = new Map<string, Boss>();
  for (const [i, value] of check.array(raw, "bosses").entries()) {
    const path = `bosses[${String(i)}]`;
    const fields = check.object(value, path);
    if (fields === undefined) continue;
    const id = check.string(fields, "id", path);
    const region = check.string(fields, "region", path);
    const deaths = region === "" ? [] : deathItems(region);
    if (region !== "" && deaths.length !== 1) {
      check.fail(
        `${path}.region`,
        `expected one BOSS location in "${region}", found ${String(deaths.length)}`,
      );
    }
    const parts: BossPart[] = [];
    for (const [j, part] of check.array(fields["parts"] ?? [], `${path}.parts`).entries()) {
      const partPath = `${path}.parts[${String(j)}]`;
      const partFields = check.object(part, partPath) ?? {};
      const noDamage: Element[] = [];
      for (const name of check.strings(partFields["noDamage"] ?? [], `${partPath}.noDamage`)) {
        const element = ELEMENT_NAMES[name];
        if (element === undefined) check.fail(`${partPath}.noDamage`, `unknown element "${name}"`);
        else noDamage.push(element);
      }
      parts.push({ noDamage });
    }
    if (bosses.has(id)) check.fail(`${path}.id`, `duplicate boss "${id}"`);
    bosses.set(id, {
      id,
      name: check.string(fields, "name", path),
      region,
      defeatedItem: deaths[0] ?? "",
      parts,
    });
  }
  return bosses;
}
