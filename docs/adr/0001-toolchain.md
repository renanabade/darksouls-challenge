# 1. Monorepo and TypeScript toolchain

- Status: accepted
- Date: 2026-10-13

## Context

The product will have a pure domain core, a NestJS API, a Next.js front end and a Python worker. The core must be
testable without any I/O and shared by the API and the command-line generator.

## Decision

| Concern  | Choice                                                                                                       | Considered                    | Why                                                                                                                                                             |
| -------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Packages | pnpm workspaces (`packages/*`), pnpm pinned via `packageManager`                                             | npm workspaces, Nx, Turborepo | Strict `node_modules` (no phantom dependencies), fast, content-addressed store. Nx/Turbo add value only with many packages; can be added later.                 |
| Language | TypeScript 6.0, `strict` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `erasableSyntaxOnly` | TypeScript 7 (native)         | TS 7 is not yet supported by typescript-eslint (peer `<6.1`). `erasableSyntaxOnly` keeps the code runnable by Node's type stripping and eases the move to TS 7. |
| Modules  | ESM, `NodeNext`                                                                                              | CommonJS                      | The standard; Node 24 can `require()` ESM, so a CommonJS NestJS app can still consume the core.                                                                 |
| Runtime  | Node 24 LTS                                                                                                  | Node 22                       | Longest support window at the time.                                                                                                                             |
| Lint     | ESLint flat config, typescript-eslint `strictTypeChecked` + `stylisticTypeChecked`                           | Biome                         | Type-aware rules (floating promises, unsafe `any`) need the TypeScript program; Biome does not offer them.                                                      |
| Format   | Prettier, data set excluded                                                                                  | Biome, dprint                 | Most widely known; the data set's formatting belongs to its generator.                                                                                          |
| Tests    | Vitest                                                                                                       | Jest, `node:test`             | Native ESM and TypeScript without a transform setup; Jest-compatible API.                                                                                       |
| Commits  | Conventional Commits, commitlint in a husky `commit-msg` hook and in CI                                      | Free-form                     | Readable history and a generated changelog (release-please).                                                                                                    |
| CI       | GitHub Actions, actions pinned by SHA, Dependabot for npm and actions                                        | Tags only                     | A moved tag cannot change what runs.                                                                                                                            |

## Consequences

- Every package builds with `tsc` to `dist/` and is type-checked and linted with the same base config.
- `pnpm check` runs exactly what CI runs.
- Moving to TypeScript 7 is a version bump once typescript-eslint supports it.
