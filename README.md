# darksouls-challenge

A challenge generator for Dark Souls: Remastered. It does not modify the game: it hands you a manual of orders,
self-imposed rules told in the voice of a game master, and guarantees that every challenge it generates is possible
to finish.

> **Status:** rewrite in C# and .NET in progress. The data set is in place; the domain core is being ported.

## How it works

- **Orders** are the rules of a challenge ("never use a shield", "Gravelord Nito before the second bell").
- Every order is checked against a model of the game: the progression graph, item locations, bosses, merchants and
  equipment. A challenge that cannot be finished is never generated.
- Same settings and same seed, same challenge.

## Repository layout

| Path                            | What                                            |
| ------------------------------- | ----------------------------------------------- |
| `data/ds1/`                     | The data set and its schema (`SCHEMA.md`)       |
| `src/DarkSoulsChallenge.Core/`  | Domain core in pure C#, with no I/O             |
| `tests/`                        | Tests                                           |
| `docs/adr/`                     | Architecture decision records                   |

## Development

Requires the .NET 10 SDK (see `global.json`).

```sh
dotnet build
dotnet test
dotnet format --verify-no-changes
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow, [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) and
[SECURITY.md](SECURITY.md).

## Licenses

- Code: [MIT](LICENSE).
- Data (`data/`): [CC BY-SA 4.0](data/LICENSE), with attribution in [`data/README.md`](data/README.md).

## Disclaimer

Not affiliated with or endorsed by FromSoftware or Bandai Namco. Dark Souls is a trademark of its owners. This
repository contains no game files or game text; only facts about the game (IDs, names, numbers).
