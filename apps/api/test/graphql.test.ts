import "reflect-metadata";
import { ChallengeRepository, type JobWithChallenge, type NewJob } from "@darksouls-challenge/db";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { CONFIG, loadConfig, type Config } from "../src/config.js";

/** The repository's contract, in memory: the database itself is tested in packages/db. */
class MemoryRepository {
  readonly jobs = new Map<string, JobWithChallenge>();
  readonly accepted: NewJob[] = [];

  enqueue(job: NewJob) {
    this.accepted.push(job);
    const row: JobWithChallenge = {
      id: randomUUID(),
      status: "QUEUED",
      game: job.game,
      request: job.request,
      correlationId: job.correlationId,
      attempts: 0,
      error: null,
      challengeId: null,
      challenge: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.jobs.set(row.id, row);
    return Promise.resolve(row);
  }

  find(id: string) {
    return Promise.resolve(this.jobs.get(id) ?? null);
  }

  findChallenge() {
    return Promise.resolve(null);
  }
}

const LIMIT = 4;

describe("the GraphQL API", () => {
  let app: INestApplication;
  let url: string;
  let repository: MemoryRepository;
  let client = 0;

  /** Each test is its own client (its own address for the rate limit), unless it says otherwise. */
  async function gql(
    query: string,
    variables: Record<string, unknown> = {},
    headers: Record<string, string> = {},
  ) {
    const response = await fetch(`${url}/graphql`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": `10.0.0.${String(client)}`,
        ...headers,
      },
      body: JSON.stringify({ query, variables }),
    });
    return (await response.json()) as {
      data?: Record<string, unknown> | null;
      errors?: { message: string; extensions?: { code?: string } }[];
    };
  }

  const GENERATE = `mutation ($input: GenerateChallengeInput) {
    generateChallenge(input: $input) { id status attempts challenge { id } }
  }`;

  beforeAll(async () => {
    repository = new MemoryRepository();
    const config: Config = {
      ...loadConfig({ DATABASE_URL: "postgresql://localhost:5432/unused" }),
      logLevel: "silent",
      generationLimit: LIMIT,
    };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CONFIG)
      .useValue(config)
      .overrideProvider(ChallengeRepository)
      .useValue(repository)
      .compile();
    app = moduleRef.createNestApplication();
    // The rate limit tracks the client's address; tests set it through the proxy header.
    (app.getHttpAdapter().getInstance() as { set(k: string, v: unknown): void }).set(
      "trust proxy",
      true,
    );
    await app.listen(0);
    url = (await app.getUrl()).replace("[::1]", "localhost");
  });

  beforeEach(() => {
    client += 1;
  });

  afterAll(async () => {
    await app.close();
  });

  it("lists the values a request accepts", async () => {
    const { data } = await gql("{ options { difficulties lengths curves startingClasses } }");
    expect(data?.["options"]).toMatchObject({
      difficulties: ["EASY", "MEDIUM", "HARD", "EXTREME"],
      lengths: ["SHORT", "FULL", "EPIC"],
    });
    expect((data?.["options"] as { startingClasses: string[] }).startingClasses).toContain(
      "Knight",
    );
  });

  it("accepts a request as a queued job, with the seed drawn and the correlation ID kept", async () => {
    const { data, errors } = await gql(
      GENERATE,
      { input: { players: ["HARD", "EASY"], length: "EPIC" } },
      { "x-request-id": "corr-1" },
    );
    expect(errors).toBeUndefined();
    expect(data?.["generateChallenge"]).toMatchObject({
      status: "QUEUED",
      attempts: 0,
      challenge: null,
    });
    const accepted = repository.accepted.at(-1);
    expect(accepted?.correlationId).toBe("corr-1");
    expect(accepted?.request).toMatchObject({ players: ["hard", "easy"], length: "epic" });
    expect(accepted?.request.seed).toMatch(/^[0-9a-f]{8}$/);
  });

  it("finds the job it accepted, and nothing for an unknown or malformed id", async () => {
    const { data } = await gql(GENERATE, { input: { seed: "ashen-one" } });
    const id = (data?.["generateChallenge"] as { id: string }).id;
    const found = await gql("query ($id: ID!) { job(id: $id) { id status } }", { id });
    expect(found.data?.["job"]).toEqual({ id, status: "QUEUED" });
    const unknown = await gql("query ($id: ID!) { job(id: $id) { id } }", { id: randomUUID() });
    expect(unknown.data?.["job"]).toBeNull();
    const malformed = await gql("query ($id: ID!) { job(id: $id) { id } }", { id: "1 OR 1=1" });
    expect(malformed.data?.["job"]).toBeNull();
  });

  it("refuses a bad request before it becomes a job", async () => {
    const before = repository.accepted.length;
    const empty = await gql(GENERATE, { input: { players: [] } });
    expect(empty.errors?.[0]?.extensions?.code).toBe("BAD_USER_INPUT");
    const unknownClass = await gql(GENERATE, { input: { startingClass: "Paladin" } });
    expect(unknownClass.errors?.[0]?.message).toContain("unknown starting class");
    const badEnum = await gql(GENERATE, { input: { players: ["BRUTAL"] } });
    expect(badEnum.errors).toBeDefined();
    expect(repository.accepted.length).toBe(before);
  });

  it("refuses a query nested too deep", async () => {
    const deep = '{ job(id: "x") { challenge { players { chapters { goal } } } } }'.replace(
      "goal",
      "goal __typename",
    );
    expect((await gql(deep)).errors).toBeUndefined();
    const fragment = "fragment F on Chapter { goal }";
    const nested = `{ a: job(id: "x") { challenge { players { chapters { ...F } orders { id } } } } } ${fragment}`;
    expect((await gql(nested)).errors).toBeUndefined();
    const tooDeep = `{ __schema { types { fields { type { ofType { ofType { ofType { ofType { name } } } } } } } } }`;
    // Apollo reports every validation error as GRAPHQL_VALIDATION_FAILED; the message says which.
    expect((await gql(tooDeep)).errors?.[0]?.message).toMatch(/depth 8 exceeds the limit of 7/);
  });

  it("refuses a query that costs too much", async () => {
    const aliases = Array.from(
      { length: 120 },
      (_, i) => `o${String(i)}: options { curves lengths }`,
    );
    const { errors } = await gql(`{ ${aliases.join(" ")} }`);
    expect(errors?.[0]?.extensions?.code).toBe("QUERY_TOO_COMPLEX");
  });

  it("limits generation requests per client", async () => {
    const results = [];
    for (let i = 0; i <= LIMIT; i += 1) results.push(await gql(GENERATE));
    expect(results.slice(0, LIMIT).every((r) => r.errors === undefined)).toBe(true);
    expect(results[LIMIT]?.errors?.[0]?.message).toMatch(/too many requests/i);
    client += 1;
    expect((await gql(GENERATE)).errors).toBeUndefined();
  });
});
