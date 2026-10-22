import { assertTopology, bodyOf, publish, TOPOLOGY } from "@darksouls-challenge/messaging";
import type { ChannelModel, ConsumeMessage } from "amqplib";
import type { Logger } from "pino";
import { handleGeneration, type HandlerDeps } from "./handle.js";

/** Header counting deliveries across retries (the broker's redelivery flag only says "at least twice"). */
export const ATTEMPT_HEADER = "x-attempt";

export interface Worker {
  /** Stops taking messages and waits for the one in hand, so a shutdown never interrupts a job. */
  close(): Promise<void>;
}

/**
 * Consumes `generation.requested` one message at a time (prefetch 1: a slow generation never holds other
 * messages hostage). The ack is sent only after the job's outcome is committed: if the worker dies before,
 * the broker hands the message to another worker, and the job's status makes the second run harmless.
 */
export async function startWorker(
  connection: Pick<ChannelModel, "createConfirmChannel">,
  deps: HandlerDeps,
  logger: Logger,
): Promise<Worker> {
  const channel = await connection.createConfirmChannel();
  await assertTopology(channel);
  await channel.prefetch(1);
  let inFlight: Promise<void> = Promise.resolve();

  const onMessage = async (msg: ConsumeMessage): Promise<void> => {
    const headers = (msg.properties.headers ?? {}) as Record<string, unknown>;
    const attempt = typeof headers[ATTEMPT_HEADER] === "number" ? headers[ATTEMPT_HEADER] : 1;
    const correlationId = (msg.properties.correlationId as string | undefined) ?? "unknown";
    const log = logger.child({ correlationId, attempt });
    const body = bodyOf(msg);
    const outcome = await handleGeneration(deps, body, attempt);
    switch (outcome.kind) {
      case "ack":
        log.info({ body }, outcome.note);
        channel.ack(msg);
        break;
      case "retry":
        log.warn({ body, error: outcome.error }, "retrying later");
        // The copy goes first and is confirmed; only then is the original acknowledged.
        await publish(channel, {
          exchange: TOPOLOGY.retry,
          routingKey: msg.fields.routingKey,
          payload: body,
          correlationId,
          headers: { [ATTEMPT_HEADER]: attempt + 1 },
        });
        channel.ack(msg);
        break;
      case "dead":
        log.error({ body, error: outcome.error }, "sent to the dead letter queue");
        channel.nack(msg, false, false);
        break;
    }
  };

  const { consumerTag } = await channel.consume(TOPOLOGY.generationQueue, (msg) => {
    if (msg === null) return;
    inFlight = inFlight.then(() =>
      onMessage(msg).catch((error: unknown) => {
        // Nothing could even be decided (the broker went away): leave the message unacknowledged, so it
        // is redelivered when the channel closes.
        logger.error({ error }, "message left unacknowledged");
      }),
    );
  });

  return {
    async close() {
      await channel.cancel(consumerTag);
      await inFlight;
      await channel.close();
    },
  };
}
