# 0014. One server process, with a job table

## Status

Accepted. Replaces what ADRs 0006 to 0010 decided for the TypeScript API.

## Context

The old backend was a NestJS GraphQL API, a separate worker, Redis, RabbitMQ and an outbox. The queue existed because
generation once ran in a Python worker. It no longer does, and the generator takes about a second at its worst.

## Decision

One ASP.NET Core process with a REST API, EF Core and PostgreSQL. Generation runs in a `BackgroundService` that reads a
`generation_jobs` table, taking each job with `FOR UPDATE SKIP LOCKED` inside a transaction that lasts as long as the work.

The queue stays because generation is still far slower than any other request, and one request must not hold a thread for
it. A table is enough: if the process dies, the lock goes with it and the job is simply taken again, with no broker to run
and no state a crash can leave behind. `SKIP LOCKED` also keeps it correct with several instances, should that ever happen.

A challenge is stored once per code. Clients can generate in the browser without the server; the server's copy is what a
ranking entry points at, so a score never depends on what a client claims a challenge was.

Rate limits are ASP.NET Core's, in memory: enough for one process.

Integration tests run the whole server on a real PostgreSQL, a service in CI, because the queue depends on its row locks.

## Consequences

- The site and the API can be one deployment, which makes hosting simple, and it needs a host that runs .NET.
- More instances would each have their own rate limits; that is acceptable until there are more instances.