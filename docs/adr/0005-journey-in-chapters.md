# 5. The challenge as a journey in chapters

- Status: accepted
- Date: 2026-10-21

## Context

Twenty generated challenges were read and played through on paper. They were shallow and alike: 4 to 12 loose
orders for a whole run, each about one area or boss drawn from the whole game, at one difficulty from the first
boss to the last. Some orders asked nothing ("wear what you find" in an area with no armor to pick up). The data
set covers every area, boss, item and merchant of the game, and the challenges used little of it.

## Decision

- **Chapters from the graph.** The run is cut at its milestones: the Asylum, the first bell, the second bell, the
  Lordvessel, each Lord Soul (in the drawn order of the Lord Souls, which is now always part of the challenge) and
  the Kiln. A region goes to the first chapter whose goal cannot be reached without it; any other region goes to
  the first chapter that reaches it from a placed region and in which it can be entered at all. Nothing is typed
  in by hand: the Catacombs land in Nito's chapter and the Painted World in the Lordvessel's because of the graph.
- **Rules of the journey and rules of each chapter.** A few orders rule the whole run (lives, curse, phase swap,
  levels, merchants, a forbidden area). Each chapter draws its own orders about its own areas and bosses, plus a
  new order, the chapter restriction (a restriction of the vocabulary from one milestone to the next).
- **A difficulty curve.** The chosen difficulty is the level a curve moves around: constant, rising, peaks or
  rollercoaster. Each chapter has an offset in steps; its orders take their numbers, budget and restriction tiers
  from its own level. A group shares the offsets, so the handicap still eases every number.
- **Three lengths.** Short keeps a handful of rules, full has one to three per chapter, epic three to five.
- **No order that asks nothing.** "Wear what you find" only where there is armor to pick up, "nothing from the
  ground" only where there are at least five pickups, "no bonfire" only where there is a bonfire, no level order
  when the cap is the class's level, no attempts that the run's deaths already limit more tightly, no chapter
  restriction the curse already holds.
- **Weapon orders one after the other.** Several orders may choose your weapon when one ends before the next can
  start (checked on the graph), and one build must wield every weapon they may hand you.

| Considered                                    | Why not                                                               |
| --------------------------------------------- | --------------------------------------------------------------------- |
| Chapters typed in by hand                     | Facts of the game outside the data; breaks when the graph changes     |
| Chapters by distance from the start (spheres) | Dark Souls opens early: most areas would land in the first chapters   |
| More orders per run, without chapters         | Longer lists of loose rules; no structure for the player or the curve |
| A difficulty per chapter drawn freely         | No shape the player can choose; a group could not share it            |

## Consequences

- `GENERATOR_VERSION` is 4. A challenge now carries its curve and its chapters; each order may name its chapter.
- The manual is laid out in chapters, with rules numbered across the whole manual.
- An epic journey validates the set dozens of times (about two seconds). Weight-only orders that nothing
  contradicts skip the incremental validation; the whole challenge is validated once more at the end.
- Chapter restrictions are validated as if they lasted the whole run (worst case): a possible challenge may be
  refused, an impossible one never accepted.
- The graph has no boss gates yet (data need G7): it lets the first bell ring without the Bell Gargoyles, and the
  run leave the Asylum without its Demon. The generator treats those bosses as required.
