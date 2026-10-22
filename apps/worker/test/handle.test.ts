import { loadDataSet } from "@darksouls-challenge/contracts";
import { parseWorld } from "@darksouls-challenge/core";
import type { ChallengeRepository, GenerationJob } from "@darksouls-challenge/db";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { handleGeneration, type HandlerDeps } from "../src/handle.js";

const world = parseWorld(loadDataSet(new URL("../../../data/ds1/", import.meta.url)));
const jobId = randomUUID();
const event = { jobId, correlationId: "c-1" };

type Repo = Pick<ChallengeRepository, "start" | "complete" | "fail">;

function repository(job: Partial<GenerationJob> | null, overrides: Partial<Repo> = {}) {
  const calls = { completed: 0, failed: [] as string[] };
  const repo: Repo = {
    start: () =>
      Promise.resolve(job === null ? null : ({ id: jobId, attempts: 1, ...job } as GenerationJob)),
    complete: () => {
      calls.completed += 1;
      return Promise.resolve({} as Awaited<ReturnType<Repo["complete"]>>);
    },
    fail: (_id, error) => {
      calls.failed.push(error);
      return Promise.resolve();
    },
    ...overrides,
  };
  return { repo, calls };
}

const deps = (repo: Repo): HandlerDeps => ({ world, repository: repo, maxAttempts: 3 });
const request = { seed: "ashen-one", players: ["easy"], length: "short" };

describe("handleGeneration", { timeout: 60_000 }, () => {
  it("sends a message that is not a job event to the dead letter queue", async () => {
    const { repo } = repository(null);
    expect((await handleGeneration(deps(repo), { hello: 1 }, 1)).kind).toBe("dead");
  });

  it("acknowledges a redelivered message of a finished job without generating", async () => {
    const { repo, calls } = repository(null);
    expect((await handleGeneration(deps(repo), event, 2)).kind).toBe("ack");
    expect(calls.completed).toBe(0);
  });

  it("generates and stores the challenge, then acknowledges", async () => {
    const { repo, calls } = repository({ request });
    expect(await handleGeneration(deps(repo), event, 1)).toEqual({
      kind: "ack",
      note: "challenge stored",
    });
    expect(calls.completed).toBe(1);
  });

  it("fails the job for good when generation cannot work, without retrying", async () => {
    const { repo, calls } = repository({ request: { ...request, seed: undefined } });
    expect((await handleGeneration(deps(repo), event, 1)).kind).toBe("ack");
    expect(calls.failed[0]).toContain("stored request is invalid");
  });

  it("retries a database failure, and gives up after the last attempt", async () => {
    const down = () => Promise.reject(new Error("connection refused"));
    const { repo } = repository({ request }, { complete: down });
    expect(await handleGeneration(deps(repo), event, 1)).toEqual({
      kind: "retry",
      error: "connection refused",
    });
    const last = await handleGeneration(deps(repo), event, 3);
    expect(last.kind).toBe("dead");
    const { repo: startDown } = repository(null, { start: down });
    expect((await handleGeneration(deps(startDown), event, 1)).kind).toBe("retry");
  });
});
