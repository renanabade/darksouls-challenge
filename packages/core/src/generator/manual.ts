import { restrictions } from "../orders/index.js";
import type { ArgValue } from "../validator.js";
import type { World } from "../world.js";
import type { Challenge, GeneratedOrder } from "./generate.js";

/** Boss names as the manual says them (decision of 2026-10-19). */
const BOSS_NAMES: Readonly<Record<string, string>> = { "knight-artorias": "Artorias" };

/** Milestones as noun phrases, so texts read "until the death of Taurus Demon". */
function milestonePhrase(world: World, id: string): string {
  const milestone = world.milestones.get(id);
  if (milestone === undefined) return id;
  const fixed: Readonly<Record<string, string>> = {
    "bell-undead-parish": "the Undead Parish bell",
    "bell-quelaags-domain": "Quelaag's bell",
    "both-bells": "both bells",
    "lordvessel-obtained": "the Lordvessel",
    "lordvessel-placed": "placing the Lordvessel",
    "kiln-open": "the opening of the Kiln",
  };
  if (fixed[id] !== undefined) return fixed[id];
  if (milestone.kind === "boss") {
    const boss = [...world.bosses.values()].find((b) => `boss-${b.id}` === id);
    return `the death of ${boss ? bossName(boss.id, boss.name) : milestone.name}`;
  }
  return milestone.name;
}

function bossName(id: string, name: string): string {
  return BOSS_NAMES[id] ?? name;
}

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
      return `only ${plural(arg)}`;
    default:
      return arg;
  }
}

export function orderText(world: World, order: GeneratedOrder): string {
  let text: string = order.template.text;
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

/** The manual as Markdown: the challenge's settings, then one numbered order per line. */
export function renderManual(world: World, challenge: Challenge): string {
  const { config, setup } = challenge;
  const gift = setup.gift.items.map((i) =>
    i.count > 1 ? `${i.item} x${String(i.count)}` : i.item,
  );
  const lines = [
    `# Dark Souls challenge — seed ${config.seed}`,
    "",
    `- **Class:** ${setup.startingClass}`,
    `- **Starting gift:** ${gift.length > 0 ? gift.join(", ") : "none"}`,
    `- **Soul level cap:** ${String(setup.levelCap)}`,
    `- **Difficulty:** ${config.difficulty} · **Length:** ${config.length}`,
    "",
    "Follow every order. Break one, and the challenge is over: there is no penalty, only the end.",
    "",
    "## Orders",
    "",
    ...challenge.orders.map((o, i) => {
      const advice = o.template.advice ? ` _${o.template.advice}_` : "";
      return `${String(i + 1)}. **${o.template.title}.** ${orderText(world, o)}${advice}`;
    }),
    "",
    `<sub>Data ${challenge.dataVersion}. Same seed and settings, same challenge.</sub>`,
    "",
  ];
  return lines.join("\n");
}
