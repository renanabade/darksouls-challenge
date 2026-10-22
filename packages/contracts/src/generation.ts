import { randomBytes } from "node:crypto";
import {
  CURVES,
  DIFFICULTIES,
  generateGroup,
  LENGTHS,
  orderText,
  renderManual,
  type ArgValue,
  type Challenge,
  type World,
} from "@darksouls-challenge/core";
import { z } from "zod";

/** A Zod enum over one of the core's value lists, so the lists stay the single source. */
function enumOf<T extends string>(values: readonly T[]) {
  return z.enum(values as readonly [T, ...T[]]);
}

/**
 * What a client asks for. One difficulty per player: a single player gets the solo challenge, several get
 * one challenge for the group, with handicap (the core's `generateGroup`). Class, gift, level cap and curve
 * are drawn from the seed when absent; whether a class or gift exists is the core's to check.
 */
export const GenerationRequest = z.strictObject({
  seed: z.string().trim().min(1).max(64).optional(),
  players: z.array(enumOf(DIFFICULTIES)).min(1).max(8).default(["medium"]),
  length: enumOf(LENGTHS).default("full"),
  curve: enumOf(CURVES).optional(),
  startingClass: z.string().trim().min(1).max(32).optional(),
  giftRow: z.int().nonnegative().optional(),
  levelCap: z.int().positive().optional(),
});
export type GenerationRequest = z.infer<typeof GenerationRequest>;

/** An order as it leaves the system: the template's id, its arguments and its manual text. */
export interface OrderDocument {
  readonly id: string;
  readonly chapter?: number;
  readonly args: Readonly<Record<string, ArgValue>>;
  readonly exceptions: readonly string[];
  readonly text: string;
}

/** A generated challenge as it is stored and served: plain JSON, with the manual already rendered. */
export interface ChallengeDocument extends Omit<Challenge, "orders"> {
  readonly orders: readonly OrderDocument[];
  /** The manual in Markdown. */
  readonly manual: string;
}

export function toDocument(world: World, challenge: Challenge): ChallengeDocument {
  return {
    ...challenge,
    orders: challenge.orders.map((o) => ({
      id: o.template.id,
      ...(o.chapter !== undefined && { chapter: o.chapter }),
      args: o.args,
      exceptions: o.exceptions,
      text: orderText(world, o),
    })),
    manual: renderManual(world, challenge),
  };
}

/** Draws a short seed, so a challenge asked without one can still be shared. */
export function drawSeed(): string {
  return randomBytes(4).toString("hex");
}

/** Generates the request's challenges, one per player, in the order of `players`. */
export function runGeneration(
  world: World,
  request: GenerationRequest,
  seed: () => string = drawSeed,
): ChallengeDocument[] {
  const config = {
    seed: request.seed ?? seed(),
    length: request.length,
    ...(request.curve !== undefined && { curve: request.curve }),
    ...(request.startingClass !== undefined && { startingClass: request.startingClass }),
    ...(request.giftRow !== undefined && { giftRow: request.giftRow }),
    ...(request.levelCap !== undefined && { levelCap: request.levelCap }),
  };
  return generateGroup(world, config, request.players).map((c) => toDocument(world, c));
}
