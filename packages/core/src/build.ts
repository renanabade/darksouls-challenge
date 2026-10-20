import type { Checker } from "./check.js";

/**
 * Character builds: weapons, starting classes, bosses' damage immunities, and the rules that say whether a
 * weapon can be wielded within a level cap and whether it hurts a boss. Game rules used here, with their
 * sources, are in the planning docs (docs/04-dados.md, "Fatos de combate").
 */

export type Attribute = "str" | "dex" | "int" | "fth" | "att";
export type Stats = Readonly<Record<Attribute, number>>;
export type Element = "phys" | "magic" | "fire" | "thunder";
export type School = "sorcery" | "miracle" | "pyromancy";
export const SCHOOLS: readonly School[] = ["miracle", "pyromancy", "sorcery"];

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
  /** The schools of magic it casts, if it is a catalyst, a talisman or a pyromancy flame. */
  readonly casts: readonly School[];
}

export interface Spell {
  readonly name: string;
  /** The name the item has in the world ("Sorcery: Soul Arrow"). */
  readonly item: string;
  readonly school: School;
  readonly requirements: Pick<Stats, "int" | "fth">;
  /** Attunement slots it takes. */
  readonly slots: number;
  readonly damage: Readonly<Record<Element, number>>;
}

export interface StartingClass {
  readonly name: string;
  /** Soul level at the start. */
  readonly level: number;
  readonly stats: Stats;
  /** What the class starts with: its equipment and its spells, by name. */
  readonly kit: readonly string[];
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

const ATTRIBUTES: readonly Attribute[] = ["str", "dex", "int", "fth", "att"];
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
  att: "attunement",
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

/**
 * Attribute points a character must still spend to wield every one of the weapons (one build for all of
 * them: attributes only grow, so each needs its highest requirement). Each weapon is held with both hands
 * when that needs less Strength, unless `twoHanding` is off.
 */
export function pointsToWield(
  weapons: Weapon | readonly Weapon[],
  stats: Stats,
  twoHanding = true,
): number {
  const list = "id" in weapons ? [weapons] : weapons;
  const need = (a: Attribute, w: Weapon): number =>
    a === "str"
      ? strengthNeeded(w.requirements.str, twoHanding && w.twoHandable)
      : w.requirements[a];
  return ATTRIBUTES.reduce(
    (sum, a) => sum + Math.max(0, Math.max(0, ...list.map((w) => need(a, w))) - stats[a]),
    0,
  );
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
    // Absent in small test worlds: nothing casts.
    const casts =
      fields["casts"] === undefined ? {} : (check.object(fields["casts"], `${path}.casts`) ?? {});
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
        att: 0,
      },
      damage: {
        phys: check.number(base, "phys", `${path}.baseDamage`),
        magic: check.number(base, "magic", `${path}.baseDamage`),
        fire: check.number(base, "fire", `${path}.baseDamage`),
        thunder: check.number(base, "thunder", `${path}.baseDamage`),
      },
      casts: SCHOOLS.filter((s) => check.boolean(casts, s, `${path}.casts`, false)),
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
    // The full kit: equipment by slot, and spells. Absent in small test worlds.
    const kit =
      fields["fullKit"] === undefined ? {} : (check.object(fields["fullKit"], path) ?? {});
    const equipment =
      kit["equipment"] === undefined
        ? {}
        : (check.object(kit["equipment"], `${path}.fullKit.equipment`) ?? {});
    classes.set(name, {
      name,
      level: check.integer(fields, "level", path),
      stats: Object.fromEntries(ATTRIBUTES.map((a) => [a, read(a)])) as Record<Attribute, number>,
      kit: [
        ...check.strings(Object.values(equipment), `${path}.fullKit.equipment`),
        ...check.strings(kit["spells"] ?? [], `${path}.fullKit.spells`),
      ],
    });
  }
  return classes;
}

/** Attunement a character needs for one spell slot (docs/04 in the workspace, "Sintonia"). */
export const ATTUNEMENT_FOR_ONE_SLOT = 10;

/**
 * A spell cast with a catalyst, as something to fight with: the requirements of both, the attunement for
 * one slot, and the spell's damage. Only one-slot spells: the attunement needed for two slots is not
 * confirmed (docs/04), and leaving them out can only refuse a possible challenge, never accept an
 * impossible one.
 */
export function spellKit(spell: Spell, catalyst: Weapon): Weapon | undefined {
  if (spell.slots !== 1 || !catalyst.casts.includes(spell.school)) return undefined;
  return {
    id: catalyst.id,
    name: `${spell.name} (with ${catalyst.name})`,
    category: spell.school,
    melee: false,
    twoHandable: catalyst.twoHandable,
    requirements: {
      ...catalyst.requirements,
      int: Math.max(catalyst.requirements.int, spell.requirements.int),
      fth: Math.max(catalyst.requirements.fth, spell.requirements.fth),
      att: ATTUNEMENT_FOR_ONE_SLOT,
    },
    damage: spell.damage,
    casts: [],
  };
}

export function parseSpells(check: Checker, raw: unknown): Map<string, Spell> {
  const spells = new Map<string, Spell>();
  for (const [i, value] of check.array(raw, "spells").entries()) {
    const path = `spells[${String(i)}]`;
    const fields = check.object(value, path);
    if (fields === undefined) continue;
    const req = check.object(fields["req"], `${path}.req`) ?? {};
    const damage = check.object(fields["damage"], `${path}.damage`) ?? {};
    const school = check.string(fields, "school", path);
    if (!(SCHOOLS as readonly string[]).includes(school))
      check.fail(`${path}.school`, `unknown school "${school}"`);
    const spell: Spell = {
      name: check.string(fields, "name", path),
      item: check.string(fields, "item", path),
      school: school as School,
      requirements: {
        int: check.integer(req, "int", `${path}.req`),
        fth: check.integer(req, "fth", `${path}.req`),
      },
      slots: check.integer(fields, "slots", path),
      damage: Object.fromEntries(
        ELEMENTS.map((e) => [e, check.number(damage, e, `${path}.damage`)]),
      ) as Record<Element, number>,
    };
    spells.set(spell.name, spell);
  }
  return spells;
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
