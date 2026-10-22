import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  ChallengeRepository,
  createPrismaClient,
  TOPICS,
  type Generated,
  type NewJob,
  type PrismaClient,
} from "../src/index.js";

// Runs against a real PostgreSQL: CI provides one; locally, set DATABASE_URL (a throwaway database: it is
// truncated before each test).
const url = process.env["DATABASE_URL"];

const job: NewJob = {
  game: "ds1",
  request: { seed: "ashen-one", players: ["medium"], length: "full" },
  correlationId: "test-run",
};
const generated = {
  dataVersion: "0.6.0",
  generatorVersion: "5",
  documents: [],
} satisfies Generated;

describe.skipIf(url === undefined)("ChallengeRepository", () => {
  let prisma: PrismaClient;
  let repository: ChallengeRepository;

  beforeAll(() => {
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      shell: true,
      stdio: "ignore",
    });
    prisma = createPrismaClient(url ?? "");
    repository = new ChallengeRepository(prisma);
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      "TRUNCATE generation_job, challenge, outbox_event RESTART IDENTITY CASCADE",
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("accepts a job together with its event", async () => {
    const created = await repository.enqueue(job);
    expect(created.status).toBe("QUEUED");
    const events = await repository.pendingEvents(10);
    expect(events.map((e) => [e.topic, e.payload])).toEqual([
      [TOPICS.generationRequested, { jobId: created.id, correlationId: "test-run" }],
    ]);
  });

  it("counts every attempt, and has nothing to start once the job is done", async () => {
    const { id } = await repository.enqueue(job);
    expect((await repository.start(id))?.attempts).toBe(1);
    expect((await repository.start(id))?.status).toBe("RUNNING");
    await repository.complete(id, generated);
    expect(await repository.start(id)).toBeNull();
  });

  it("stores the challenge once, however many times the job is completed", async () => {
    const { id } = await repository.enqueue(job);
    await repository.start(id);
    const [first, second] = await Promise.all([
      repository.complete(id, generated),
      repository.complete(id, generated),
    ]);
    expect(first.status).toBe("DONE");
    expect(second.challengeId).toBe(first.challengeId);
    await repository.complete(id, generated);
    expect(await prisma.challenge.count()).toBe(1);
    expect(first.challenge?.seed).toBe("ashen-one");
    const ready = (await repository.pendingEvents(10)).filter(
      (e) => e.topic === TOPICS.challengeReady,
    );
    expect(ready).toHaveLength(1);
  });

  it("keeps a failed job failed", async () => {
    const { id } = await repository.enqueue(job);
    await repository.fail(id, "no such class");
    const after = await repository.complete(id, generated);
    expect(after).toMatchObject({ status: "FAILED", error: "no such class", challengeId: null });
  });

  it("hands the relay its events in order, once", async () => {
    await repository.enqueue(job);
    await repository.enqueue(job);
    const pending = await repository.pendingEvents(10);
    expect(pending.map((e) => e.id)).toEqual([1n, 2n]);
    await repository.markPublished([1n]);
    expect((await repository.pendingEvents(10)).map((e) => e.id)).toEqual([2n]);
  });
});
