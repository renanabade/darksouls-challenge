# 12. Rewrite in C# and .NET, with one server process

- Status: accepted
- Date: 2026-11-04

## Context

The project was a TypeScript monorepo: a pure domain core and a CLI, a Next.js site, and a NestJS GraphQL API with a
separate worker, PostgreSQL, Redis and RabbitMQ. The site generated challenges in the browser and never called the
API, so the backend had no client. Its queue existed to reach a Python worker that ADR 0006 had already dropped.

The maintainer now targets .NET, and the next features (login and a ranking) need a real server.

## Decision

- **C# on .NET 10 (LTS)** for everything. No Node tooling in the repository or in CI.
- **The domain core stays pure:** a class library with no I/O and no dependencies, shared by the CLI, the site and
  the server.
- **Blazor WebAssembly** for the site, so the core runs in the browser as it did before.
- **One ASP.NET Core process with PostgreSQL** for the server. Generation jobs are rows read by a `BackgroundService`
  with `FOR UPDATE SKIP LOCKED`; retries are a status and a count on the row.
- **REST instead of GraphQL:** a handful of operations and one client do not need a query language.
- **Integration tests against a real PostgreSQL:** installed locally, a service container in CI.
- **Same results first:** the port must draw the same challenges as the TypeScript generator 7, proved by reference
  manuals. Only then do behavior changes land, under generator 8.

| Considered            | Why not                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------ |
| Keep RabbitMQ         | One producer and one consumer in one process; the table already holds the jobs             |
| Keep Redis            | Rate limits and subscriptions fit in memory with one instance; a ranking fits in SQL here  |
| Separate worker       | A process boundary with no benefit at this load                                            |
| GraphQL (Hot Chocolate) | Adds depth and cost limits to defend a flexibility that no client asks for               |
| Testcontainers        | Needs Docker on every machine; CI service containers and a local install cover the same SQL |

## Consequences

- ADRs 0001 and 0006 to 0010 are superseded by this one and kept as history. ADRs 0002 to 0005 and 0011 are domain
  decisions and still apply; where they name TypeScript paths, read their C# counterparts.
- Running several server instances later needs a shared store for rate limits and for notifying clients.
- Commit messages stay Conventional Commits, without a hook to check them.
