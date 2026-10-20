# 3. Static generator: seeded draw, validated as it goes

- Status: accepted
- Date: 2026-10-20

## Context

A static challenge is a full manual drawn from a seed. It must be possible to finish (every order validated
together), and the same settings and seed must give the same manual on any machine, forever.

## Decision

- **Own PRNG** (sfc32 seeded by FNV-1a hashes of seed + data version + generator version) instead of `Math.random`,
  which cannot be seeded. Every list is sorted before it is drawn from, so object key order never leaks in.
- **Draw and repair:** candidate orders are shuffled; each one gets parameters drawn from the game data and is kept
  only if the whole set still validates as comfortable. Failed parameters are redrawn a few times, then the order
  is left out. The validator stays the single source of truth, including conflicts between orders.
- **Generator in the core, I/O in a CLI package** (`packages/cli`): the core stays pure and testable; the CLI reads
  `data/ds1` and prints the manual.

| Considered                                  | Why not                                                                                                                                         |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Constraint solver for the draw (CP-SAT)     | The mods read for the project draw with weighted shuffles, not solvers; draw + validate is simpler and fast enough (about 170 ms per challenge) |
| Generate many full sets, keep a valid one   | Wastes work: one bad order spoils a whole set; adding one order at a time repairs locally                                                       |
| `Math.random` with a seeded wrapper library | One more dependency for a 40-line generator                                                                                                     |

## Consequences

- Phase C's test: 40 seeds over every difficulty and length, all valid, in the planned number of orders.
- Changing the drawing rules must bump `GENERATOR_VERSION`, so an old seed never silently changes meaning.
- Ranges (level caps, death counts, points) are first estimates, to tune by playing.
