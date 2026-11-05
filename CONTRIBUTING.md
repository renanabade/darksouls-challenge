# Contributing

Thanks for your interest. This is a young project with one maintainer; issues and pull requests are welcome, and
small, focused changes are the easiest to review.

## Before you start

- **Bugs and wrong game facts:** open an issue with the template. For a game fact, say where it comes from (the game,
  a script, a test in play); facts are never taken from memory.
- **New orders or bigger changes:** open an issue first, so we can agree on the design before you write code.
- Everything in the repository is in English: code, docs, commit messages, issues.

## Development

Requires the .NET 10 SDK (see `global.json`).

```sh
dotnet build
dotnet test
dotnet format --verify-no-changes
```

The domain core (`src/DarkSoulsChallenge.Core`) is pure C# and reads no files itself, so it runs in the browser too. The README says what the server and browser tests need.

## The data set

`data/ds1/` must not be edited by hand. Its contract is `data/ds1/SCHEMA.md`. If a fact in it is wrong, open an issue
with the evidence.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/):

```
feat(core): validate closed merchants

Optional body explaining why, with lines of at most 100 characters.
```

Types in use: `feat`, `fix`, `docs`, `test`, `refactor`, `build`, `ci`, `chore`. Keep each commit to one change.

## Pull requests

1. Branch from `main` with a short name (`feat/core-reach`, `fix/data-boss-names`).
2. Keep the pull request to one topic. Fill in the template: what changed, why, and how it was tested.
3. CI must be green. Pull requests are merged by rebase, so every commit lands on `main` as written.

Architecture decisions are recorded in [`docs/adr/`](docs/adr). If your change makes one, add an ADR to the pull
request.

A change to what the generator draws bumps its version in the same pull request, and writes the new snapshot: run the tests once with `UPDATE_SNAPSHOTS=1`.

## Licenses

By contributing you agree that code is licensed under [MIT](LICENSE) and data under [CC BY-SA 4.0](data/LICENSE).
Do not add game files, game text (descriptions, dialogue) or code copied from other projects.
