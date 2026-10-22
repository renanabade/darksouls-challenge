# 7. Database: Prisma 7, jobs as rows, a transactional outbox

- Status: accepted
- Date: 2026-10-22

## Context

A generation request becomes a job: the API accepts it, a worker generates it, the result is stored and the
client is told. The database and the broker (RabbitMQ, block 18) are two systems: if the API writes the job
and then crashes before publishing the message, the job is lost; if it publishes first and the write fails,
the worker gets a job that does not exist. Messages can also be delivered twice.

## Decision

- **Prisma 7** in a shared package (`packages/db`): schema, migrations and the client used by the API and the
  worker. Prisma 7 talks to PostgreSQL through a driver adapter (`pg`); the client is generated on install and
  not committed.
- **Three tables**: `challenge` (stored once, never recalculated; carries the game, the request with its seed,
  and the data and generator versions), `generation_job` (status, attempts, error, correlation ID) and
  `outbox_event`.
- **Transactional outbox**: every write that another process must react to adds an event row in the same
  transaction. A relay (block 18) publishes pending events and marks them published. The broker only ever
  hears of committed changes; a crash leaves events pending, never lost (at-least-once delivery).
- **The seed is drawn before the job is stored**, so a retried job generates the same challenge.
- **Idempotent completion**: completing a finished job changes nothing; two workers completing the same job
  at once leave one challenge (the status update is conditional, and the loser's transaction rolls back).
- **Database tests against a real PostgreSQL**, migrated by the tests themselves: a service container in CI,
  Docker Compose locally. They are skipped when `DATABASE_URL` is not set.

| Considered                        | Why not                                                                                      |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| Publish to the broker, then write | The dual write: a crash between the two loses the job or creates a phantom one               |
| Distributed transaction (2PC)     | RabbitMQ does not take part in one; the outbox gets the same guarantee with one database     |
| Mocked database in tests          | The guarantees live in transactions and conditional updates; only a real database tests them |
| Commit the generated client       | Large generated code in reviews; generating on install is fast and needs no database         |

## Consequences

- Consumers must be idempotent (at-least-once delivery): the worker checks the job's status before working.
- The outbox table grows; published rows can be pruned later (not needed at this scale).
