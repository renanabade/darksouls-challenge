# 14. One server process, with a job table

- Status: accepted

## Context

Generation is far slower than any other request, and a stored challenge must survive a crash halfway through. A broker would answer
both, at the price of a second system to run for one producer and one consumer in one process.

## Decision

One Spring Boot process with a REST API, JPA, Flyway and PostgreSQL. Generation runs in a worker that reads a `generation_jobs` table,
taking each job with `FOR UPDATE SKIP LOCKED` inside a transaction that lasts as long as the work.

If the process dies, the lock goes with it and the job is simply taken again: no broker to run, and no state a crash can leave behind.
`SKIP LOCKED` also keeps it correct with several instances, should that ever happen.

The worker runs on a platform thread, because generating is pure CPU; requests run on virtual threads, because they mostly wait for the
database.

A challenge is stored once per code. The server's copy is what a ranking entry points at, so a score never depends on what a client
claims a challenge was.

Rate limits are a small filter of fixed windows, in memory: enough for one process.

The schema belongs to Flyway. Hibernate only maps it, and validates nothing at startup, because `document` is `jsonb`, written through a
column transformer. The ranking is one aggregate query in `JdbcClient`, which reads better as SQL than as JPQL.

| Considered | Why not                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------ |
| RabbitMQ   | One producer and one consumer in one process; the table already holds the jobs             |
| `@Async`   | A job in memory dies with the process, and the client would wait forever                   |
| Redis      | Rate limits fit in memory with one instance, and a ranking fits in SQL here                |

## Consequences

- The site and the API are one deployment, on a host that runs a container.
- More instances would each have their own rate limits; that is acceptable until there are more instances.
- Behind a proxy the rate limits key on the proxy's address, until the server is told to trust forwarded headers.
- Integration tests run on a real PostgreSQL, because the queue depends on its row locks. A test holds a row's lock on a second connection
  and checks that the worker skips it.
