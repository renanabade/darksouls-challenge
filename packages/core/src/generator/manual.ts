import { restrictions } from "../orders/index.js";
import { itemsOf } from "../requirement.js";
import type { ArgValue } from "../validator.js";
import type { World } from "../world.js";
import type { Challenge, GeneratedOrder } from "./generate.js";

/** Boss names as the manual says them (decision of 2026-10-19). */
const BOSS_NAMES: Readonly<Record<string, string>> = { "knight-artorias": "Artorias" };

/** Milestones as what the player does, so texts read "until you defeat Taurus Demon". */
function milestonePhrase(world: World, id: string): string {
  const milestone = world.milestones.get(id);
  if (milestone === undefined) return id;
  const fixed: Readonly<Record<string, string>> = {
    "bell-undead-parish": "you ring the bell of the Undead Parish",
    "bell-quelaags-domain": "you ring the bell of Quelaag's Domain",
    "both-bells": "you have rung both bells",
    "lordvessel-obtained": "you obtain the Lordvessel",
    "lordvessel-placed": "you place the Lordvessel",
    "kiln-open": "the Kiln of the First Flame opens",
  };
  if (fixed[id] !== undefined) return fixed[id];
  // Each lord-souls milestone is one soul placed in the Lordvessel, not the n-th soul placed.
  if (milestone.kind === "lord-souls") return `you place the ${lordSoulOf(world, id)}`;
  if (milestone.kind === "boss") {
    const boss = [...world.bosses.values()].find((b) => `boss-${b.id}` === id);
    return `you defeat ${boss ? bossName(boss.id, boss.name) : milestone.name}`;
  }
  return milestone.name;
}

function bossName(id: string, name: string): string {
  return BOSS_NAMES[id] ?? name;
}

/** The Lord Soul a lord-souls milestone places, e.g. "Lord Soul (Nito)". */
function lordSoulOf(world: World, id: string): string {
  const souls = new Set(
    world.locations.filter((l) => l.category === "LORD_SOUL").map((l) => l.item),
  );
  const requires = world.milestones.get(id)?.requires;
  if (requires === undefined) return id;
  return [...itemsOf(requires)].find((i) => souls.has(i)) ?? id;
}

/**
 * A chapter's name, from the milestones it covers: "The first bell", "Lord Soul: Nito". An act of a short
 * journey takes its last milestone's name, and the act of the four Lord Souls is "The Lord Souls".
 */
export function chapterTitle(world: World, goals: string | readonly string[]): string {
  const list = typeof goals === "string" ? [goals] : goals;
  const goal = list.at(-1) ?? "";
  if (list.length > 1 && list.every((g) => world.milestones.get(g)?.kind === "lord-souls"))
    return "The Lord Souls";
  const fixed: Readonly<Record<string, string>> = {
    "boss-asylum-demon": "The Asylum",
    "bell-undead-parish": "The first bell",
    "both-bells": "The second bell",
    "lordvessel-placed": "The Lordvessel",
  };
  if (fixed[goal] !== undefined) return fixed[goal];
  const milestone = world.milestones.get(goal);
  if (milestone?.kind === "lord-souls") {
    const soul = lordSoulOf(world, goal);
    return `Lord Soul: ${/\(([^)]+)\)/.exec(soul)?.[1] ?? soul}`;
  }
  if (milestone !== undefined && itemsOf(milestone.requires).has(world.goal))
    return "The First Flame";
  return milestone?.name ?? goal;
}

/** A school of magic as a fighting style: your attacks are its spells, cast with a catalyst of the school. */
const SCHOOL_STYLES: Readonly<Record<string, string>> = {
  sorcery: "only sorceries for your attacks, cast with a catalyst",
  miracle: "only miracles for your attacks, cast with a talisman",
  pyromancy: "only pyromancies for your attacks, cast with a pyromancy flame",
};

const plural = (category: string): string =>
  category === "fist" ? "fist weapons" : category.endsWith("s") ? category : `${category}s`;

function value(world: World, kind: string, arg: ArgValue): string {
  const text = (v: ArgValue): string => (Array.isArray(v) ? v.join(", ") : String(v));
  if (typeof arg !== "string") {
    if (kind === "restrictionList" && Array.isArray(arg)) {
      // "(1) Do not roll; (2) ...": the template's own period closes the list.
      return arg
        .map((id: string, i) => {
          const restriction = restrictions.find((r) => r.id === id)?.text ?? id;
          return `(${String(i + 1)}) ${restriction.replace(/\.$/, "")}`;
        })
        .join("; ");
    }
    if (kind === "lordSoulOrder" && Array.isArray(arg)) return arg.join(", then ");
    return text(arg);
  }
  switch (kind) {
    case "area":
      return world.areas.get(arg)?.name ?? arg;
    case "boss": {
      const boss = world.bosses.get(arg);
      return boss ? bossName(boss.id, boss.name) : arg;
    }
    case "milestone":
      return milestonePhrase(world, arg);
    case "merchant":
      return world.merchants.get(arg)?.name ?? arg;
    case "weaponLocation": {
      // "the Halberd found in Undead Parish", plus DSAP's landmark when its name has one
      // ("UP: Halberd - On the bridge").
      const location = world.locations.find((l) => l.name === arg);
      if (location === undefined) return arg;
      const landmark = /^[^:]+:\s*[^-]+-\s*(.+)$/.exec(location.name)?.[1];
      const area = world.areas.get(world.regions.get(location.region)?.area ?? "")?.name;
      return [`the ${location.item}`, area && `found in ${area}`, landmark && `(${landmark})`]
        .filter(Boolean)
        .join(" ");
    }
    case "equipmentSet":
      return SCHOOL_STYLES[arg] ?? `only ${plural(arg)}`;
    case "element":
      return arg === "thunder" ? "lightning" : arg;
    case "bonfire":
      // "AL: Darkmoon Tomb Bonfire" → "Darkmoon Tomb Bonfire"
      return arg.replace(/^[^:]+:\s*/, "");
    case "restriction": {
      // "...: do not roll."
      const text = restrictions.find((r) => r.id === arg)?.text ?? arg;
      return text.charAt(0).toLowerCase() + text.slice(1);
    }
    default:
      return arg;
  }
}

export function orderText(world: World, order: GeneratedOrder): string {
  const zero = order.template.textIfZero;
  let text: string =
    zero !== undefined && order.args[zero.param] === 0 ? zero.text : order.template.text;
  if (order.template.exceptions) {
    const placeholder = `{${order.template.exceptions.placeholder}}`;
    text =
      order.exceptions.length > 0
        ? text.replace(placeholder, order.exceptions.join(", "))
        : text.replace(` Except: ${placeholder}.`, "");
  }
  for (const [name, spec] of Object.entries(order.template.params)) {
    const arg = order.args[name];
    if (arg !== undefined) text = text.replaceAll(`{${name}}`, value(world, spec.kind, arg));
  }
  // Exceptions an order's restrictions add (e.g. the rings the run needs under "no rings").
  if (!order.template.exceptions && order.exceptions.length > 0)
    text += ` Allowed, because the run needs them: ${order.exceptions.join(", ")}.`;
  return text.replace(
    /\b1 (points|deaths|attempts)\b/g,
    (_, word: string) => `1 ${word.slice(0, -1)}`,
  );
}

/**
 * Words whose meaning decides whether an order was broken, defined once so that players comparing runs
 * read them the same way (docs/07 in the workspace). Only the ones the challenge uses are printed.
 */
const DEFINITIONS: readonly {
  readonly term: string;
  readonly text: string;
  readonly applies: (order: GeneratedOrder) => boolean;
}[] = [
  {
    term: "Death",
    text:
      "every time you die. The only one that does not count is your first death against Seath the " +
      "Scaleless in The Duke's Archives, which the story requires.",
    applies: (o) => o.template.id === "run-lives",
  },
  {
    term: "Attempt",
    text: "each fight against a boss that you start, whether you win, die or leave.",
    applies: (o) =>
      o.template.id === "counted-attempts" || o.args["condition"] === "on your first attempt",
  },
  {
    term: "Pick up",
    text:
      "take an item from a corpse or a chest in the world. What enemies drop, what you buy and what " +
      "characters give you are not picked up.",
    applies: (o) =>
      ["first-weapon-of-area", "wear-what-you-find", "nothing-from-the-ground"].includes(
        o.template.id,
      ),
  },
  {
    term: "Use",
    text: "equip, wear, wield, cast or consume.",
    applies: (o) =>
      o.template.id === "nothing-from-the-ground" ||
      cursed(o, "no-consumables") ||
      cursed(o, "no-rings"),
  },
  {
    term: "Chest",
    text: "a treasure chest placed in the world. A mimic is not one, even though it looks like one.",
    applies: (o) => o.template.id === "every-chest",
  },
  {
    term: "Consumable",
    text: "an item that is spent when you use it. The Estus Flask is not one.",
    applies: (o) => cursed(o, "no-consumables"),
  },
];

function cursed(order: GeneratedOrder, restriction: string): boolean {
  const list = order.args["restrictions"];
  return Array.isArray(list) && list.includes(restriction);
}

/**
 * The manual as Markdown: the challenge's settings, the rules of the whole journey, then each chapter with
 * its stretch, areas, bosses, difficulty and rules. Rules are numbered across the manual, so players can
 * refer to "rule 14". A chapter with no rules is left out.
 */
export function renderManual(world: World, challenge: Challenge): string {
  const { config, setup } = challenge;
  const gift = setup.gift.items.map((i) =>
    i.count > 1 ? `${i.item} x${String(i.count)}` : i.item,
  );
  let number = 0;
  const rule = (o: GeneratedOrder): string => {
    const advice = o.template.advice ? ` _${o.template.advice}_` : "";
    return `${String(++number)}. **${o.template.title}.** ${orderText(world, o)}${advice}`;
  };
  const names = (ids: readonly string[], of: (id: string) => string | undefined) =>
    ids.map((id) => of(id) ?? id).join(", ");
  const journey = challenge.orders.filter((o) => o.chapter === undefined).map(rule);
  const part = challenge.chapters.some((c) => c.goals.length > 1) ? "Act" : "Chapter";
  const chapters = challenge.chapters.flatMap((chapter, k) => {
    const orders = challenge.orders.filter((o) => o.chapter === k);
    if (orders.length === 0) return [];
    const about = [
      `Until ${milestonePhrase(world, chapter.goal)}`,
      `**Areas:** ${names(chapter.areas, (id) => world.areas.get(id)?.name)}`,
      chapter.bosses.length > 0 &&
        `**Bosses:** ${names(chapter.bosses, (id) => {
          const boss = world.bosses.get(id);
          return boss && bossName(boss.id, boss.name);
        })}`,
      `**Difficulty:** ${chapter.difficulty}`,
    ].filter(Boolean);
    return [
      `## ${part} ${String(k + 1)}: ${chapterTitle(world, chapter.goals)}`,
      "",
      about.join(" · "),
      "",
      ...orders.map(rule),
      "",
    ];
  });
  const lines = [
    `# Dark Souls challenge — seed ${config.seed}`,
    "",
    `- **Class:** ${setup.startingClass}`,
    `- **Starting gift:** ${gift.length > 0 ? gift.join(", ") : "none"}`,
    `- **Soul level cap:** ${String(setup.levelCap)}`,
    `- **Difficulty:** ${config.difficulty} · **Curve:** ${challenge.curve} · **Length:** ${config.length}`,
    "",
    "Follow every order. Break one, and the challenge is over: there is no penalty, only the end.",
    "",
    "## Rules of the journey",
    "",
    ...journey,
    "",
    ...chapters,
    ...definitions(challenge),
    `<sub>Data ${challenge.dataVersion}. Same seed and settings, same challenge.</sub>`,
    "",
  ];
  return lines.join("\n");
}

function definitions(challenge: Challenge): string[] {
  const used = DEFINITIONS.filter((d) => challenge.orders.some(d.applies));
  if (used.length === 0) return [];
  return ["## Definitions", "", ...used.map((d) => `- **${d.term}:** ${d.text}`), ""];
}
