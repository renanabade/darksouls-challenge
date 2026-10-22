import { Redis } from "ioredis";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { RedisThrottlerStorage } from "../src/throttle/redis-storage.js";

// Runs against a real Redis, started by the global setup (test/services.ts).
const url = inject("services").redisUrl;

describe.skipIf(url === undefined)("RedisThrottlerStorage", () => {
  let redis: Redis;
  let storage: RedisThrottlerStorage;

  beforeAll(() => {
    redis = new Redis(url ?? "");
    storage = new RedisThrottlerStorage(redis);
  });

  afterAll(async () => {
    await redis.quit();
  });

  it("counts hits in a window and blocks past the limit", async () => {
    const key = randomUUID();
    const first = await storage.increment(key, 60_000, 2, 0, "test");
    expect(first).toMatchObject({ totalHits: 1, isBlocked: false });
    expect(first.timeToExpire).toBeGreaterThan(0);
    await storage.increment(key, 60_000, 2, 0, "test");
    const third = await storage.increment(key, 60_000, 2, 0, "test");
    expect(third).toMatchObject({ totalHits: 3, isBlocked: true });
    expect(third.timeToBlockExpire).toBeGreaterThan(0);
  });

  it("counts one client across instances, and atomically", async () => {
    const key = randomUUID();
    const connection = redis.duplicate();
    const other = new RedisThrottlerStorage(connection);
    const hits = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        (i % 2 === 0 ? storage : other).increment(key, 60_000, 100, 0, "test"),
      ),
    );
    expect(hits.map((h) => h.totalHits).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
    await connection.quit();
  });

  it("starts a new window when the old one expires", async () => {
    const key = randomUUID();
    await storage.increment(key, 50, 5, 0, "test");
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect((await storage.increment(key, 50, 5, 0, "test")).totalHits).toBe(1);
  });
});
