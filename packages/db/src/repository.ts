import type { ChallengeDocument, GenerationRequest } from "@darksouls-challenge/contracts";
import type {
  Challenge,
  GenerationJob,
  OutboxEvent,
  Prisma,
  PrismaClient,
} from "./generated/client.js";

/** Topics of the outbox events, which the relay publishes as routing keys. */
export const TOPICS = {
  /** A job was accepted; the worker generates it. Payload: `JobEvent`. */
  generationRequested: "generation.requested",
  /** A job's challenge is stored. Payload: `JobEvent` with the challenge's id. */
  challengeReady: "challenge.ready",
} as const;

export interface JobEvent {
  readonly jobId: string;
  readonly correlationId: string;
  readonly challengeId?: string;
}

export interface NewJob {
  readonly game: string;
  /** Validated, with the seed already drawn, so a retry generates the same challenge. */
  readonly request: GenerationRequest & { readonly seed: string };
  readonly correlationId: string;
}

export interface Generated {
  readonly dataVersion: string;
  readonly generatorVersion: string;
  readonly documents: readonly ChallengeDocument[];
}

export type JobWithChallenge = GenerationJob & { challenge: Challenge | null };

const json = (value: unknown) => value as Prisma.InputJsonValue;

/** Thrown inside a transaction to roll it back when the job was already finished. */
class JobFinished extends Error {}

/**
 * Every write of a job goes through here. A write that something else must react to (the worker, the
 * subscribers) adds its outbox event in the same transaction: the database is the single source of truth, and
 * the broker only learns of committed changes.
 */
export class ChallengeRepository {
  readonly #prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.#prisma = prisma;
  }

  private get prisma(): PrismaClient {
    return this.#prisma;
  }

  /** Accepts a job: the job and its `generation.requested` event, together or not at all. */
  async enqueue(job: NewJob): Promise<GenerationJob> {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.generationJob.create({
        data: { game: job.game, request: json(job.request), correlationId: job.correlationId },
      });
      const event: JobEvent = { jobId: created.id, correlationId: job.correlationId };
      await tx.outboxEvent.create({
        data: { topic: TOPICS.generationRequested, payload: json(event) },
      });
      return created;
    });
  }

  async find(id: string): Promise<JobWithChallenge | null> {
    return this.prisma.generationJob.findUnique({ where: { id }, include: { challenge: true } });
  }

  /**
   * Marks a job as taken by a worker and counts the attempt. Returns null when there is nothing to do: the job
   * is unknown or already finished (a redelivered message), so the worker acknowledges and moves on.
   */
  async start(id: string): Promise<GenerationJob | null> {
    const { count } = await this.prisma.generationJob.updateMany({
      where: { id, status: { in: ["QUEUED", "RUNNING"] } },
      data: { status: "RUNNING", attempts: { increment: 1 } },
    });
    return count === 0 ? null : this.prisma.generationJob.findUnique({ where: { id } });
  }

  /**
   * Stores the job's challenge and announces it. Idempotent: a job that is already finished keeps its
   * challenge, and a second worker finishing the same job (a redelivery) changes nothing.
   */
  async complete(id: string, generated: Generated): Promise<JobWithChallenge> {
    try {
      await this.store(id, generated);
    } catch (error) {
      if (!(error instanceof JobFinished)) throw error;
    }
    const job = await this.find(id);
    if (job === null) throw new Error(`job ${id} not found`);
    return job;
  }

  private async store(id: string, generated: Generated): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const job = await tx.generationJob.findUniqueOrThrow({ where: { id } });
      if (job.status === "DONE" || job.status === "FAILED") throw new JobFinished();
      const request = job.request as unknown as NewJob["request"];
      const challenge = await tx.challenge.create({
        data: {
          game: job.game,
          seed: request.seed,
          request: json(request),
          dataVersion: generated.dataVersion,
          generatorVersion: generated.generatorVersion,
          documents: json(generated.documents),
        },
      });
      // Only the transaction that moves the job out of RUNNING commits; a concurrent one rolls back.
      const { count } = await tx.generationJob.updateMany({
        where: { id, status: { in: ["QUEUED", "RUNNING"] } },
        data: { status: "DONE", challengeId: challenge.id },
      });
      if (count === 0) throw new JobFinished();
      const event: JobEvent = {
        jobId: id,
        correlationId: job.correlationId,
        challengeId: challenge.id,
      };
      await tx.outboxEvent.create({ data: { topic: TOPICS.challengeReady, payload: json(event) } });
    });
  }

  /** Gives up on a job: generation failed for good (a bad request, or every retry used). */
  async fail(id: string, error: string): Promise<void> {
    await this.prisma.generationJob.updateMany({
      where: { id, status: { in: ["QUEUED", "RUNNING"] } },
      data: { status: "FAILED", error },
    });
  }

  /** The oldest events the relay has not published yet. */
  async pendingEvents(limit: number): Promise<OutboxEvent[]> {
    return this.prisma.outboxEvent.findMany({
      where: { publishedAt: null },
      orderBy: { id: "asc" },
      take: limit,
    });
  }

  async markPublished(ids: readonly bigint[]): Promise<void> {
    await this.prisma.outboxEvent.updateMany({
      where: { id: { in: [...ids] } },
      data: { publishedAt: new Date() },
    });
  }
}
