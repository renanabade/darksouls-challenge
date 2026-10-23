export {
  ATTUNEMENT_FOR_ONE_SLOT,
  damages,
  ELEMENTAL,
  elementalDefenses,
  isMeleeWeapon,
  pointsToWield,
  SCHOOLS,
  spellKit,
  strengthNeeded,
  type Attribute,
  type Boss,
  type BossPart,
  type Element,
  type School,
  type Spell,
  type StartingClass,
  type Stats,
  type Weapon,
} from "./build.js";
export * from "./generator/index.js";
export * from "./orders/index.js";
export { reach, type Reach, type ReachOptions } from "./reach.js";
export {
  evaluate,
  itemsOf,
  parseRequirement,
  regionsOf,
  RequirementParseError,
  type Requirement,
  type RequirementContext,
} from "./requirement.js";
export {
  BELLS,
  InvalidOrderError,
  startingItems,
  validate,
  type ArgValue,
  type OrderInstance,
  type OrderResult,
  type Setup,
  type Support,
  type ValidationResult,
  type Verdict,
} from "./validator.js";
export {
  parseWorld,
  WorldParseError,
  type Area,
  type Entrance,
  type GiftItem,
  type Location,
  type Merchant,
  type Milestone,
  type RawDataSet,
  type Region,
  type StartingGift,
  type World,
} from "./world.js";
