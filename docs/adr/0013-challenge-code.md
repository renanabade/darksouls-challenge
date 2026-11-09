# 0013. One challenge code instead of a seed and settings

## Status

Accepted.

## Context

A seed alone did not identify a challenge: the same seed with another class, gift, difficulty or length gave another
one. A link had to carry every parameter, and it left out the data version, so a mismatch could go unnoticed.

## Decision

A challenge is shared as one code: `ds1.8.07-K39ZA00001`, the game, both versions and a payload. The payload is 50 bits in
Crockford base32, case-insensitive, so it survives being read aloud or typed: seed (24), level cap (10), gift (5), class
(4), curve (3), length (2), difficulty (2). A parameter left to the seed is stored as 0.

The generator draws from the seed's number, not its text. Digits are that number; any other text is hashed into it. So
every config has a code, and that code reproduces it: there are no challenges a code cannot reach.

Classes and gifts are stored by their place in the sorted list of the data set. That list can change with the data
version, but so can the challenge, and the code holds the version: a code from another version is read, and marked.

Group challenges stay on the CLI's `--players`: their extra difficulties do not fit the code, and a group shares the code
of the hardest player's challenge, which holds the structure.

## Consequences

- 24 bits give about 16 million seeds per combination of settings. Two players may draw the same one, and then simply play
  the same challenge.
- A typo gives another valid code. A checksum would catch it at the cost of longer codes; not worth it until someone
  actually mistypes one.
- Encoding lives in the core, so the CLI, the server and the site read codes the same way.
