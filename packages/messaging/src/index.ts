import type { Channel, ConfirmChannel, Message } from "amqplib";

/**
 * The broker's topology, declared by every process that uses it (declaring is idempotent):
 *
 * - `events` (topic): every outbox event, published by the relay with its topic as the routing key.
 * - `generation.requested` (queue): the worker's work. A message rejected for good goes to `events.dead`.
 * - `events.retry` → `generation.retry` (queue with a TTL): a message waits there, then the broker
 *   dead-letters it back to `events` with its routing key, so a retry happens after a delay.
 * - `events.dead` → `generation.dead` (queue): messages nobody could handle, kept for inspection.
 */
export const TOPOLOGY = {
  events: "events",
  retry: "events.retry",
  dead: "events.dead",
  generationQueue: "generation.requested",
  retryQueue: "generation.retry",
  deadQueue: "generation.dead",
} as const;

/** How long a failed job waits before its next attempt. */
export const RETRY_DELAY_MS = 5_000;

export async function assertTopology(channel: Channel): Promise<void> {
  await channel.assertExchange(TOPOLOGY.events, "topic", { durable: true });
  await channel.assertExchange(TOPOLOGY.retry, "topic", { durable: true });
  await channel.assertExchange(TOPOLOGY.dead, "topic", { durable: true });

  await channel.assertQueue(TOPOLOGY.generationQueue, {
    durable: true,
    deadLetterExchange: TOPOLOGY.dead,
  });
  await channel.bindQueue(TOPOLOGY.generationQueue, TOPOLOGY.events, TOPOLOGY.generationQueue);

  await channel.assertQueue(TOPOLOGY.retryQueue, {
    durable: true,
    messageTtl: RETRY_DELAY_MS,
    deadLetterExchange: TOPOLOGY.events,
  });
  await channel.bindQueue(TOPOLOGY.retryQueue, TOPOLOGY.retry, "#");

  await channel.assertQueue(TOPOLOGY.deadQueue, { durable: true });
  await channel.bindQueue(TOPOLOGY.deadQueue, TOPOLOGY.dead, "#");
}

export interface Published {
  readonly exchange: string;
  readonly routingKey: string;
  readonly payload: unknown;
  /** The correlation ID, so the consumer logs under the same ID as the request. */
  readonly correlationId?: string;
  /** A stable id, so a consumer can recognize a redelivered message. */
  readonly messageId?: string;
  readonly headers?: Readonly<Record<string, unknown>>;
}

/** Publishes persistent JSON and resolves once the broker has confirmed it (written to the queue). */
export function publish(channel: ConfirmChannel, message: Published): Promise<void> {
  return new Promise((resolve, reject) => {
    channel.publish(
      message.exchange,
      message.routingKey,
      Buffer.from(JSON.stringify(message.payload)),
      {
        persistent: true,
        contentType: "application/json",
        ...(message.correlationId !== undefined && { correlationId: message.correlationId }),
        ...(message.messageId !== undefined && { messageId: message.messageId }),
        ...(message.headers !== undefined && { headers: message.headers }),
      },
      (error: unknown) => {
        if (error === null || error === undefined) resolve();
        else reject(error instanceof Error ? error : new Error("the broker refused the message"));
      },
    );
  });
}

/** The JSON body of a message, or undefined when it is not JSON. */
export function bodyOf(message: Message): unknown {
  try {
    return JSON.parse(message.content.toString("utf8"));
  } catch {
    return undefined;
  }
}
