import { CURVES, DIFFICULTIES, LENGTHS } from "@darksouls-challenge/core";
import { Field, ID, InputType, Int, ObjectType, registerEnumType } from "@nestjs/graphql";

/** A GraphQL enum over one of the core's value lists: EASY in the schema, "easy" in the code. */
function enumOver<T extends string>(values: readonly T[], name: string, description: string) {
  const type = Object.fromEntries(values.map((v) => [v.toUpperCase(), v])) as Record<string, T>;
  registerEnumType(type, { name, description });
  return type;
}

export const Difficulty = enumOver(DIFFICULTIES, "Difficulty", "How hard a player's challenge is.");
export const Length = enumOver(LENGTHS, "Length", "How many orders the journey has.");
export const Curve = enumOver(CURVES, "Curve", "How difficulty moves across the chapters.");

export const JobStatus = { QUEUED: "QUEUED", RUNNING: "RUNNING", DONE: "DONE", FAILED: "FAILED" };
registerEnumType(JobStatus, { name: "JobStatus" });

@ObjectType({ description: "The values a generation request accepts." })
export class Options {
  @Field(() => [Difficulty]) difficulties!: string[];
  @Field(() => [Length]) lengths!: string[];
  @Field(() => [Curve]) curves!: string[];
  @Field(() => [String], { description: "Names of the starting classes." })
  startingClasses!: string[];
}

@ObjectType({ description: "One order of the manual." })
export class Order {
  @Field(() => ID, { description: "The order's template in the catalog." }) id!: string;
  @Field(() => Int, {
    nullable: true,
    description: "Its chapter; null for a rule of the whole journey.",
  })
  chapter!: number | null;
  @Field() text!: string;
  @Field(() => [String], { description: "Items the order lets the player use anyway." })
  exceptions!: string[];
}

@ObjectType({ description: "A stretch of the run, ended by a milestone." })
export class Chapter {
  @Field() goal!: string;
  @Field(() => [String]) areas!: string[];
  @Field(() => [String]) bosses!: string[];
  @Field(() => Difficulty) difficulty!: string;
}

@ObjectType({
  description:
    "One player's challenge: the group shares the orders, the numbers follow each player.",
})
export class PlayerChallenge {
  @Field(() => Difficulty) difficulty!: string;
  @Field(() => Length) length!: string;
  @Field(() => Curve) curve!: string;
  @Field() startingClass!: string;
  @Field(() => Int) levelCap!: number;
  @Field(() => [Chapter]) chapters!: Chapter[];
  @Field(() => [Order]) orders!: Order[];
  @Field({ description: "The manual in Markdown." }) manual!: string;
}

@ObjectType({ description: "A generated challenge, stored once and never recalculated." })
export class Challenge {
  @Field(() => ID) id!: string;
  @Field() game!: string;
  @Field() seed!: string;
  @Field() dataVersion!: string;
  @Field() generatorVersion!: string;
  @Field(() => [PlayerChallenge], { description: "One per player, in the order of the request." })
  players!: PlayerChallenge[];
  @Field() createdAt!: Date;
}

@ObjectType({
  description: "A generation request, from its acceptance until its challenge is stored.",
})
export class GenerationJob {
  @Field(() => ID) id!: string;
  @Field(() => JobStatus) status!: string;
  @Field(() => Int) attempts!: number;
  @Field(() => String, { nullable: true }) error!: string | null;
  @Field(() => Challenge, { nullable: true }) challenge!: Challenge | null;
  @Field() createdAt!: Date;
}

@InputType({
  description:
    "What to generate. Class, gift, level cap and curve are drawn from the seed when absent.",
})
export class GenerateChallengeInput {
  @Field({ nullable: true, description: "Drawn when absent, and returned with the challenge." })
  seed?: string;
  @Field(() => [Difficulty], {
    nullable: true,
    description: "One per player; one medium player by default.",
  })
  players?: string[];
  @Field(() => Length, { nullable: true }) length?: string;
  @Field(() => Curve, { nullable: true }) curve?: string;
  @Field({ nullable: true }) startingClass?: string;
  @Field(() => Int, { nullable: true, description: "Row of the starting gift in the data set." })
  giftRow?: number;
  @Field(() => Int, { nullable: true }) levelCap?: number;
}
