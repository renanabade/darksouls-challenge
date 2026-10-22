import "reflect-metadata";
import {
  ChallengeRepository,
  createPrismaClient,
  type PrismaClient,
} from "@darksouls-challenge/db";
import { assertTopology, TOPOLOGY } from "@darksouls-challenge/messaging";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { connect, type ChannelModel } from "amqplib";
import { createClient, type Client } from "graphql-ws";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { startWorker, type Worker } from "../../worker/src/worker.js";
import { AppModule } from "../src/app.module.js";
import { CONFIG, loadConfig } from "../src/config.js";
import { WORLD } from "../src/game/game.module.js";

// Phase D end to end: a client asks the API, the outbox reaches the broker, a worker generates, and the
// client hears of it through the subscription. Real services from the global setup (test/services.ts).
const { databaseUrl, redisUrl, rabbitUrl } = inject("services");

describe.skipIf(databaseUrl === undefined || redisUrl === undefined || rabbitUrl === undefined)(
  "a challenge from request to subscription",
  { timeout: 90_000 },
  () => {
    let app: INestApplication;
    let url: string;
    let prisma: PrismaClient;
    let broker: ChannelModel;
    let worker: Worker | undefined;
    let ws: Client;

    async function gql(query: string, variables: Record<string, unknown> = {}) {
      const response = await fetch(`${url}/graphql`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-request-id": "e2e-1" },
        body: JSON.stringify({ query, variables }),
      });
      return (await response.json()) as {
        data?: Record<string, unknown> | null;
        errors?: unknown[];
      };
    }

    beforeAll(async () => {
      prisma = createPrismaClient(databaseUrl ?? "");
      await prisma.$executeRawUnsafe(
        "TRUNCATE generation_job, challenge, outbox_event RESTART IDENTITY CASCADE",
      );
      broker = await connect(rabbitUrl ?? "");
      const channel = await broker.createChannel();
      await assertTopology(channel);
      for (const queue of [TOPOLOGY.generationQueue, TOPOLOGY.retryQueue, TOPOLOGY.deadQueue])
        await channel.purgeQueue(queue);
      await channel.close();

      const config = {
        ...loadConfig({ DATABASE_URL: databaseUrl, REDIS_URL: redisUrl, RABBITMQ_URL: rabbitUrl }),
        logLevel: "silent" as const,
      };
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(CONFIG)
        .useValue(config)
        .compile();
      app = moduleRef.createNestApplication();
      await app.listen(0);
      url = (await app.getUrl()).replace("[::1]", "localhost");
      ws = createClient({ url: `${url.replace(/^http/, "ws")}/graphql` });
    });

    afterAll(async () => {
      await ws.dispose();
      await worker?.close();
      await app.close();
      await broker.close();
      await prisma.$disconnect();
    });

    it("generates through the API and announces the challenge", async () => {
      const accepted = await gql(
        `mutation { generateChallenge(input: { seed: "end-to-end", players: [HARD, EASY], length: SHORT }) {
          id status } }`,
      );
      expect(accepted.errors).toBeUndefined();
      const jobId = (accepted.data?.["generateChallenge"] as { id: string }).id;

      // Subscribe first; the worker starts afterwards, so the event cannot come before the subscription.
      const ready = new Promise<Record<string, unknown>>((resolve, reject) => {
        const stop = ws.subscribe(
          {
            query: `subscription ($jobId: ID!) {
              challengeReady(jobId: $jobId) {
                id status challenge { seed players { difficulty manual orders { id text } } }
              }
            }`,
            variables: { jobId },
          },
          {
            next: (result) => {
              stop();
              if (result.data) resolve(result.data);
              else reject(new Error(JSON.stringify(result.errors)));
            },
            error: reject,
            complete: () => undefined,
          },
        );
      });
      await new Promise((resolve) => setTimeout(resolve, 500));
      worker = await startWorker(
        broker,
        {
          world: app.get(WORLD),
          repository: new ChallengeRepository(prisma),
          maxAttempts: 3,
        },
        pino({ level: "silent" }),
      );

      const event = (await ready)["challengeReady"] as {
        id: string;
        status: string;
        challenge: { seed: string; players: { difficulty: string; manual: string }[] };
      };
      expect(event).toMatchObject({ id: jobId, status: "DONE" });
      expect(event.challenge.seed).toBe("end-to-end");
      expect(event.challenge.players.map((p) => p.difficulty)).toEqual(["HARD", "EASY"]);
      expect(event.challenge.players[0]?.manual).toContain("end-to-end");

      const queried = await gql("query ($id: ID!) { job(id: $id) { status attempts } }", {
        id: jobId,
      });
      expect(queried.data?.["job"]).toEqual({ status: "DONE", attempts: 1 });
      const job = await prisma.generationJob.findUniqueOrThrow({ where: { id: jobId } });
      expect(job.correlationId).toBe("e2e-1");
    });
  },
);
