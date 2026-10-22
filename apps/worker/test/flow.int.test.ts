import { loadDataSet } from "@darksouls-challenge/contracts";
import { parseWorld } from "@darksouls-challenge/core";
import {
  ChallengeRepository,
  createPrismaClient,
  TOPICS,
  type PrismaClient,
} from "@darksouls-challenge/db";
import { assertTopology, bodyOf, publish, TOPOLOGY } from "@darksouls-challenge/messaging";
import { connect, type ChannelModel, type ConfirmChannel } from "amqplib";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { startWorker, type Worker } from "../src/worker.js";

// The whole path through a real PostgreSQL and a real RabbitMQ, started by the global setup
// (test/services.ts): the database is truncated and the queues purged.
const { databaseUrl, rabbitUrl } = inject("services");

const world = parseWorld(loadDataSet(new URL("../../../data/ds1/", import.meta.url)));

describe.skipIf(databaseUrl === undefined || rabbitUrl === undefined)(
  "generation through the broker",
  { timeout: 60_000 },
  () => {
    let prisma: PrismaClient;
    let repository: ChallengeRepository;
    let connection: ChannelModel;
    let channel: ConfirmChannel;
    let worker: Worker;
    const ready: unknown[] = [];

    /** One pass of the relay, as the API runs it. */
    const relay = () =>
      repository.relay(50, async (events) => {
        for (const event of events)
          await publish(channel, {
            exchange: TOPOLOGY.events,
            routingKey: event.topic,
            payload: event.payload,
          });
      });

    async function until<T>(check: () => Promise<T | undefined>): Promise<T> {
      for (let i = 0; i < 200; i += 1) {
        const value = await check();
        if (value !== undefined) return value;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error("timed out");
    }

    beforeAll(async () => {
      prisma = createPrismaClient(databaseUrl ?? "");
      repository = new ChallengeRepository(prisma);
      await prisma.$executeRawUnsafe(
        "TRUNCATE generation_job, challenge, outbox_event RESTART IDENTITY CASCADE",
      );
      connection = await connect(rabbitUrl ?? "");
      channel = await connection.createConfirmChannel();
      await assertTopology(channel);
      for (const queue of [TOPOLOGY.generationQueue, TOPOLOGY.retryQueue, TOPOLOGY.deadQueue])
        await channel.purgeQueue(queue);
      const { queue } = await channel.assertQueue("", { exclusive: true });
      await channel.bindQueue(queue, TOPOLOGY.events, TOPICS.challengeReady);
      await channel.consume(
        queue,
        (msg) => {
          if (msg !== null) ready.push(bodyOf(msg));
        },
        { noAck: true },
      );
      worker = await startWorker(
        connection,
        { world, repository, maxAttempts: 3 },
        pino({ level: "silent" }),
      );
    });

    afterAll(async () => {
      await worker.close();
      await connection.close();
      await prisma.$disconnect();
    });

    it("turns an accepted job into a stored challenge and announces it", async () => {
      const job = await repository.enqueue({
        game: "ds1",
        request: { seed: "broker", players: ["medium"], length: "short" },
        correlationId: "flow-1",
      });
      expect(await relay()).toBe(1);
      const done = await until(async () => {
        const found = await repository.find(job.id);
        return found?.status === "DONE" ? found : undefined;
      });
      expect(done.attempts).toBe(1);
      expect(done.challenge?.seed).toBe("broker");
      // The ready event reaches the broker on the next relay pass.
      expect(await relay()).toBe(1);
      const event = await until(() =>
        Promise.resolve(ready.find((e) => (e as { jobId?: string }).jobId === job.id)),
      );
      expect(event).toMatchObject({ correlationId: "flow-1", challengeId: done.challengeId });
    });

    it("ignores a duplicate message for a job already done", async () => {
      const job = await repository.enqueue({
        game: "ds1",
        request: { seed: "twice", players: ["easy"], length: "short" },
        correlationId: "flow-2",
      });
      const payload = { jobId: job.id, correlationId: "flow-2" };
      await relay();
      await until(async () =>
        (await repository.find(job.id))?.status === "DONE" ? true : undefined,
      );
      await publish(channel, {
        exchange: TOPOLOGY.events,
        routingKey: TOPICS.generationRequested,
        payload,
      });
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect((await repository.find(job.id))?.attempts).toBe(1);
      expect(await prisma.challenge.count({ where: { seed: "twice" } })).toBe(1);
    });

    it("sends a message that is not a job event to the dead letter queue", async () => {
      await publish(channel, {
        exchange: TOPOLOGY.events,
        routingKey: TOPICS.generationRequested,
        payload: { nonsense: true },
      });
      const dead = await until(async () => {
        const msg = await channel.get(TOPOLOGY.deadQueue, { noAck: true });
        return msg === false ? undefined : bodyOf(msg);
      });
      expect(dead).toEqual({ nonsense: true });
    });
  },
);
