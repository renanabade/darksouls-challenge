# 4. Difficulty budget and group handicap

- Status: accepted
- Date: 2026-10-20

## Context

The first generator (ADR 0003) changed only ranges and the number of orders with the difficulty. An easy challenge
could still draw the heaviest orders and curses, and an extreme one the lightest. Product decisions are now judged
by player profile (casual, average, advanced, tryhard, bored, competitive, friends of different skill): the casual
player and the tryhard were both served badly, and friends of different skill had no way to share one run.

## Decision

- **Weights on two axes.** Every order has a difficulty weight (1–3) and a friction weight (0–3); every
  restriction has a tier (light, medium, heavy). Hand-labelled first estimates, to recalibrate with played results.
- **Budget.** Easy and medium cap the average difficulty weight per order; friction has a ceiling by length.
  Candidates are shuffled with a weighted shuffle (Efraimidis–Spirakis) biased toward light orders on easy and heavy
  ones on hard and extreme, so the hard end gets heavy orders without always getting the same ones.
- **Layered curse.** The accumulated curse is built in layers, one per difficulty, each layer adding restrictions
  of the tiers that difficulty allows while they fit its budget. The curse grows harder boss by boss.
- **Group handicap.** `generateGroup` generates the structure once, for the hardest difficulty of the group, then
  eases each number for every other player by moving it to the same relative place in the easier range; the curse
  keeps its first layers. Every number is monotonic (a higher level cap, more deaths, attempts or points, fewer
  restrictions never make a run impossible), so the structure possible for the hardest player is possible for all.
  Each eased challenge is still validated.
- **0 deaths** is allowed on extreme and reads "Do not die".

| Considered                                         | Why not                                                                                  |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Generate each player's challenge from its own seed | Different orders for each player; the group is no longer playing the same run            |
| Search for a structure valid at every difficulty   | Not needed: monotonic numbers make the hardest difficulty the worst case                 |
| A curse sized by count                             | Four light restrictions are easier than two heavy ones; size does not measure difficulty |

## Consequences

- `GENERATOR_VERSION` is 2: every seed draws differently from version 1.
- The hardest player of a group gets exactly the solo challenge of that seed and difficulty.
- The manual defines the words that decide whether an order was broken (death, attempt, pick up, use, consumable),
  so players comparing runs read them the same way.
