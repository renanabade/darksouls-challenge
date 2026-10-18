# 2. Validating the data set at the boundary, by hand

- Status: accepted
- Date: 2026-10-18

## Context

The core reads `data/ds1`, which a separate pipeline generates. The files are trusted in intent but cross a process
and repository boundary, so a bad export must fail on load with a clear message, not deep inside the validator. Most
of the checks that matter are across files: a region id in an entrance, an item named in a requirement, the goal.

## Decision

`parseWorld` in `packages/core` turns the parsed JSON into a typed, read-only `World`, with hand-written checks and no
schema library. It collects every problem (shape and references) and throws one `WorldParseError` listing them all.
Reading the files stays outside the core, which has no I/O.

| Considered       | Why not                                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| zod (or valibot) | Covers shapes well, but the cross-file checks would still be hand-written; adds a dependency to the core.  |
| JSON Schema      | Could be shared with the Python pipeline, but needs a validator at runtime and still no cross-file checks. |
| Fail fast        | Simpler, but a broken export would take one pipeline run per problem.                                      |

## Consequences

- One style with `parseRequirement`, which was already hand-written.
- The loader keeps only the fields the core uses; new fields need a line in `parseWorld` and a test.
- If the API later needs schemas for its own input, zod can come in there without touching this decision.
