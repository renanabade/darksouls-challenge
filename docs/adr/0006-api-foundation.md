# 6. API foundation: NestJS app, shared contracts, generation in Node

- Status: accepted
- Date: 2026-10-22

## Context

Phase D puts the core behind an API: a GraphQL API, a database, a queue and a worker that runs the generation.
The original plan had a Python worker with a constraint solver for the build check, but the build check is
already in the core (`build.ts`), in TypeScript. The API, the worker and the CLI all need the same request
shape, the same serialized challenge and the same data loading.

## Decision

- **`apps/api`, NestJS 12** (ESM, Express adapter). Configuration is read once from the environment and checked
  with Zod; a bad value stops the process at startup. The world is parsed once at startup and injected as a
  value (`WORLD`): it is static and small, so it lives in memory, not in a cache.
- **`packages/contracts`**: the generation request (a Zod schema built from the core's value lists, so they stay
  the single source), the challenge document (plain JSON with the rendered manual) and the data set loader.
  The CLI now goes through it too, so the CLI and the API cannot drift apart.
- **One difficulty per player** in the request: one player gets the solo challenge, several get the group
  challenge with handicap. A single entry point instead of two.
- **Generation runs in Node.** The job consumer will be a Node worker calling the core. No Python worker in
  phase D; it comes back only if a problem needs the solver.
- **Logs with Pino** (JSON, one line per event) and a **correlation ID** per request (`x-request-id`, kept when
  the caller sends a valid one), which will travel with the generation job.
- **Tests run through SWC** (`unplugin-swc`): NestJS injects by the constructor's parameter types, which needs
  legacy decorators with emitted metadata, and Vitest's default transform does not emit it.

| Considered                  | Why not                                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| Python worker for the build | Nothing left for it: the build check is in TypeScript; it would only be a demonstration             |
| Fastify adapter             | Faster, but the GraphQL and testing ecosystem around NestJS is broader on Express; not a bottleneck |
| `@nestjs/config` with Joi   | Zod is already the project's boundary validator (ADR 0002); one tool for every boundary             |
| Generation inside the API   | A slow generation would hold an HTTP worker; the queue keeps the API responsive (block 18)          |

## Consequences

- The CLI's `--json` output is now the challenge document, with the manual included.
- `apps/*` turn off `erasableSyntaxOnly` (constructor parameter properties are the NestJS idiom) and turn on
  decorators; `packages/*` keep the stricter settings.
