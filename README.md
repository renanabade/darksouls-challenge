# darksouls-challenge

A challenge generator for Dark Souls: Remastered. It does not modify the game: it hands you a manual of orders —
self-imposed rules, told in the voice of a game master — and guarantees that every challenge it generates is
possible to finish.

> **Status:** early development. The game data set (`data/ds1/`) is done. The domain core validates every order of
> the static mode, and a command line generates challenges from a seed. Next: the API and the web front end.

## How it works

- **Orders** are the rules of a challenge ("never use a shield", "Gravelord Nito before the second bell").
- Every order is checked against a model of the game built from its own files: the progression graph, item
  locations, bosses, merchants and equipment. A challenge that cannot be finished is never generated.
- Same settings and same seed, same challenge.

## Repository layout

| Path             | What                                                                             |
| ---------------- | -------------------------------------------------------------------------------- |
| `data/ds1/`      | The Dark Souls: Remastered data set and its schema (`data/ds1/SCHEMA.md`)        |
| `packages/core/` | Domain core in pure TypeScript: world graph, order catalog, validator, generator |
| `packages/cli/`  | Command line that generates a challenge and prints its manual                    |
| `docs/adr/`      | Architecture decision records                                                    |

## Development

Requires Node 24 and pnpm (enabled with `corepack enable pnpm`).

```sh
pnpm install
pnpm check   # format, lint, typecheck, tests: the same as CI
pnpm build
```

Generate a challenge (prints its manual; `--json` for data):

```sh
pnpm generate --seed ashen-one --difficulty medium --length full
pnpm generate --seed ashen-one --class Knight --gift 2406 --level-cap 30
```

Difficulty: `easy`, `medium`, `hard`, `extreme`. Length: `short` (4–6 orders) or `full` (8–12). Class, starting
gift (row in `data/ds1/classes.json`) and soul level cap are drawn from the seed unless given.

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/), checked on commit. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the workflow, [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) and
[SECURITY.md](SECURITY.md).

## Licenses

- Code: [MIT](LICENSE).
- Data (`data/`): [CC BY-SA 4.0](data/LICENSE), with attribution in [`data/README.md`](data/README.md).

## Disclaimer

Not affiliated with or endorsed by FromSoftware or Bandai Namco. Dark Souls is a trademark of its owners. This
repository contains no game files or game text; only facts about the game (IDs, names, numbers).
