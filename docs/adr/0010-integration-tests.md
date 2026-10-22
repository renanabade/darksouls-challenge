# 10. Integration tests: Testcontainers, one file at a time

- Status: accepted
- Date: 2026-10-22

## Context

The guarantees of phase D (one transaction for a job and its event, idempotent completion, the relay's
`SKIP LOCKED`, the worker's ack after commit) only show against a real PostgreSQL and a real RabbitMQ. Until
now CI provided them as service containers, and the tests ran in parallel files that shared one database and
one set of queues: a file truncating the tables while another used them passed by luck.

## Decision

- **Testcontainers** in a Vitest global setup (`test/services.ts`) starts PostgreSQL, Redis and RabbitMQ once
  per run, migrates the database once, and hands the URLs to the tests (`inject("services")`). A URL already
  in the environment is used instead (for example `docker compose`). Without Docker, the tests that need a
  service are skipped with a warning; in CI (`REQUIRE_SERVICES=1`) a service that fails to start fails the
  run.
- **Two Vitest projects**: `unit` (everything else, in parallel) and `integration` (`*.int.test.ts`, one file
  at a time, since the files share the database and the queues). Each file truncates and purges what it uses.
- **Phase D's closing tests**:
  - a worker that dies before storing its job: another worker takes the message and stores the one challenge
    (two attempts);
  - a worker that dies after storing, before its ack: the message comes back, and the second worker does
    nothing (one attempt, one challenge);
  - end to end: a GraphQL mutation, the outbox relay, the broker, a worker, and the `challengeReady`
    subscription over graphql-ws.
- A worker "dies" by losing its connection with the message unacknowledged, as a killed process would.

| Considered                     | Why not                                                                                                    |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| CI service containers          | Tests could not run the same way on a developer machine; the setup lived only in CI YAML                   |
| A database per test file       | Isolation without serial files, but the queues would still be shared                                       |
| Killing a worker child process | Needs a build or a TypeScript runner in the test; dropping the connection is the same event for the broker |

## Consequences

- `pnpm test` runs everything wherever Docker runs; on a machine without Docker it still passes, with the
  integration tests skipped and named in the output.
- The integration project adds container startup (about 15 s) to a run.
