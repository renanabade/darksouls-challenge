/**
 * The shape of an order template: the three pieces (trigger, scope, command), the modes it exists in,
 * how each mode validates it, and the parameters the generator fills in from the seed.
 * Catalog and rules: docs/02 in the planning workspace; the templates themselves are in catalog.ts.
 */

export type Mode = "static" | "live";

/**
 * weightOnly: never makes the run impossible, only costs difficulty or friction.
 * existence: at least one way to comply exists. worstCase: every choice the player may make still complies.
 * autoException: the graph lists what the order would forbid but the game requires, and the manual excepts it.
 * actualCase: checked against what the player reported; live only.
 */
export type Validation = "weightOnly" | "existence" | "worstCase" | "autoException" | "actualCase";

/** Difficulty bands for numeric parameters. Initial estimates, to be tuned by playing. */
export type Difficulty = "easy" | "medium" | "hard" | "extreme";

export type ParamKind =
  | "area"
  | "boss"
  | "milestone"
  | "merchant"
  | "weapon"
  | "weaponLocation"
  | "count"
  | "condition"
  | "restriction"
  | "restrictionList"
  | "equipmentSet"
  | "lordSoulOrder";

export interface ParamSpec {
  readonly kind: ParamKind;
  /** For counts: the [min, max] range the seed draws from, per difficulty, when already known. */
  readonly ranges?: Readonly<Record<Difficulty, readonly [number, number]>>;
}

/** A milestone filled in by the generator, a fixed one (milestones.json id), or whichever of several comes first. */
export type MilestoneRef =
  | { readonly param: string }
  | { readonly milestone: string }
  | { readonly firstOf: readonly string[] };

export type Trigger =
  | { readonly kind: "runStart" }
  | { readonly kind: "enterArea"; readonly area: string }
  /** Entering a boss's arena: the "enter area" trigger, with the area given by the boss. */
  | { readonly kind: "enterArena"; readonly boss: string }
  /** Without a boss: any boss. */
  | { readonly kind: "defeatBoss"; readonly boss?: string }
  | { readonly kind: "death" }
  | { readonly kind: "pickUp" }
  | { readonly kind: "milestone"; readonly milestone: MilestoneRef };

export type Scope =
  | { readonly kind: "run" }
  /** Between two milestones. Without `from` it starts when the trigger fires; without `until` it lasts to the end. */
  | { readonly kind: "phase"; readonly from?: MilestoneRef; readonly until?: MilestoneRef }
  | { readonly kind: "area"; readonly area: string }
  | { readonly kind: "fight"; readonly boss: string }
  | { readonly kind: "untilNextMilestone" };

/** What the master commands, in a form the validator can act on. String fields name parameters. */
export type Command =
  | { readonly kind: "prohibit"; readonly action: "useItemsPickedUp" }
  | { readonly kind: "prohibit"; readonly action: "restAtBonfire" }
  | { readonly kind: "prohibit"; readonly action: "useEstus" }
  | { readonly kind: "prohibit"; readonly action: "buyFrom"; readonly merchant: string }
  | { readonly kind: "prohibit"; readonly action: "enterArea"; readonly area: string }
  | { readonly kind: "prohibit"; readonly action: "useWeapon"; readonly weapon: string }
  | { readonly kind: "prohibit"; readonly action: "restriction"; readonly restriction: string }
  | { readonly kind: "prohibit"; readonly action: "restrictions"; readonly restrictions: string }
  | { readonly kind: "require"; readonly action: "wearArmorPickedUp" }
  | { readonly kind: "require"; readonly action: "lordSoulsInOrder"; readonly order: string }
  | { readonly kind: "require"; readonly action: "defeatBoss"; readonly boss: string }
  | {
      readonly kind: "limit";
      readonly action: "attempts" | "deaths" | "levelUps" | "weaponUpgrades";
      /** A count parameter, or a fixed number. */
      readonly max: string | number;
    }
  | {
      readonly kind: "assign";
      readonly action: "weapon";
      readonly source: "firstPickedUp" | "atLocation" | "fitsStats";
      readonly location?: string;
      readonly weapon?: string;
    }
  | { readonly kind: "swap"; readonly before: string; readonly after: string }
  | { readonly kind: "offerChoice"; readonly restriction: string };

/** Attribute, not a fourth piece (docs/01, 19/10/2026): the order applies only when this holds. */
export type Condition =
  | { readonly kind: "attemptsAtMost"; readonly max: string }
  /** A condition drawn by the generator, e.g. "without using Estus". */
  | { readonly kind: "drawn"; readonly param: string };

/** Attribute, not a fourth piece: what the graph says the game requires, written into the manual. */
export interface Exceptions {
  /** The placeholder in the text that receives the list. */
  readonly placeholder: string;
  readonly rule: "requiredItemsInArea" | "requiredItemsSoldOnlyBy";
}

/** What the live master asks the player. Static orders never ask anything. */
export type Question = "weaponUsed" | "acceptWager" | "strengthAndDexterity";

export interface OrderTemplate {
  readonly id: string;
  /** The number in the catalog document. */
  readonly number: number;
  readonly title: string;
  /** Manual text; {name} placeholders are parameters or the exceptions list. */
  readonly text: string;
  readonly params: Readonly<Record<string, ParamSpec>>;
  readonly trigger: Trigger;
  readonly scope: Scope;
  readonly command: Command;
  /** How each mode the order exists in validates it. The keys are the modes. */
  readonly validation: Readonly<Partial<Record<Mode, Validation>>>;
  readonly condition?: Condition;
  readonly exceptions?: Exceptions;
  readonly asks?: Question;
  /** Advice printed with the order. Not an order: ignoring it never ends the run. */
  readonly advice?: string;
  /** Only generated when the player opts in on the customizer. */
  readonly optIn?: boolean;
}

export function modesOf(order: OrderTemplate): Mode[] {
  return (["static", "live"] as const).filter((mode) => order.validation[mode] !== undefined);
}

/** Every parameter the pieces refer to, with the kind it must have. */
export function paramRefsOf(order: OrderTemplate): { param: string; kind: ParamKind }[] {
  const refs: { param: string; kind: ParamKind }[] = [];
  const add = (param: string | undefined, kind: ParamKind): void => {
    if (param !== undefined) refs.push({ param, kind });
  };
  const milestone = (ref: MilestoneRef | undefined): void => {
    if (ref !== undefined && "param" in ref) add(ref.param, "milestone");
  };

  const { trigger, scope, command, condition } = order;
  if (trigger.kind === "enterArea") add(trigger.area, "area");
  if (trigger.kind === "enterArena" || trigger.kind === "defeatBoss") add(trigger.boss, "boss");
  if (trigger.kind === "milestone") milestone(trigger.milestone);

  if (scope.kind === "phase") {
    milestone(scope.from);
    milestone(scope.until);
  }
  if (scope.kind === "area") add(scope.area, "area");
  if (scope.kind === "fight") add(scope.boss, "boss");

  switch (command.kind) {
    case "prohibit":
      if (command.action === "buyFrom") add(command.merchant, "merchant");
      if (command.action === "enterArea") add(command.area, "area");
      if (command.action === "useWeapon") add(command.weapon, "weapon");
      if (command.action === "restriction") add(command.restriction, "restriction");
      if (command.action === "restrictions") add(command.restrictions, "restrictionList");
      break;
    case "require":
      if (command.action === "lordSoulsInOrder") add(command.order, "lordSoulOrder");
      if (command.action === "defeatBoss") add(command.boss, "boss");
      break;
    case "limit":
      if (typeof command.max === "string") add(command.max, "count");
      break;
    case "assign":
      add(command.location, "weaponLocation");
      add(command.weapon, "weapon");
      break;
    case "swap":
      add(command.before, "equipmentSet");
      add(command.after, "equipmentSet");
      break;
    case "offerChoice":
      add(command.restriction, "restriction");
      break;
  }

  if (condition?.kind === "attemptsAtMost") add(condition.max, "count");
  if (condition?.kind === "drawn") add(condition.param, "condition");
  return refs;
}

/** The {name} placeholders of a text, in order of first appearance. */
export function placeholdersOf(text: string): string[] {
  return [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? ""))];
}
