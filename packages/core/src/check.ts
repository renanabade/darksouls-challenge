import { parseRequirement, RequirementParseError, type Requirement } from "./requirement.js";

export type Fields = Readonly<Record<string, unknown>>;

/**
 * Reads untrusted JSON field by field. Collects every problem instead of stopping at the first, so one
 * pipeline run can fix them all; each reader returns a harmless default after a failure.
 */
export class Checker {
  readonly problems: string[] = [];

  fail(path: string, message: string): void {
    this.problems.push(`${message} at ${path}`);
  }

  array(value: unknown, path: string): readonly unknown[] {
    if (Array.isArray(value)) return value;
    this.fail(path, "expected an array");
    return [];
  }

  object(value: unknown, path: string): Fields | undefined {
    if (typeof value === "object" && value !== null && !Array.isArray(value))
      return value as Fields;
    this.fail(path, "expected an object");
    return undefined;
  }

  string(fields: Fields, key: string, path: string): string {
    const value = fields[key];
    if (typeof value === "string" && value !== "") return value;
    this.fail(`${path}.${key}`, "expected a non-empty string");
    return "";
  }

  nullableString(fields: Fields, key: string, path: string): string | null {
    return fields[key] === null ? null : this.string(fields, key, path);
  }

  boolean(fields: Fields, key: string, path: string, fallback?: boolean): boolean {
    const value = fields[key];
    if (typeof value === "boolean") return value;
    if (value === undefined && fallback !== undefined) return fallback;
    this.fail(`${path}.${key}`, "expected a boolean");
    return false;
  }

  integer(fields: Fields, key: string, path: string): number {
    const value = fields[key];
    if (Number.isInteger(value)) return value as number;
    this.fail(`${path}.${key}`, "expected an integer");
    return 0;
  }

  number(fields: Fields, key: string, path: string): number {
    const value = fields[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    this.fail(`${path}.${key}`, "expected a number");
    return 0;
  }

  /** An array of non-empty strings. */
  strings(value: unknown, path: string): string[] {
    const out: string[] = [];
    for (const [i, item] of this.array(value, path).entries()) {
      if (typeof item === "string" && item !== "") out.push(item);
      else this.fail(`${path}[${String(i)}]`, "expected a non-empty string");
    }
    return out;
  }

  requirement(value: unknown, path: string): Requirement {
    try {
      return parseRequirement(value, path);
    } catch (error) {
      if (!(error instanceof RequirementParseError)) throw error;
      this.problems.push(error.message);
      return false;
    }
  }
}
