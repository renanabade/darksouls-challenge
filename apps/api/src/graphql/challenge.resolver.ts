import {
  drawSeed,
  GenerationRequest,
  type ChallengeDocument,
} from "@darksouls-challenge/contracts";
import { CURVES, DIFFICULTIES, LENGTHS, type World } from "@darksouls-challenge/core";
import {
  ChallengeRepository,
  type Challenge as ChallengeRow,
  type JobWithChallenge,
} from "@darksouls-challenge/db";
import { Inject, UseGuards } from "@nestjs/common";
import { Args, Context, ID, Mutation, Query, Resolver } from "@nestjs/graphql";
import { GraphQLError } from "graphql";
import { z } from "zod";
import { WORLD } from "../game/game.module.js";
import { GqlThrottlerGuard } from "../throttle/throttle.module.js";
import {
  Challenge,
  GenerateChallengeInput,
  GenerationJob,
  Options,
  type PlayerChallenge,
} from "./models.js";

const GAME = "ds1";
const Uuid = z.uuid();

function badInput(message: string): GraphQLError {
  return new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}

/** GraphQL sends an absent optional field as null; the request schema expects it left out. */
function withoutNulls(input: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, v]) => v !== null && v !== undefined));
}

function player(document: ChallengeDocument): PlayerChallenge {
  return {
    difficulty: document.config.difficulty,
    length: document.config.length,
    curve: document.curve,
    startingClass: document.setup.startingClass,
    levelCap: document.setup.levelCap,
    chapters: document.chapters.map((c) => ({
      goal: c.goal,
      areas: [...c.areas],
      bosses: [...c.bosses],
      difficulty: c.difficulty,
    })),
    orders: document.orders.map((o) => ({
      id: o.id,
      chapter: o.chapter ?? null,
      text: o.text,
      exceptions: [...o.exceptions],
    })),
    manual: document.manual,
  };
}

function challenge(row: ChallengeRow): Challenge {
  return {
    id: row.id,
    game: row.game,
    seed: row.seed,
    dataVersion: row.dataVersion,
    generatorVersion: row.generatorVersion,
    players: (row.documents as unknown as ChallengeDocument[]).map(player),
    createdAt: row.createdAt,
  };
}

function job(row: JobWithChallenge): GenerationJob {
  return {
    id: row.id,
    status: row.status,
    attempts: row.attempts,
    error: row.error,
    challenge: row.challenge === null ? null : challenge(row.challenge),
    createdAt: row.createdAt,
  };
}

@Resolver()
export class ChallengeResolver {
  constructor(
    @Inject(WORLD) private readonly world: World,
    @Inject(ChallengeRepository) private readonly repository: ChallengeRepository,
  ) {}

  @Query(() => Options)
  options(): Options {
    return {
      difficulties: [...DIFFICULTIES],
      lengths: [...LENGTHS],
      curves: [...CURVES],
      startingClasses: [...this.world.classes.keys()].sort(),
    };
  }

  @Query(() => GenerationJob, { nullable: true })
  async job(@Args("id", { type: () => ID }) id: string): Promise<GenerationJob | null> {
    if (!Uuid.safeParse(id).success) return null;
    const row = await this.repository.find(id);
    return row === null ? null : job(row);
  }

  @Query(() => Challenge, { nullable: true })
  async challenge(@Args("id", { type: () => ID }) id: string): Promise<Challenge | null> {
    if (!Uuid.safeParse(id).success) return null;
    const row = await this.repository.findChallenge(id);
    return row === null ? null : challenge(row);
  }

  /**
   * Accepts a generation request and returns its job at once; the worker generates it. The seed is drawn
   * here, so the job is fully determined before it is stored.
   */
  @Mutation(() => GenerationJob)
  @UseGuards(GqlThrottlerGuard)
  async generateChallenge(
    @Args("input", { type: () => GenerateChallengeInput, nullable: true })
    input: GenerateChallengeInput | null,
    @Context("req") req: { id?: unknown },
  ): Promise<GenerationJob> {
    const parsed = GenerationRequest.safeParse(withoutNulls(input ?? {}));
    if (!parsed.success) throw badInput(z.prettifyError(parsed.error));
    const request = parsed.data;
    if (request.startingClass !== undefined && !this.world.classes.has(request.startingClass))
      throw badInput(`unknown starting class: ${request.startingClass}`);
    const created = await this.repository.enqueue({
      game: GAME,
      request: { ...request, seed: request.seed ?? drawSeed() },
      correlationId: typeof req.id === "string" ? req.id : "unknown",
    });
    return job({ ...created, challenge: null });
  }
}
