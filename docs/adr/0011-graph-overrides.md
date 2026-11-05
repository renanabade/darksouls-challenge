# 11. The data graph is the DSAP export plus overrides that cite the game

- Status: accepted
- Date: 2026-10-23

## Context

The region graph comes from DSAP, a randomizer's approximation of the game. It does not model NPC or bonfire
state, it carries comfort rules, and the game's event scripts contradict it in places. Issue 38 listed the
gaps (E1 to E18). Some meant the generator could draw an order the game does not allow, such as "one bonfire:
Firelink" after both bells, when Lautrec has killed the Fire Keeper. The export pipeline stays private, so the
GPL tools and the extracted game files stay out of this repository. A hand edit to the exported JSON would be
lost at the next export, and nothing would say where it came from.

## Decision

- **Overrides next to the data.** `data/ds1/overrides.json` is the one hand-written file of the data set. The
  export applies it, in order, every time it runs: `add`, `remove`, `replace`, or `condition` (an extra
  requirement on an edge). A target that matches nothing, or more than one record, stops the export.
- **Every override cites the game.** Its `source` names an event, a flag, a talk script, a map, a param row, or
  an in-game test, never a private path. The product tests check that each override is applied to the exported
  files and cites the game.
- **State that changes reachability becomes graph structure; state that only changes conduct becomes data the
  manual shows.**
  - Boss gates are edges (the Bell Gargoyles, the Centipede Demon).
  - The Hydra, Dusk, Pendant and DLC chain is a chain of edges.
  - An entrance may name an item it must be crossed `before` (Quelana before the Bed of Chaos dies, Kaathe
    before the Lordvessel is placed).
  - Bonfires carry `unavailable` windows, and "one bonfire" names only bonfires with none.
  - Merchants carry `exclusive` stock (Domhnall's Ornstein or Smough set) and `leaves` (Rhea, Kaathe).
  - `warnings.json` holds what the manual tells the player about NPCs.
- **Mandatory bosses follow the setup.** The export reruns its removal analysis after the overrides, for a run
  with no starting item. The core computes what a run needs from its class and gift: the Thief's kit and the
  Master Key gift both make the Taurus Demon optional.
- **One version bump at the end.** `GENERATOR_VERSION` 6 and data 0.7.0 together, once every override is in.

| Considered                                                | Why not                                                                                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Hand edits to the exported JSON                           | Lost at the next export; no source per fix                                                                                                 |
| The export pipeline in this repository                    | Brings the GPL tools and the game's files with it; two pipelines to keep in step                                                           |
| Counting state in `reach()` (bosses killed, items bought) | The walk would no longer be a fixed point over sets; the windows that need counts (Rhea) never close a way, since the player can act first |
| A `not` in requirement expressions                        | Breaks the monotone walk; `before` asks the one question needed (is it open without the item?) and keeps it                                |
| Keeping a version 5 generator next to version 6           | Twice the code for old seeds; decided against in issue 38                                                                                  |

## Consequences

- Seeds give other challenges than with generator 5 and data 0.6.0. Shared seeds from before need the old
  release.
- ADR 0003 gains a rule: every order's target must be reachable for the challenge's setup. The validator rejects
  an order past a forbidden area, and `pointless()` asks `reach()`.
- `reach()` answers `before` with the walk itself when the item is not held yet, and otherwise walks the world
  without the item, once per item. Over six seeds, `generate()` took about 2.0 s, against 1.9 s before. An item
  among the starting items closes its entrances from the start.
- `before` items are checked independently, not jointly. Each entrance is asked whether it opens in the world
  without its own item. Two entrances that each open alone, but that no single order of play crosses both of,
  are both reached (pinned by a test in `reach.test.ts`). The graph's two cases (Quelana and the Bed of Chaos,
  Kaathe and the Lordvessel) do not interact this way. A future pair that does needs a joint check.
- Not modeled yet: upgrade levels (Quelana asks for the flame and an upgrader, not +10 and its materials), the
  Fire Keeper's return at Firelink, and an audit of every one-way edge (issue 38, step 10). Whether the other
  Anor Londo bonfires need an in-game check: no script ties them to the Darkmoon Knightess, and the Chamber of
  the Princess appears with Ornstein and Smough's death.
