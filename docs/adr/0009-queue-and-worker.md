# 9. Generation through RabbitMQ: relay, idempotent worker, fan-out to subscribers

- Status: accepted
- Date: 2026-10-22

## Context

The API accepts a generation request as a job and its outbox event (ADR 0007). Something must carry the event
to a worker, survive a worker that dies mid-job, retry what can succeed later, set aside what never will, and
tell the waiting client, even with several API instances.

## Decision

- **amqplib directly** with a small shared package (`packages/messaging`): the topology, publishing with
  broker confirms, and reading a message body. Every process declares the topology (idempotent).
- **Topology**: a topic exchange `events`; the queue `generation.requested`; a retry exchange and queue with a
  TTL that dead-letters back to `events` (a retry after a delay, without a timer in the worker); a dead letter
  exchange and queue for messages nobody can handle.
- **Outbox relay in the API**: every 250 ms it locks unpublished events with `FOR UPDATE SKIP LOCKED`,
  publishes them with confirms, and marks them in the same transaction. Several API instances can relay at
  once without taking the same events.
- **Worker** (`apps/worker`, plain Node, no framework): prefetch 1; the ack goes only after the job's outcome
  is committed. A worker that dies before its ack leaves the message unacknowledged, and the broker delivers
  it again. The job's status makes that harmless: a finished job is acknowledged without work.
- **Failure policy**: generation is a pure function of the stored request, so its failure is final (the job
  is marked failed, no retry). A database failure is retried through the retry queue, counted by an
  `x-attempt` header, up to 3 deliveries, then dead-lettered. A message that is not a job event goes straight
  to the dead letter queue.
- **Subscriptions without shared pub/sub**: each API instance binds its own exclusive queue to
  `challenge.ready`, so the broker fans every event out to every instance, and each one publishes it to its
  own in-memory GraphQL pub/sub (`graphql-ws`). Redis pub/sub is not needed.
- Without `RABBITMQ_URL`, the API still accepts jobs; their events wait in the outbox.

| Considered                               | Why not                                                                                                   |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `@golevelup/nestjs-rabbitmq`             | The worker has no NestJS; the API needs two small loops. One more abstraction over a small surface        |
| `@nestjs/microservices` transport        | Its RabbitMQ transport hides the topology (retry and dead letter queues) that this design depends on      |
| Requeue on failure (`nack` with requeue) | Immediate redelivery: a failing message loops at full speed; the TTL queue gives a delay                  |
| Redis pub/sub for subscriptions          | The broker already fans out; one less moving part                                                         |
| Relay in the worker                      | While no worker runs, events would wait in the outbox; in the broker, the queue's depth shows the backlog |

## Consequences

- Delivery is at least once end to end; every consumer checks state before acting.
- A client subscribes to `challengeReady(jobId)` and then queries the job once, to cover a job that finished
  before the subscription started.
- A lost broker connection ends the process; the orchestrator restarts it (phase H).
