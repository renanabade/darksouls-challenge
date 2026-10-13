/**
 * Requirement expressions: the conditions on the edges of the world graph (data/ds1/SCHEMA.md).
 *
 * `true` / `false`, `{ has: item }` (an item or a milestone such as "Taurus Demon Defeated"),
 * `{ region: id }` (a region already reached), and the combinators `{ all: [...] }` / `{ any: [...] }`.
 */
export type Requirement =
  | boolean
  | { readonly has: string }
  | { readonly region: string }
  | { readonly all: readonly Requirement[] }
  | { readonly any: readonly Requirement[] };

/** What an expression is evaluated against. Kept as an interface so callers choose the storage. */
export interface RequirementContext {
  has(item: string): boolean;
  reached(region: string): boolean;
}

export function evaluate(requirement: Requirement, context: RequirementContext): boolean {
  if (typeof requirement === "boolean") return requirement;
  if ("has" in requirement) return context.has(requirement.has);
  if ("region" in requirement) return context.reached(requirement.region);
  if ("all" in requirement) return requirement.all.every((r) => evaluate(r, context));
  return requirement.any.some((r) => evaluate(r, context));
}

/** Every item an expression mentions, whatever the combinators. Used to check data integrity. */
export function itemsOf(requirement: Requirement): Set<string> {
  const items = new Set<string>();
  const visit = (r: Requirement): void => {
    if (typeof r === "boolean" || "region" in r) return;
    if ("has" in r) items.add(r.has);
    else if ("all" in r) r.all.forEach(visit);
    else r.any.forEach(visit);
  };
  visit(requirement);
  return items;
}

export class RequirementParseError extends Error {
  readonly path: string;

  constructor(message: string, path: string) {
    super(`${message} at ${path}`);
    this.name = "RequirementParseError";
    this.path = path;
  }
}

/**
 * Turns untrusted JSON into a Requirement, or throws with the path of the first bad node.
 * The data set is generated, but it crosses a process boundary, so it is checked once on load.
 */
export function parseRequirement(value: unknown, path = "$"): Requirement {
  if (typeof value === "boolean") return value;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RequirementParseError("expected a boolean or an object", path);
  }
  const keys = Object.keys(value);
  const [key] = keys;
  if (keys.length !== 1 || key === undefined) {
    throw new RequirementParseError(`expected exactly one key, got ${String(keys.length)}`, path);
  }
  const inner: unknown = (value as Record<string, unknown>)[key];
  switch (key) {
    case "has":
    case "region":
      if (typeof inner !== "string" || inner === "") {
        throw new RequirementParseError(`"${key}" must be a non-empty string`, `${path}.${key}`);
      }
      return key === "has" ? { has: inner } : { region: inner };
    case "all":
    case "any": {
      if (!Array.isArray(inner) || inner.length === 0) {
        throw new RequirementParseError(`"${key}" must be a non-empty array`, `${path}.${key}`);
      }
      const children = inner.map((child, i) =>
        parseRequirement(child, `${path}.${key}[${String(i)}]`),
      );
      return key === "all" ? { all: children } : { any: children };
    }
    default:
      throw new RequirementParseError(`unknown key "${key}"`, path);
  }
}
