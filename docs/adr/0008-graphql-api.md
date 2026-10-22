# 8. GraphQL API: code first, limits before execution, rate limit in Redis

- Status: accepted
- Date: 2026-10-22

## Context

The API exposes the generation to clients: the options a request accepts, a mutation that accepts a request,
and queries for its job and its challenge. A public GraphQL endpoint can be asked arbitrarily deep or wide
queries, and generation is the expensive operation, so both need limits.

## Decision

- **Code first** with `@nestjs/graphql` and Apollo Server 5: the schema is generated from decorated classes.
  The enums (difficulty, length, curve) are built from the core's value lists (`EASY` in the schema, `"easy"`
  in the code), so the lists stay the single source.
- **The mutation only accepts.** `generateChallenge` validates the input with the shared Zod schema, checks
  the starting class against the data, draws the seed, and stores a queued job with its outbox event. The
  worker generates it (block 18). An invalid request never becomes a job.
- **Depth limit (7)**: a validation rule of our own (about 40 lines), so a deep query is refused before it
  runs. **Cost limit (300)**: `graphql-query-complexity`, one point per field, checked after validation; it
  catches wide queries (many aliases) that depth does not.
- **Rate limit on generation** with `@nestjs/throttler` (10 per client per minute by default) and a **Redis
  storage of our own**: one Lua script counts, expires and blocks atomically, so every instance of the API
  shares the same counters. Without `REDIS_URL`, counters stay in memory (development and tests).
- `DATABASE_URL` is required; the database client connects on its first query.

| Considered                            | Why not                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------- |
| `@nest-lab/throttler-storage-redis`   | Does not support NestJS 12 yet; the storage is one interface method and a short script      |
| `graphql-depth-limit`                 | No release since 2022 and no bundled types; the rule is small                               |
| Read, then write the counter (no Lua) | Two instances race between the read and the write; the script makes it one step             |
| Generating inside the mutation        | Holds the request for seconds and ties API capacity to generation; the queue decouples them |

## Consequences

- Apollo reports every validation error, the depth limit included, as `GRAPHQL_VALIDATION_FAILED`; the
  message says which limit.
- Behind a proxy, the client's address comes from `X-Forwarded-For` only if Express's `trust proxy` is set;
  that is a deployment setting (phase H).
- The fixed window allows a burst of up to twice the limit across a window boundary; acceptable for this use.
