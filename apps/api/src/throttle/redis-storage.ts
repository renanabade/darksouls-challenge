import type { ThrottlerStorage } from "@nestjs/throttler";
import type { Redis } from "ioredis";

type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage["increment"]>>;

/**
 * A fixed window per key, counted in one atomic step: hits, the window's time left, and a block once the
 * limit is passed. One script, so two instances of the API never race between reading and writing.
 */
const INCREMENT = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
local blocked = redis.call('PTTL', KEYS[2])
if hits > tonumber(ARGV[2]) and blocked < 0 then
  redis.call('SET', KEYS[2], 1, 'PX', ARGV[3])
  blocked = tonumber(ARGV[3])
end
return { hits, ttl, blocked }
`;

/** Rate limit counters shared by every instance of the API. */
export class RedisThrottlerStorage implements ThrottlerStorage {
  readonly #redis: Redis;

  constructor(redis: Redis) {
    this.#redis = redis;
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const base = `throttle:${throttlerName}:${key}`;
    const block = blockDuration > 0 ? blockDuration : ttl;
    const [hits, timeLeft, blocked] = (await this.#redis.eval(
      INCREMENT,
      2,
      `${base}:hits`,
      `${base}:block`,
      ttl,
      limit,
      block,
    )) as [number, number, number];
    return {
      totalHits: hits,
      timeToExpire: Math.ceil(Math.max(timeLeft, 0) / 1000),
      isBlocked: blocked > 0,
      timeToBlockExpire: Math.ceil(Math.max(blocked, 0) / 1000),
    };
  }
}
