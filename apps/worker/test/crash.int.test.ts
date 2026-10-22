import { loadDataSet } from "@darksouls-challenge/contracts";
import { parseWorld } from "@darksouls-challenge/core";
import {
  ChallengeRepository,
  createPrismaClient,
  TOPICS,
  type PrismaClient,
} from "@darksouls-challenge/db";
import { assertTopology, publish, TOPOLOGY } from "@darksouls-challenge/messaging";
import { connect, type ChannelModel, type ConfirmChannel } from "amqplib";
import { pino } from "pino";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import { startWorker } from "../src/worker.js";

// Phase D's closing test: a worker dies in the middle of a job, and the job still ends with exactly one
// challenge. Real PostgreSQL and RabbitMQ, from the global setup (test/services.ts).
const { databaseUrl, rabbitUrl } = inject("services");

const world = parseWorld(loadDataSet(new URL("../../../data/ds1/", import.meta.url)));
const silent = pino({ level: "silent" });
const never = new Promise<never>(() => undefined);

type Repo = Pick<ChallengeRepository, "start" | "complete" | "fail">;

describe.skipIf(databaseUrl === undefined || rabbitUrl === undefined)(
  "a worker that dies mid-job",
  { timeout: 90_000 },
  () => {
    let prisma: PrismaClient;
    let repository: ChallengeRepository;
    let admin: ChannelModel;
    let channel: ConfirmChannel;
    const open: ChannelModel[] = [];

    async function until<T>(check: () => Promise<T | undefined>): Promise<T> {
      for (let i = 0; i < 300; i += 1) {
        const value = await check();
        if (value !== undefined) return value;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error("timed out");
    }

    /** A worker on its own connection, as a separate process would have. */
    async function worker(repo: Repo): Promise<ChannelModel> {
      const connection = await connect(rabbitUrl ?? "");
      open.push(connection);
      await startWorker(connection, { world, repository: repo, maxAttempts: 3 }, silent);
      return connection;
    }

    /** Kills a worker the hard way: its connection drops with the message unacknowledged. */
    async function kill(connection: ChannelModel): Promise<void> {
      open.splice(open.indexOf(connection), 1);
      await connection.close();
    }

    async function accept(seed: string) {
      const job = await repository.enqueue({
        game: "ds1",
        request: { seed, players: ["medium"], length: "short" },
        correlationId: seed,
      });
      await repository.relay(50, async (events) => {
        for (const event of events)
          if (event.topic === TOPICS.generationRequested)
            await publish(channel, {
              exchange: TOPOLOGY.events,
              routingKey: event.topic,
              payload: event.payload,
            });
      });
      return job;
    }

    beforeAll(async () => {
      prisma = createPrismaClient(databaseUrl ?? "");
      repository = new ChallengeRepository(prisma);
      await prisma.$executeRawUnsafe(
        "TRUNCATE generation_job, challenge, outbox_event RESTART IDENTITY CASCADE",
      );
      admin = await connect(rabbitUrl ?? "");
      channel = await admin.createConfirmChannel();
      await assertTopology(channel);
    });

    beforeEach(async () => {
      for (const queue of [TOPOLOGY.generationQueue, TOPOLOGY.retryQueue, TOPOLOGY.deadQueue])
        await channel.purgeQueue(queue);
    });

    // Every worker of a test dies with it, so none takes the next test's messages.
    afterEach(async () => {
      for (const connection of open.splice(0)) await connection.close().catch(() => undefined);
    });

    afterAll(async () => {
      await admin.close();
      await prisma.$disconnect();
    });

    it("hands the job to another worker when the first dies before storing it", async () => {
      // The first worker takes the job and hangs before its commit: it never stores, never acknowledges.
      let taken = false;
      const dying = await worker({
        start: async (id) => {
          taken = true;
          return repository.start(id);
        },
        complete: () => never,
        fail: () => never,
      });
      const job = await accept("dies-before-commit");
      await until(() => Promise.resolve(taken ? true : undefined));
      await kill(dying);

      await worker(repository);
      const done = await until(async () => {
        const found = await repository.find(job.id);
        return found?.status === "DONE" ? found : undefined;
      });
      expect(done.attempts).toBe(2);
      expect(await prisma.challenge.count({ where: { seed: "dies-before-commit" } })).toBe(1);
    });

    it("does not generate twice when the first dies after storing, before acknowledging", async () => {
      // The first worker stores the challenge, then hangs before its ack.
      const dying = await worker({
        start: (id) => repository.start(id),
        complete: async (id, generated) => {
          await repository.complete(id, generated);
          return never;
        },
        fail: () => never,
      });
      const job = await accept("dies-before-ack");
      await until(async () =>
        (await repository.find(job.id))?.status === "DONE" ? true : undefined,
      );
      let redelivered = false;
      await kill(dying);

      await worker({
        start: async (id) => {
          redelivered = true;
          return repository.start(id);
        },
        complete: (id, generated) => repository.complete(id, generated),
        fail: (id, error) => repository.fail(id, error),
      });
      await until(() => Promise.resolve(redelivered ? true : undefined));
      await until(async () => {
        const { messageCount } = await channel.checkQueue(TOPOLOGY.generationQueue);
        return messageCount === 0 ? true : undefined;
      });
      const after = await repository.find(job.id);
      expect(after).toMatchObject({ status: "DONE", attempts: 1 });
      expect(await prisma.challenge.count({ where: { seed: "dies-before-ack" } })).toBe(1);
    });
  },
);
