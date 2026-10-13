# darksouls-challenge

A challenge generator for Dark Souls: Remastered. It does not modify the game: it hands you a manual of orders —
self-imposed rules, told in the voice of a game master — and guarantees that every challenge it generates is
possible to finish.

> **Status:** early development. The game data set is done (`data/ds1/`); the domain core is next.

## How it works

- **Orders** are the rules of a challenge ("never use a shield", "Gravelord Nito before the second bell").
- Every order is checked against a model of the game built from its own files: the progression graph, item
  locations, bosses, merchants and equipment. A challenge that cannot be finished is never generated.
- Same settings and same seed, same challenge.

## Repository layout

| Path | What |
| --- | --- |
| `data/ds1/` | The Dark Souls: Remastered data set and its schema (`data/ds1/SCHEMA.md`) |

## Licenses

- Code: [MIT](LICENSE).
- Data (`data/`): [CC BY-SA 4.0](data/LICENSE), with attribution in [`data/README.md`](data/README.md).

## Disclaimer

Not affiliated with or endorsed by FromSoftware or Bandai Namco. Dark Souls is a trademark of its owners. This
repository contains no game files or game text; only facts about the game (IDs, names, numbers).
