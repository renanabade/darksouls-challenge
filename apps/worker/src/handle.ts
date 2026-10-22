import { GenerationRequest, runGeneration } from "@darksouls-challenge/contracts";
import { GENERATOR_VERSION, type World } from "@darksouls-challenge/core";
import type { ChallengeRepository } from "@darksouls-challenge/db";
import { z } from "zod";

const JobEvent = z.object({ jobId: z.uuid(), correlationId: z.string() });
const StoredRequest = GenerationRequest.extend({ seed: z.string() });

/**
 * What to do with a message once handled:
 * - ack: done with it (the job finished, failed for good, or was already finished: a redelivery);
 * - retry: a transient failure (the database); try again after a delay;
 * - dead: nobody can handle it (not a job event, or every retry used); keep it for inspection.
 */
export type Outcome =
  | { readonly kind: "ack"; readonly note: string }
  | { readonly kind: "retry"; readonly error: string }
  | { readonly kind: "dead"; readonly error: string };

export interface HandlerDeps {
  readonly world: World;
  readonly repository: Pick<ChallengeRepository, "start" | "complete" | "fail">;
  /** Deliveries allowed for a message before it goes to the dead letter queue. */
  readonly maxAttempts: number;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Handles one `generation.requested` message. Idempotent: the job's status in the database decides, so a
 * message delivered twice (a worker that died before its ack) never generates two challenges. Generation is
 * a pure function of the stored request, so a failure there is final; a database failure is retried.
 */
export async function handleGeneration(
  deps: HandlerDeps,
  body: unknown,
  attempt: number,
): Promise<Outcome> {
  const event = JobEvent.safeParse(body);
  if (!event.success) return { kind: "dead", error: "not a job event" };
  const { jobId } = event.data;

  const transient = (error: unknown): Outcome =>
    attempt < deps.maxAttempts
      ? { kind: "retry", error: message(error) }
      : { kind: "dead", error: `gave up after ${String(attempt)} attempts: ${message(error)}` };

  let job;
  try {
    job = await deps.repository.start(jobId);
  } catch (error) {
    return transient(error);
  }
  if (job === null) return { kind: "ack", note: "job already finished or unknown" };

  const request = StoredRequest.safeParse(job.request);
  let generated;
  try {
    if (!request.success) throw new Error(`stored request is invalid: ${request.error.message}`);
    generated = {
      dataVersion: deps.world.dataVersion,
      generatorVersion: GENERATOR_VERSION,
      documents: runGeneration(deps.world, request.data),
    };
  } catch (error) {
    try {
      await deps.repository.fail(jobId, message(error));
    } catch (failure) {
      return transient(failure);
    }
    return { kind: "ack", note: `generation failed: ${message(error)}` };
  }

  try {
    await deps.repository.complete(jobId, generated);
  } catch (error) {
    if (attempt >= deps.maxAttempts)
      await deps.repository.fail(jobId, message(error)).catch(() => undefined);
    return transient(error);
  }
  return { kind: "ack", note: "challenge stored" };
}
